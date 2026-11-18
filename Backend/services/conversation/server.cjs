'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { createHash } = require('node:crypto');
const { createServer } = require('node:http');
const { simulatedProvider } = require('./provider.cjs');
const { listen } = require('../runtime.cjs');
const knowledge = require('../../../Frontend/assets/js/sedapal-knowledge.js');

const continuation = 'more';
const uuid4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const envelope = (status, code) => ({ status, code });

function sessionValidator(value) {
    const origin = new URL(value);
    if (origin.protocol !== 'http:' || origin.href !== origin.origin + '/' ||
        !['auth', 'localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) {
        throw Error('El servicio de conversación exige un Auth local.');
    }
    const url = new URL('/api/auth/session', origin);
    return async bearer => {
        const response = await fetch(url, {
            headers: { Authorization: bearer },
            redirect: 'error',
            signal: AbortSignal.timeout(1500)
        });
        if (!response.ok) {
            await response.body?.cancel();
            if (response.status === 401 || response.status === 403) return false;
            throw Error('Auth no disponible');
        }
        const { estado, usuario, suministro } = await response.json();
        return estado === 'ok' && usuario?.rol === 'usuario' && /^\d{9}$/.test(suministro?.numero_suministro || '');
    };
}

function createConversationService({
    validateSession, provider = simulatedProvider, now = Date.now, ttlMs = 5 * 60_000,
    maxConversations = 1000, maxInFlight = 8, providerMs = 750, sessionLimit = 12, ipLimit = 60
}) {
    const app = express();
    const conversations = new Map();
    let inFlight = 0;
    const reject = (res, status, code) => res.status(status).json(envelope('error', code));
    const limiter = (limit, options) => rateLimit({
        windowMs: 60_000, limit, standardHeaders: true, legacyHeaders: false,
        message: envelope('error', 'CHAT_RATE_LIMIT'), ...options
    });
    app.disable('x-powered-by');
    // Solo Gateway es vecino en la red privada. El control por sesión es independiente de la IP.
    app.set('trust proxy', 1);
    app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    app.get('/ready', (_req, res) => res.json({ status: 'ok', service: 'conversation' }));
    app.post('/api/chat', limiter(ipLimit), express.json({ limit: '1kb' }),
        async (req, res, next) => {
            const { version, conversationId, topic } = req.body || {};
            if (!req.is('application/json') || Object.keys(req.query).length || Object.keys(req.body || {}).length !== 3 ||
                version !== 1 || typeof conversationId !== 'string' || !uuid4.test(conversationId) ||
                typeof topic !== 'string' || topic.length > 40 || (topic !== continuation && !knowledge.get(topic))) {
                return reject(res, 400, 'CHAT_INVALID_REQUEST');
            }
            const bearer = req.get('authorization') || '';
            if (!/^Bearer [A-Za-z0-9._-]{1,4096}$/.test(bearer)) return reject(res, 401, 'CHAT_AUTH_REQUIRED');
            try {
                if (!await validateSession(bearer)) return reject(res, 403, 'CHAT_AUTH_REQUIRED');
            } catch (_) {
                return reject(res, 503, 'CHAT_AUTH_UNAVAILABLE');
            }
            req.sessionKey = createHash('sha256').update(bearer).digest('hex');
            return next();
        },
        limiter(sessionLimit, { keyGenerator: req => req.sessionKey }),
        async (req, res) => {
            const { conversationId, topic } = req.body;
            const key = req.sessionKey + ':' + conversationId;
            const timestamp = now();
            // El orden de inserción coincide con la expiración. No se guardan mensajes ni datos del suministro.
            for (const [id, entry] of conversations) {
                if (entry.expiresAt > timestamp) break;
                conversations.delete(id);
            }
            const followup = topic === continuation;
            const history = conversations.get(key)?.topics || [];
            const article = followup ? history.at(-1) : topic;
            if (!article) return res.json({ version: 1, mode: 'clarification' });

            conversations.delete(key);
            if (conversations.size >= maxConversations) conversations.delete(conversations.keys().next().value);
            conversations.set(key, { topics: [...history.slice(-3), article], expiresAt: timestamp + ttlMs });

            const variant = followup ? 'detail' : 'base';
            const variants = Object.freeze([variant, 'brief']);
            const fallback = () => res.json({ version: 1, mode: 'fallback', topic: article, variant });
            if (inFlight >= maxInFlight) return fallback();
            inFlight++;
            const controller = new AbortController();
            let timer;
            // Si un proveedor ignora la señal, conserva su plaza hasta que la operación realmente termine.
            const selection = Promise.resolve().then(() => provider.select(Object.freeze({
                topic: article, continuation: followup, variants
            }), { signal: controller.signal })).finally(() => { inFlight--; });
            try {
                const selected = await Promise.race([selection, new Promise(resolve => {
                    timer = setTimeout(() => { controller.abort(); resolve(null); }, providerMs);
                })]);
                if (!variants.includes(selected)) return fallback();
                const mode = provider.mode === 'gemini' ? 'gemini' : 'simulated';
                return res.json({ version: 1, mode, topic: article, variant: selected });
            } catch (_) {
                return fallback();
            } finally {
                clearTimeout(timer);
            }
        });
    app.use((error, _req, res, _next) => {
        if (error.type === 'entity.too.large') return reject(res, 413, 'CHAT_REQUEST_TOO_LARGE');
        if (error.status === 400 || error.status === 415) return reject(res, 400, 'CHAT_INVALID_REQUEST');
        return reject(res, 503, 'CHAT_UNAVAILABLE');
    });
    return app;
}

if (require.main === module) {
    const app = createConversationService({ validateSession: sessionValidator(process.env.CHAT_AUTH_URL) });
    const server = createServer(app);
    listen('conversation', server, Number(process.env.PORT || 3110), () => new Promise(resolve => server.close(resolve)));
}

module.exports = { createConversationService, sessionValidator };
