'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { configuration, createGateway, isAuthRoute } = require('../auth-gateway.cjs');

async function start(t, middleware) {
    const app = express(); app.set('trust proxy', 1); app.use(express.json()); app.use(middleware);
    app.use((req, res) => res.json({ servicio: 'negocio' }));
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    return 'http://127.0.0.1:' + server.address().port;
}
test('Gateway opt-in, destinos restringidos y límites de dominio', () => {
    assert.equal(configuration({}), null);
    for (const url of ['http://remote.invalid', 'https://u:p@remote.invalid', 'https://remote.invalid/path', 'https://remote.invalid?x=1']) {
        assert.throws(() => configuration({ AUTH_SERVICE_URL: url, NODE_ENV: 'production' }));
    }
    assert.deepEqual(configuration({ AUTH_SERVICE_URL: 'http://auth:3100', NODE_ENV: 'test', AUTH_ALLOW_LOCAL_HTTP: '1' }), { origin: 'http://auth:3100' });
    for (const path of ['/api/auth/login', '/API/AUTH/login', '/api/auth/unknown', '/api/me/perfil', '/api/perfil/900000001']) assert.ok(isAuthRoute('GET', path));
    assert.ok(isAuthRoute('PATCH', '/api/admin/usuarios/3/estado'));
    for (const path of ['/api/admin/usuarios', '/api/recibos', '/api/incidencias', '/socket.io/', '/internal/v1/auth/introspect', '/api/authentic']) assert.equal(isAuthRoute('GET', path), false);
});
test('Conserva cuerpo/contrato/status y rate limits, normaliza IP y no filtra cabeceras internas', async t => {
    let captured, reconciled = false;
    const base = await start(t, createGateway({ origin: 'http://auth.invalid' }, {
        fetchImpl: async (url, options) => { captured = { url, options }; return Response.json({ estado: 'fixture' }, {
            status: 202, headers: { 'Retry-After': '5', 'Set-Cookie': 'internal=private', 'Location': 'http://auth.invalid' }
        }); }, afterMutation: async () => { reconciled = true; }
    }));
    const res = await fetch(base + '/api/auth/otp/register?test=1', { method: 'POST', body: JSON.stringify({ fixture: true }), headers: {
        'Content-Type': 'application/json', Authorization: 'Bearer fixture', 'X-Hidro-Auth-Contract': 'otp-outbox-v1',
        'X-Forwarded-For': '198.51.100.1, 192.0.2.1', 'X-Hidro-Signature': 'untrusted'
    } });
    assert.equal(res.status, 202); assert.equal(reconciled, true);
    assert.deepEqual(await res.json(), { estado: 'fixture' });
    assert.equal(res.headers.get('retry-after'), '5'); assert.equal(res.headers.get('set-cookie'), null); assert.equal(res.headers.get('location'), null);
    assert.equal(captured.options.headers['X-Forwarded-For'], '192.0.2.1');
    assert.equal(captured.options.headers['x-hidro-auth-contract'], 'otp-outbox-v1');
    assert.equal(captured.options.headers['X-Hidro-Signature'], undefined);
    assert.equal(captured.options.redirect, 'error'); assert.equal(captured.url, 'http://auth.invalid/api/auth/otp/register?test=1');
    assert.deepEqual(JSON.parse(captured.options.body), { fixture: true });
    assert.deepEqual(await (await fetch(base + '/api/recibos')).json(), { servicio: 'negocio' });
});
test('Auth caído no activa fallback; revalida sockets incluso con respuesta perdida', async t => {
    let calls = 0, reconciled = 0;
    const base = await start(t, createGateway({ origin: 'http://auth.invalid' }, {
        fetchImpl: async () => { calls++; throw Error('detalle privado'); }, afterMutation: async () => { reconciled++; }
    }));
    const res = await fetch(base + '/api/auth/change-password', { method: 'POST' });
    assert.equal(res.status, 503); assert.equal((await res.json()).codigo, 'AUTH_UNAVAILABLE');
    assert.equal(calls, 1); assert.equal(reconciled, 1);
    assert.equal((await fetch(base + '/api/health')).status, 200);
    const disabled = await start(t, createGateway(null));
    assert.deepEqual(await (await fetch(disabled + '/api/auth/login')).json(), { servicio: 'negocio' });
});
