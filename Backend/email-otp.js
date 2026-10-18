'use strict';

const crypto = require('node:crypto');
const OTP_TTL_SECONDS = 600;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_SENDS_HOUR = 3;
const REGISTRATION_TTL_SECONDS = 3600;

function validarSecreto(secreto) {
    if (typeof secreto !== 'string' || Buffer.byteLength(secreto) < 32) {
        throw new Error('EMAIL_OTP_SECRET debe tener al menos 32 bytes.');
    }
}

function hashCodigo(id, codigo, secreto) {
    validarSecreto(secreto);
    return crypto.createHmac('sha256', secreto).update(`${id}:${codigo}`).digest('hex');
}

function crearCodigo(id, secreto) {
    const codigo = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
    return { codigo, hash: hashCodigo(id, codigo, secreto) };
}

function coincideCodigo(id, codigo, hash, secreto) {
    if (typeof codigo !== 'string' || !/^\d{6}$/.test(codigo) ||
        typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) return false;
    return crypto.timingSafeEqual(Buffer.from(hashCodigo(id, codigo, secreto), 'hex'), Buffer.from(hash, 'hex'));
}

module.exports = { crearCodigo, coincideCodigo, validarSecreto, OTP_TTL_SECONDS,
    OTP_MAX_ATTEMPTS, OTP_RESEND_SECONDS, OTP_MAX_SENDS_HOUR, REGISTRATION_TTL_SECONDS };
