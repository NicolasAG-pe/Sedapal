'use strict';
// Contrato interno MS-03: introspección de sesión de Auth (docs/microservices/04).
// Mismo esquema HMAC que notification-transport, con secreto exclusivo por pareja
// de servicios. El cliente realiza UN intento; sin confirmación devuelve null y
// cada consumidor aplica fail-closed por sí mismo (nunca autoriza por ausencia).
const crypto = require('node:crypto');
const PATH = '/internal/v1/auth/introspect';

function key(value) {
    if (typeof value !== 'string' || Buffer.byteLength(value) < 32) throw Error('Clave interna insuficiente.');
    return value;
}
function signature(secret, timestamp, nonce, body) {
    return crypto.createHmac('sha256', secret).update(`POST\n${PATH}\n${timestamp}\n${nonce}\n${body}`).digest('hex');
}
function configuration(env) {
    const url = new URL(env.AUTH_INTROSPECTION_URL);
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
        !(url.protocol === 'https:' || (url.protocol === 'http:' &&
          (local || (env.NODE_ENV !== 'production' && env.AUTH_ALLOW_LOCAL_HTTP === '1'))))) {
        throw Error('Destino interno inválido.');
    }
    const secret = key(env.AUTH_INTERNAL_SECRET);
    if ([env.AUTH_TOKEN_SECRET, env.EMAIL_OTP_SECRET, env.EMAIL_OUTBOX_KEY].includes(secret)) {
        throw Error('Clave interna debe ser exclusiva.');
    }
    return { url: url.origin, secret };
}
// Identidad pública: nunca clave_hash, OTP, correo ni material de cifrado.
// PostgreSQL devuelve BIGINT como texto: se normaliza a número entero aquí,
// en un único punto del contrato.
function identidad(row) {
    const numero = v => (v === null || v === undefined || v === '') ? null : Number(v);
    return { id_usuario: numero(row.id_usuario), id_suministro: numero(row.id_suministro),
        numero_suministro: row.numero_suministro === undefined ? null : row.numero_suministro,
        rol: row.rol, mfa_version: Number(row.mfa_version || 0), mfa_activo: !!row.mfa_activo };
}
function createIntrospector(config, { fetchImpl = fetch } = {}) {
    return async token => {
        if (typeof token !== 'string' || token.length > 4096) return null;
        const timestamp = String(Date.now()), nonce = crypto.randomUUID();
        const body = JSON.stringify({ version: 1, token });
        try {
            // Un único intento, sin redirecciones; el estado durable es de Auth.
            const r = await fetchImpl(config.url + PATH, { method: 'POST', redirect: 'error',
                headers: { 'Content-Type': 'application/json', 'X-Hidro-Time': timestamp, 'X-Hidro-Nonce': nonce,
                    'X-Hidro-Signature': signature(config.secret, timestamp, nonce, body) },
                body, signal: AbortSignal.timeout(5000) });
            if (r.status !== 200) { await r.body?.cancel(); return null; }
            const reader = r.body.getReader(); let size = 0; const chunks = [];
            for (;;) { const { done, value } = await reader.read(); if (done) break;
                size += value.length; if (size > 1024) { await reader.cancel(); return null; }
                chunks.push(Buffer.from(value)); }
            const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            return data && data.version === 1 && data.vigente === true && data.identidad &&
                Number.isInteger(data.identidad.id_usuario) && ['usuario', 'admin'].includes(data.identidad.rol)
                ? data.identidad : null;
        } catch (_) { return null; }
    };
}
module.exports = { PATH, key, signature, configuration, identidad, createIntrospector };
