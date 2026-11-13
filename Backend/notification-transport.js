'use strict';
const crypto = require('node:crypto');
const PATH = '/internal/v1/email/deliver';
const TYPES = ['transitorio', 'permanente', 'ambiguo', 'caducado'];
function key(value) {
    if (typeof value !== 'string' || Buffer.byteLength(value) < 32) throw Error('Clave interna insuficiente.');
    return value;
}
function signature(secret, timestamp, nonce, body) {
    return crypto.createHmac('sha256', secret).update(`POST\n${PATH}\n${timestamp}\n${nonce}\n${body}`).digest('hex');
}
function configuration(env) {
    const url = new URL(env.NOTIFICATIONS_URL);
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
        !(url.protocol === 'https:' || (url.protocol === 'http:' &&
          (local || (env.NODE_ENV !== 'production' && env.NOTIFICATIONS_ALLOW_LOCAL_HTTP === '1'))))) {
        throw Error('Destino interno inválido.');
    }
    const secret = key(env.NOTIFICATIONS_INTERNAL_SECRET);
    if ([env.AUTH_TOKEN_SECRET, env.EMAIL_OTP_SECRET, env.EMAIL_OUTBOX_KEY].includes(secret)) throw Error('Clave interna debe ser exclusiva.');
    return { url: url.origin, secret };
}
function outcome(value) {
    if (value && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 120) return { id: value.id };
    if (!value || !TYPES.includes(value.tipo)) return { tipo: 'ambiguo' };
    return { tipo: value.tipo, retryAfter: Math.min(300, Math.max(0, Number(value.retryAfter) || 0)) };
}
function createSender(config, provider, { fetchImpl = fetch } = {}) {
    return async ({ mensaje, envioId, enviarHasta, limiteMonotono = Infinity }) => {
        const finish = value => { if (value.id) return value;
            throw Object.assign(Error('Entrega interna no confirmada.'), { tipo: value.tipo, retryAfter: value.retryAfter }); };
        const remaining = Math.min(new Date(enviarHasta).getTime() - Date.now(), limiteMonotono - performance.now(), 10000);
        if (!Number.isFinite(remaining) || remaining <= 0) return finish({ tipo: 'caducado' });
        const timestamp = String(Date.now()), nonce = crypto.randomUUID();
        const body = JSON.stringify({ version: 1, provider, mensaje, envioId, deadline: Date.now() + Math.floor(remaining) });
        let result = { tipo: 'ambiguo' };
        try {
            // Un único intento: la outbox del propietario decide el siguiente paso.
            const r = await fetchImpl(config.url + PATH, { method: 'POST', redirect: 'error',
                headers: { 'Content-Type': 'application/json', 'X-Hidro-Time': timestamp, 'X-Hidro-Nonce': nonce,
                    'X-Hidro-Signature': signature(config.secret, timestamp, nonce, body) },
                body, signal: AbortSignal.timeout(Math.max(1, Math.floor(remaining))) });
            if (r.status !== 200) { await r.body?.cancel(); }
            else {
            // Limitar también la respuesta; no registrar cuerpos internos.
            const reader = r.body.getReader(); let size = 0; const chunks = [];
            for (;;) { const { done, value } = await reader.read(); if (done) break;
                size += value.length; if (size > 1024) { await reader.cancel(); throw Error(); } chunks.push(Buffer.from(value)); }
            result = outcome(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            }
        } catch (_) { /* Respuesta perdida: nunca inferir ausencia de entrega. */ }
        return finish(result);
    };
}
module.exports = { PATH, TYPES, key, signature, configuration, outcome, createSender };
