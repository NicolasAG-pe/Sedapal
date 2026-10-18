'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { obtenerConfigCorreo, crearRemitente } = require('../resend-mail');
const env = { RESEND_API_KEY: 'fixture-provider-key', RESEND_FROM: 'Hidro-Mejora <correo@example.invalid>',
    EMAIL_OTP_SECRET: crypto.randomBytes(32).toString('hex') };
const datos = { correo: 'cliente@example.invalid', codigo: '001234', envioId: crypto.randomUUID() };

test('configuración ausente deshabilita el envío; rechaza secreto compartido o remitente inválido', () => {
    assert.equal(obtenerConfigCorreo({}), null);
    assert.equal(crearRemitente(null), null);
    assert.throws(() => obtenerConfigCorreo({ ...env, EMAIL_OTP_SECRET: 'corto' }));
    assert.throws(() => obtenerConfigCorreo({ ...env, AUTH_TOKEN_SECRET: env.EMAIL_OTP_SECRET }));
    assert.throws(() => obtenerConfigCorreo({ ...env, RESEND_FROM: 'correo@example.invalid\r\nBcc: otro@example.invalid' }));
});

test('envía texto y HTML accesible por HTTPS; reintento conserva cuerpo e idempotencia', async () => {
    const calls = [];
    const enviar = crearRemitente(obtenerConfigCorreo(env), { sleep: async () => {}, fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return calls.length === 1 ? new Response('', { status: 503 }) : Response.json({ id: 'fixture-id' });
    } });
    await enviar(datos);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://api.resend.com/emails');
    assert.equal(calls[0].options.redirect, 'error');
    assert.equal(calls[0].options.body, calls[1].options.body);
    assert.equal(calls[0].options.headers['Idempotency-Key'], calls[1].options.headers['Idempotency-Key']);
    const body = JSON.parse(calls[0].options.body);
    assert.deepEqual(body.to, [datos.correo]);
    assert.match(body.text, /001234/);
    assert.match(body.html, /lang="es"/);
    assert.ok(calls[0].options.signal instanceof AbortSignal);
});

test('errores permanentes no se reintentan ni divulgan información del proveedor', async () => {
    let calls = 0;
    const enviar = crearRemitente(obtenerConfigCorreo(env), { fetchImpl: async () => {
        calls++;
        return Response.json({ message: env.RESEND_API_KEY + datos.correo + datos.codigo }, { status: 403 });
    } });
    await assert.rejects(enviar(datos), error => error.code === 'EMAIL_DELIVERY_FAILED' &&
        ![env.RESEND_API_KEY, datos.correo, datos.codigo].some(valor => error.message.includes(valor)));
    assert.equal(calls, 1);
});

test('timeout, red y cuota limitan reintentos y generan error seguro', async () => {
    for (const fallo of ['timeout', 'network', 'quota', 'invalid-json']) {
        let calls = 0;
        const enviar = crearRemitente(obtenerConfigCorreo(env), { timeoutMs: 5, sleep: async () => {},
            fetchImpl: async (_url, options) => {
                calls++;
                if (fallo === 'quota') return new Response('', { status: 429 });
                if (fallo === 'invalid-json') return Response.json({});
                if (fallo === 'timeout') {
                    await new Promise(resolve => setTimeout(resolve, 10));
                    options.signal.throwIfAborted();
                }
                throw new Error(env.RESEND_API_KEY);
            } });
        await assert.rejects(enviar(datos), { code: 'EMAIL_DELIVERY_FAILED' });
        assert.equal(calls, fallo === 'invalid-json' ? 1 : 2);
    }
});
