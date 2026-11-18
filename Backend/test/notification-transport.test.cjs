'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createService, fromEnvironment } = require('../services/notifications/server.cjs');
const { createSender, signature, PATH, configuration } = require('../notification-transport');
const { configurarProveedorWorker, crearRemitenteProveedor } = require('../email-provider');
const secret = crypto.randomBytes(32).toString('hex');
const job = () => ({ mensaje: JSON.stringify({ to: ['fixture@example.invalid'], text: 'synthetic' }), envioId: crypto.randomUUID(), enviarHasta: new Date(Date.now() + 5000), limiteMonotono: performance.now() + 5000 });
async function start(t, options = {}) {
    const service = createService({ secret, provider: 'resend', send: async () => ({ id: 'fixture' }), ...options });
    await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
    t.after(() => service.stop());
    return { ...service, url: 'http://127.0.0.1:' + service.server.address().port };
}
test('Contrato remoto autenticado; trabajador no necesita credencial de proveedor', async t => {
    const s = await start(t);
    const config = configurarProveedorWorker({ NOTIFICATIONS_URL: s.url, NOTIFICATIONS_INTERNAL_SECRET: secret });
    assert.equal(config.apiKey, undefined);
    assert.deepEqual(await crearRemitenteProveedor(config)(job()), { id: 'fixture' });
    assert.equal((await fetch(s.url + '/ready')).status, 200);
    assert.equal((await fetch(s.url + PATH, { method: 'POST', body: '{}' })).status, 401);
});
test('Rechaza firma alterada, replay, proveedor incorrecto y trabajo vencido antes de entregar', async t => {
    let calls = 0; const s = await start(t, { send: async () => { calls++; return { id: 'fixture' }; } });
    const request = (value, changes = {}) => {
        const body = JSON.stringify(value), timestamp = String(Date.now()), nonce = crypto.randomUUID();
        return { method: 'POST', body, headers: { 'X-Hidro-Time': timestamp, 'X-Hidro-Nonce': nonce,
            'X-Hidro-Signature': signature(secret, timestamp, nonce, body), ...changes } };
    };
    const value = { ...job(), version: 1, provider: 'resend', deadline: Date.now() + 5000 };
    const signed = request(value);
    assert.equal((await fetch(s.url + PATH, signed)).status, 200);
    assert.equal((await fetch(s.url + PATH, signed)).status, 409);
    assert.equal((await fetch(s.url + PATH, request(value, { 'X-Hidro-Signature': '0'.repeat(64) }))).status, 401);
    assert.equal((await fetch(s.url + PATH, request({ ...value, provider: 'gmail' }))).status, 400);
    assert.deepEqual(await (await fetch(s.url + PATH, request({ ...value, deadline: Date.now() - 1 }))).json(), { tipo: 'caducado' });
    assert.equal(calls, 1);
});
test('Preserva errores de proveedor saneados y no reintenta fallo de red', async t => {
    const s = await start(t, { send: async () => { throw Object.assign(Error('private-provider-body'), { tipo: 'transitorio', retryAfter: 600 }); } });
    await assert.rejects(createSender({ url: s.url, secret }, 'resend')(job()), { tipo: 'transitorio', retryAfter: 300 });
    let calls = 0;
    const send = createSender({ url: s.url, secret }, 'gmail', { fetchImpl: async () => { calls++; throw Error('private'); } });
    await assert.rejects(send(job()), { tipo: 'ambiguo' }); assert.equal(calls, 1);
    await assert.rejects(send({ ...job(), limiteMonotono: 0 }), { tipo: 'caducado' }); assert.equal(calls, 1);
});
test('Modo anterior intacto y configuración fail-closed', () => {
    assert.deepEqual(configurarProveedorWorker({ RESEND_API_KEY: 'synthetic' }), { provider: 'resend', apiKey: 'synthetic' });
    for (const env of [
        { NOTIFICATIONS_URL: 'http://external.invalid', NODE_ENV: 'production' },
        { NOTIFICATIONS_URL: 'https://user:secret@example.invalid' },
        { NOTIFICATIONS_URL: 'https://example.invalid/path' },
        { NOTIFICATIONS_URL: 'https://example.invalid', AUTH_TOKEN_SECRET: secret }
    ]) assert.throws(() => configuration({ NOTIFICATIONS_INTERNAL_SECRET: secret, ...env }));
    assert.throws(() => fromEnvironment({ NOTIFICATIONS_INTERNAL_SECRET: secret, NOTIFICATIONS_DELIVERY_MODE: 'stub', NODE_ENV: 'production' }));
    assert.throws(() => fromEnvironment({ NOTIFICATIONS_INTERNAL_SECRET: secret, NOTIFICATIONS_DELIVERY_MODE: 'stub', POSTGRES_PASSWORD: 'synthetic' }));
    assert.throws(() => fromEnvironment({ NOTIFICATIONS_INTERNAL_SECRET: secret, NOTIFICATIONS_DELIVERY_MODE: 'provider' }));
});
test('Respuestas inválidas o excesivas no se interpretan como aceptación', async () => {
    for (const body of ['not-json', JSON.stringify({ id: '' }), JSON.stringify({ tipo: 'inventado' }), JSON.stringify({ id: 'x'.repeat(2048) })]) {
        const send = createSender({ url: 'http://127.0.0.1', secret }, 'resend', { fetchImpl: async () => new Response(body) });
        await assert.rejects(send(job()), { tipo: 'ambiguo' });
    }
});
test('Sobrecarga no entrega y cierre espera solicitud ya admitida', async t => {
    let entered, release;
    const ready = new Promise(r => { entered = r; }), gate = new Promise(r => { release = r; });
    const s = await start(t, { maxConcurrent: 1, send: async () => { entered(); await gate; return { id: 'fixture' }; } });
    const send = createSender({ url: s.url, secret }, 'resend');
    const pending = send(job()); await ready;
    await assert.rejects(send(job()), { tipo: 'ambiguo' });
    release(); assert.deepEqual(await pending, { id: 'fixture' });
});
