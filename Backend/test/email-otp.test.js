'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { crearCodigo, coincideCodigo, OTP_TTL_SECONDS } = require('../email-otp');
const secreto = crypto.randomBytes(32).toString('hex');

test('código de seis dígitos con HMAC, ligado a solicitud y secreto', () => {
    assert.equal(OTP_TTL_SECONDS, 5 * 60);
    const id = crypto.randomUUID();
    const { codigo, hash } = crearCodigo(id, secreto);
    assert.match(codigo, /^\d{6}$/);
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.ok(coincideCodigo(id, codigo, hash, secreto));
    assert.equal(coincideCodigo(crypto.randomUUID(), codigo, hash, secreto), false);
    assert.equal(coincideCodigo(id, codigo, hash, crypto.randomBytes(32).toString('hex')), false);
    assert.equal(coincideCodigo(id, (Number(codigo) + 1).toString().padStart(6, '0'), hash, secreto), false);
});

test('rechaza entradas malformadas y secretos débiles sin revelarlos', () => {
    const id = crypto.randomUUID();
    const { hash } = crearCodigo(id, secreto);
    for (const codigo of [null, 123456, '12345', '1234567', 'abcdef', {}, ['123456']]) {
        assert.equal(coincideCodigo(id, codigo, hash, secreto), false);
    }
    for (const hashInvalido of ['', 'a', 'z'.repeat(64), null]) {
        assert.equal(coincideCodigo(id, '123456', hashInvalido, secreto), false);
    }
    assert.throws(() => crearCodigo(id, 'corto'), error => !error.message.includes('corto'));
});
