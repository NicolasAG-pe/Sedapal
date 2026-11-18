'use strict';
// Entrada transitoria: el backend conserva negocio/Socket.IO y delega Auth.
// Sin AUTH_SERVICE_URL no cambia el monolito. Nunca hay fallback tras un fallo.
function isAuthRoute(method, pathname) {
    if (/^\/api\/auth(?:\/|$)/i.test(pathname)) return true;
    if (['GET', 'HEAD'].includes(method) && /^\/api\/(?:me\/perfil|perfil\/[^/]+)\/?$/i.test(pathname)) return true;
    return method === 'PATCH' && /^\/api\/admin\/(?:usuarios\/[^/]+\/estado|suministros\/[^/]+\/ubicacion)\/?$/i.test(pathname);
}

function configuration(env) {
    if (!env.AUTH_SERVICE_URL) return null;
    const url = new URL(env.AUTH_SERVICE_URL);
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
        !(url.protocol === 'https:' || (url.protocol === 'http:' &&
        (local || (env.NODE_ENV !== 'production' && env.AUTH_ALLOW_LOCAL_HTTP === '1'))))) {
        throw Error('Destino de Auth inválido.');
    }
    return { origin: url.origin };
}

function createGateway(config, { fetchImpl = fetch, afterMutation = async () => {} } = {}) {
    return async (req, res, next) => {
        if (!config) return next();
        let pathname;
        try { pathname = decodeURIComponent(req.path); } catch (_) { return res.sendStatus(400); }
        if (!isAuthRoute(req.method, pathname)) return next();
        const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
        res.set('Cache-Control', 'no-store');
        let upstream, data;
        try {
            const headers = { 'Content-Type': 'application/json', 'X-Forwarded-For': req.ip };
            for (const name of ['authorization', 'x-hidro-auth-contract', 'origin']) {
                if (req.headers[name]) headers[name] = req.headers[name];
            }
            upstream = await fetchImpl(config.origin + req.originalUrl, {
                method: req.method, headers, redirect: 'error', signal: AbortSignal.timeout(10000),
                ...(mutation && req.body !== undefined ? { body: JSON.stringify(req.body) } : {})
            });
            // No reenviar cabeceras hop-by-hop, cookies ni redirecciones internas.
            const chunks = []; let size = 0;
            for await (const chunk of upstream.body || []) {
                size += chunk.length;
                if (size > 3 * 1024 * 1024) throw Error('Respuesta excesiva.');
                chunks.push(Buffer.from(chunk));
            }
            data = Buffer.concat(chunks);
        } catch (_) {
            upstream = null;
        }
        // También ante timeout/respuesta perdida: Auth pudo confirmar el cambio.
        // Se espera antes de responder; una caída SQL desconecta preventivamente.
        if (mutation) await afterMutation({ method: req.method, pathname });
        if (!upstream) return res.status(503).json({ estado: 'error', codigo: 'AUTH_UNAVAILABLE', mensaje: 'Autenticación temporalmente no disponible.' });
        for (const name of ['content-type', 'retry-after', 'ratelimit-policy', 'ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset']) {
            const value = upstream.headers.get(name);
            if (value) res.set(name, value);
        }
        return res.status(upstream.status).send(data);
    };
}
module.exports = { configuration, isAuthRoute, createGateway };
