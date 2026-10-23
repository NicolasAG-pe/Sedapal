'use strict';
const crypto = require('node:crypto');

function obtenerClaveOutbox(env = process.env) {
    const raw = env.EMAIL_OUTBOX_KEY;
    if (typeof raw !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(raw)) throw new Error('Configura EMAIL_OUTBOX_KEY independiente de 32 bytes en base64.');
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32 || key.toString('base64') !== raw) throw new Error('Clave outbox inválida.');
    for (const secret of [env.EMAIL_OTP_SECRET, env.AUTH_TOKEN_SECRET].filter(Boolean)) {
        const variants = [Buffer.from(secret)];
        if (/^[a-f0-9]{64}$/i.test(secret)) variants.push(Buffer.from(secret, 'hex'));
        if (/^[A-Za-z0-9+/]{43}=$/.test(secret)) variants.push(Buffer.from(secret, 'base64'));
        if (raw === secret || variants.some(value => value.equals(key))) throw new Error('La clave outbox debe ser exclusiva.');
    }
    return key;
}
function cifrarMensaje(mensaje, key, id, registro) {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(`hidro-outbox-v1:${id}:${registro}`));
    const encrypted = Buffer.concat([cipher.update(mensaje, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}
function descifrarMensaje(payload, key, id, registro) {
    if (!Buffer.isBuffer(payload) || payload.length < 29 || payload.length > 16384) throw new Error('Payload inválido.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
    decipher.setAAD(Buffer.from(`hidro-outbox-v1:${id}:${registro}`));
    decipher.setAuthTag(payload.subarray(12, 28));
    return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8');
}
const idClave = key => crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
module.exports = { obtenerClaveOutbox, cifrarMensaje, descifrarMensaje, idClave };
