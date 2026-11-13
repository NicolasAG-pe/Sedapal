'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const { PATH, key, signature, outcome } = require('../../notification-transport');
const { configurarProveedorWorker, crearRemitenteProveedor } = require('../../email-provider');
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);

function createService({ secret, provider, send, maxConcurrent = 16 }) {
    key(secret);
    if (!['resend', 'gmail'].includes(provider) || typeof send !== 'function') throw Error('Configuración Notifications inválida.');
    const seen = new Map(); let active = 0, stopping = false;
    const reply = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    const server = http.createServer(async (req, res) => {
        try {
            if (req.method === 'GET' && ['/live', '/ready'].includes(req.url)) {
                return reply(res, stopping ? 503 : 200, { service: 'notifications', status: stopping ? 'stopping' : 'ok' });
            }
            if (req.method !== 'POST' || req.url !== PATH) return reply(res, 404, { error: 'not_found' });
            if (stopping || active >= maxConcurrent) return reply(res, 503, { error: 'unavailable' });
            active++;
            try {
                const timestamp = req.headers['x-hidro-time'], nonce = req.headers['x-hidro-nonce'], mac = req.headers['x-hidro-signature'];
                if (!/^\d{13}$/.test(timestamp || '') || Math.abs(Date.now() - Number(timestamp)) > 30000 || !uuid(nonce) || !/^[a-f0-9]{64}$/.test(mac || '')) return reply(res, 401, { error: 'unauthorized' });
                let size = 0; const chunks = [];
                for await (const chunk of req) { size += chunk.length; if (size > 24576) { reply(res, 413, { error: 'too_large' }); req.resume(); return; } chunks.push(chunk); }
                const body = Buffer.concat(chunks).toString('utf8');
                if (!crypto.timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(signature(secret, timestamp, nonce, body), 'hex'))) return reply(res, 401, { error: 'unauthorized' });
                for (const [id, expires] of seen) if (expires < Date.now()) seen.delete(id);
                if (seen.has(nonce)) return reply(res, 409, { error: 'replay' });
                if (seen.size >= 10000) return reply(res, 503, { error: 'unavailable' });
                seen.set(nonce, Number(timestamp) + 30001);
                let job; try { job = JSON.parse(body); } catch { return reply(res, 400, { error: 'invalid' }); }
                if (job.version !== 1 || job.provider !== provider || !uuid(job.envioId) || typeof job.mensaje !== 'string' || Buffer.byteLength(job.mensaje) > 16384 || !Number.isSafeInteger(job.deadline) || job.deadline > Date.now() + 10000) return reply(res, 400, { error: 'invalid' });
                const remaining = job.deadline - Date.now();
                if (remaining <= 0) return reply(res, 200, { tipo: 'caducado' });
                let result;
                try { result = await send({ mensaje: job.mensaje, envioId: job.envioId,
                    enviarHasta: new Date(job.deadline), limiteMonotono: performance.now() + remaining }); }
                catch (error) { result = { tipo: error.tipo, retryAfter: error.retryAfter }; }
                return reply(res, 200, outcome(result));
            } finally { active--; }
        } catch (_) { if (!res.headersSent) reply(res, 400, { error: 'invalid' }); else res.destroy(); }
    });
    server.requestTimeout = 15000; server.headersTimeout = 10000;
    return { server, stop: () => { stopping = true; return new Promise(resolve => server.close(resolve)); } };
}

function fromEnvironment(env) {
    const secret = key(env.NOTIFICATIONS_INTERNAL_SECRET);
    const provider = env.EMAIL_PROVIDER || 'resend';
    if (['DATABASE_URL', 'POSTGRES_PASSWORD', 'AUTH_TOKEN_SECRET', 'EMAIL_OTP_SECRET', 'EMAIL_OUTBOX_KEY', 'EMAIL_WORKER_DATABASE_URL'].some(k => env[k])) throw Error('Notifications no debe recibir credenciales del dominio.');
    let send;
    if (env.NOTIFICATIONS_DELIVERY_MODE === 'stub' && env.NODE_ENV !== 'production') {
        send = async job => {
            const message = JSON.parse(job.mensaje);
            if (!Array.isArray(message.to) || message.to.length !== 1 || !/@[^@\s]+\.invalid$/.test(message.to[0])) return { tipo: 'permanente' };
            return { id: 'stub-' + job.envioId };
        };
    } else {
        if (env.NOTIFICATIONS_DELIVERY_MODE !== 'provider' || env.NOTIFICATIONS_REAL_DELIVERY_ALLOWED !== '1' || env.NOTIFICATIONS_URL) throw Error('Entrega real no habilitada.');
        send = crearRemitenteProveedor(configurarProveedorWorker(env));
    }
    return createService({ secret, provider, send });
}
if (require.main === module) {
    try {
        const port = Number(process.env.PORT || 3104);
        if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error();
        const service = fromEnvironment(process.env);
        service.server.on('error', () => { console.error(JSON.stringify({ service: 'notifications', event: 'listen_error' })); process.exitCode = 1; });
        service.server.listen(port, '0.0.0.0', () => {
            console.log(JSON.stringify({ service: 'notifications', event: 'ready' }));
            if (process.send) process.send({ event: 'ready', port });
        });
        const stop = () => { const timer = setTimeout(() => process.exit(1), 20000); timer.unref();
            service.stop().then(() => { clearTimeout(timer); process.exit(0); }); };
        process.once('SIGTERM', stop); process.once('SIGINT', stop);
    } catch (_) { console.error(JSON.stringify({ service: 'notifications', event: 'configuration_error' })); process.exitCode = 1; }
}
module.exports = { createService, fromEnvironment };
