'use strict';
const fs = require('node:fs');
const { construirMensaje } = require('./resend-mail');
const SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TOKEN_INFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const mailbox = value => typeof value === 'string' && /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value);
function validarRemitente(sender) {
    if (!mailbox(sender) || !/@(?:gmail|googlemail)\.com$/i.test(sender)) throw new Error('Configura un remitente Gmail autorizado.');
    return sender.toLowerCase();
}
function leerJsonPrivado(file) {
    let fd;
    try {
        fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.size > 65536 || (stat.mode & 0o077) ||
            (process.getuid && stat.uid !== process.getuid())) throw new Error();
        return JSON.parse(fs.readFileSync(fd, 'utf8'));
    } catch (_) { throw new Error('Archivo OAuth privado inválido; revisar ruta, propietario y permisos 0600.'); }
    finally { if (fd !== undefined) fs.closeSync(fd); }
}
function validarCredenciales(data, sender) {
    if (data.type !== 'authorized_user' || data.scope !== SCOPE || data.sender !== sender ||
        typeof data.client_id !== 'string' || !data.client_id.endsWith('.apps.googleusercontent.com') ||
        !data.client_secret || !data.refresh_token || data.client_type !== 'desktop' || data.account_verified !== true ||
        !['tokeninfo_email', 'tokeninfo_subject'].includes(data.account_check)) throw new Error('Credenciales Gmail incompatibles.');
    return data;
}
function fallo(tipo, retryAfter = 0) {
    return Object.assign(new Error('No se pudo enviar el código. Revisar el proveedor privadamente.'),
        { code: 'EMAIL_DELIVERY_FAILED', tipo, retryAfter });
}
function crearMime(mensaje, envioId, sender) {
    const m = JSON.parse(mensaje);
    if (m.from !== sender || !Array.isArray(m.to) || m.to.length !== 1 || !mailbox(m.to[0]) ||
        typeof m.subject !== 'string' || !m.subject || m.subject.length > 200 || /[\r\n]/.test(m.subject) ||
        typeof m.text !== 'string' || typeof m.html !== 'string') throw new Error('Mensaje Gmail inválido.');
    const boundary = 'hm_' + envioId.replaceAll('-', '');
    const base64 = value => Buffer.from(value).toString('base64').match(/.{1,76}/g)?.join('\r\n') || '';
    return [`From: Hidro-Mejora <${sender}>`, `To: ${m.to[0]}`, `Date: ${new Date().toUTCString()}`,
        `Subject: =?UTF-8?B?${Buffer.from(m.subject).toString('base64')}?=`,
        `Message-ID: <${envioId}@hidro-mejora.invalid>`, 'MIME-Version: 1.0',
        `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
        `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', base64(m.text),
        `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', base64(m.html),
        `--${boundary}--`, ''].join('\r\n');
}
function crearRemitenteGmail({ sender, credentials }, { fetchImpl = fetch, timeoutMs = 10000 } = {}) {
    sender = validarRemitente(sender); validarCredenciales(credentials, sender);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw new Error('Timeout Gmail inválido.');
    let cached, refreshing;
    async function accessToken(signal) {
        if (cached && cached.expires > Date.now() + 60000) return cached.token;
        if (refreshing) return refreshing;
        refreshing = (async () => {
            let r;
            try {
                r = await fetchImpl(TOKEN_URL, { method: 'POST', redirect: 'error', signal,
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: credentials.client_id,
                        client_secret: credentials.client_secret, refresh_token: credentials.refresh_token }).toString() });
            } catch (_) { throw fallo('transitorio'); } // Todavía no hubo intento de envío.
            if (!r.ok) { await r.body?.cancel(); throw fallo(r.status === 429 || r.status >= 500 ? 'transitorio' : 'permanente'); }
            let data;
            try { data = await r.json(); } catch (_) { throw fallo('transitorio'); }
            if (typeof data.access_token !== 'string' || !data.access_token || !Number.isFinite(data.expires_in) || data.expires_in <= 0 ||
                (data.scope !== undefined && data.scope !== SCOPE)) throw fallo('permanente');
            cached = { token: data.access_token, expires: Date.now() + Math.min(data.expires_in, 3600) * 1000 };
            return cached.token;
        })();
        try { return await refreshing; } finally { refreshing = undefined; }
    }
    return async function enviarCodigo({ mensaje, correo, codigo, envioId, enviarHasta, limiteMonotono = Infinity }) {
        if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(envioId) ||
            (mensaje === undefined && !/^\d{6}$/.test(codigo))) throw fallo('permanente');
        const deadline = enviarHasta === undefined ? Infinity : new Date(enviarHasta).getTime();
        if (Number.isNaN(deadline) || typeof limiteMonotono !== 'number' || Number.isNaN(limiteMonotono)) throw fallo('permanente');
        const remaining = () => Math.min(deadline - Date.now(), limiteMonotono - performance.now());
        const signal = () => { if (remaining() <= 0) throw fallo('caducado'); return AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, Math.floor(remaining())))); };
        let raw;
        try {
            const body = mensaje ?? construirMensaje(sender, correo, codigo);
            if (typeof body !== 'string' || Buffer.byteLength(body) > 16384) throw new Error();
            raw = Buffer.from(crearMime(body, envioId, sender)).toString('base64url');
        } catch (_) { throw fallo('permanente'); }
        const token = await accessToken(signal()); // Renovar OAuth nunca envía correo.
        let response;
        try {
            // userId explícito: un token de otra cuenta no debe enviar como el remitente esperado.
            response = await fetchImpl(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(sender)}/messages/send`, {
                method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ raw }), signal: signal() });
        } catch (e) { if (e.tipo === 'caducado') throw e; throw fallo('ambiguo'); }
        if (response.ok) {
            let data; try { data = await response.json(); } catch (_) { throw fallo('ambiguo'); }
            if (typeof data.id !== 'string' || !data.id || data.id.length > 120) throw fallo('ambiguo');
            return { estado: 'aceptado', id: data.id };
        }
        const retryAfter = Math.min(300, Math.max(0, Number(response.headers?.get('Retry-After')) || 0));
        if (response.status === 429) { await response.body?.cancel(); throw fallo('transitorio', retryAfter || 60); }
        if (response.status === 401) { cached = undefined; await response.body?.cancel(); throw fallo('transitorio', 5); }
        if (response.status >= 500 || response.status === 408) { await response.body?.cancel(); throw fallo('ambiguo'); }
        if (response.status === 403) {
            let data; try { data = await response.json(); } catch (_) { throw fallo('permanente'); }
            const reason = data?.error?.errors?.[0]?.reason;
            throw fallo(['rateLimitExceeded', 'userRateLimitExceeded', 'dailyLimitExceeded'].includes(reason) ? 'transitorio' : 'permanente', retryAfter || 60);
        }
        await response.body?.cancel(); throw fallo('permanente');
    };
}
module.exports = { SCOPE, TOKEN_URL, TOKEN_INFO_URL, validarRemitente, leerJsonPrivado, validarCredenciales, crearMime, crearRemitenteGmail };
