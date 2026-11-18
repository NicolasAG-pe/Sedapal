'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const { iniciar } = require('./email-api.cjs');
const { createGateway } = require('../services/gateway/server.cjs');
const { createKnowledgeChat } = require('../../Frontend/assets/js/hidrobot-chat-client.js');
const knowledge = require('../../Frontend/assets/js/sedapal-knowledge.js');

test('Render y Gateway usan login oficial y solo el canario llega al transporte de v2', async t => {
    const network = globalThis.fetch;
    const calls = [];
    const key = 'fixture-controlled-provider-key';
    const origin = 'https://localhost';
    const text = 'En casa, cierra el caño y acorta las duchas para cuidar el agua.';
    let quota = false;
    Object.assign(process.env, { CHAT_PROVIDER: 'groq', CHAT_GROQ_CANARY_USER_ID: '1', CHAT_GROQ_API_KEY: key });
    globalThis.fetch = async (url, options) => {
        const target = new URL(url);
        if (target.hostname === '127.0.0.1') return network(url, options);
        assert.equal(target.href, 'https://api.groq.com/openai/v1/chat/completions');
        calls.push(options);
        if (quota) return Response.json({}, { status: 429, headers: { 'Retry-After': '2' } });
        return Response.json({ choices: [{ finish_reason: 'stop', message: {
            role: 'assistant', content: JSON.stringify({ text, evidence: ['base'] })
        } }] });
    };
    let ctx;
    t.after(async () => {
        try { await ctx?.close(); } finally { globalThis.fetch = network; }
    });
    ctx = await iniciar({ databasePrefix: 'official_chat' });
    const gateway = createGateway({ origins: { conversation: new URL(ctx.base) }, allowedOrigins: [origin] });
    await new Promise((resolve, reject) => {
        gateway.server.once('error', reject);
        gateway.server.listen(0, '127.0.0.1', resolve);
    });
    t.after(() => gateway.stop());
    const entry = 'http://127.0.0.1:' + gateway.server.address().port;
    async function login(n) {
        const account = ctx.registro(n);
        const pending = (await ctx.request('register', account, 202)).data;
        await ctx.request('verify-email', ctx.verificar(pending.registro_id, ctx.codigo(account.correo)), 201);
        return (await ctx.request('login', account, 200)).data;
    }
    const first = await login(711);
    const second = await login(712);
    assert.equal(String(first.usuario.id_usuario), '1');
    const id = randomUUID();
    const turn = { version: 2, conversationId: id, topic: 'saving', style: 'standard' };
    const request = (body, token, base = entry) => network(base + '/api/chat', {
        method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: JSON.stringify(body)
    });
    const post = async (body, token, status = 200, base) => {
        const response = await request(body, token, base);
        assert.equal(response.status, status);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        if (base === undefined || base === ctx.base) assert.equal(response.headers.get('access-control-allow-origin'), origin);
        return response.json();
    };
    assert.equal((await post(turn, '', 401)).code, 'CHAT_AUTH_REQUIRED');
    assert.equal((await post(turn, first.token + '.invalid', 403)).code, 'CHAT_AUTH_REQUIRED');
    const expired = jwt.sign({ ...jwt.decode(first.token), exp: Math.floor(Date.now() / 1000) - 1 }, process.env.AUTH_TOKEN_SECRET);
    assert.equal((await post(turn, expired, 403)).code, 'CHAT_AUTH_REQUIRED');
    assert.equal((await post({ ...turn, message: 'fixture-private-text' }, first.token, 400)).code, 'CHAT_INVALID_REQUEST');
    assert.equal((await post({ ...turn, message: 'x'.repeat(2000) }, first.token, 413, ctx.base)).code, 'CHAT_REQUEST_TOO_LARGE');
    assert.equal((await post({ version: 1, conversationId: id, topic: 'saving' }, first.token)).mode, 'simulated');
    assert.equal((await post({ ...turn, topic: 'more' }, second.token)).mode, 'clarification');
    assert.equal((await post(turn, second.token)).mode, 'simulated');
    assert.equal(calls.length, 0);

    const android = createKnowledgeChat({ knowledge, enabled: true, version: 2, identifier: () => id,
        request: body => post(body, first.token) });
    assert.deepEqual(await android.reply({ topic: 'saving' }), { text, source: knowledge.get('saving').source, mode: 'generated' });
    quota = true;
    assert.equal((await post(turn, first.token, 200, ctx.base)).mode, 'fallback');
    assert.deepEqual(await android.reply({ topic: 'saving' }), knowledge.get('saving'));
    assert.equal(calls.length, 2, 'la pausa por cuota evita otra solicitud al proveedor');
    for (const outgoing of calls) {
        assert.deepEqual(outgoing.headers, { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key });
        const { messages } = JSON.parse(outgoing.body);
        const { extracts, ...publicContext } = JSON.parse(messages[1].content);
        assert.deepEqual(publicContext, { topic: 'saving', continuation: false, style: 'standard' });
        assert.equal(extracts[0].text, knowledge.evidence('saving')[0].text.split(' En Inicio')[0]);
        for (const secret of [first.token, first.suministro.numero_suministro, first.usuario.correo, id, key]) {
            assert.equal(outgoing.body.includes(secret), false);
        }
    }
    const auth = { Authorization: 'Bearer ' + first.token, Origin: origin };
    for (const route of ['/api/health', '/api/auth/session', '/api/me/perfil', '/api/me/recibos', '/api/pagos/config']) {
        assert.equal((await network(ctx.base + route, { headers: auth })).status, 200, route);
    }
    await ctx.db.query('INSERT INTO usuario_2fa (id_usuario,version) VALUES ($1,1)', [first.usuario.id_usuario]);
    assert.equal((await post(turn, first.token, 403)).code, 'CHAT_AUTH_REQUIRED');
    for (let i = 0; i < 10; i++) assert.equal((await post(turn, second.token)).mode, 'simulated');
    const renewed = jwt.sign({ ...jwt.decode(second.token), jti: randomUUID() }, process.env.AUTH_TOKEN_SECRET);
    assert.equal((await post(turn, renewed, 429)).code, 'CHAT_RATE_LIMIT');
    await ctx.db.query("UPDATE usuarios SET rol='admin' WHERE id_usuario=$1", [first.usuario.id_usuario]);
    const admin = (await ctx.request('login', ctx.registro(711), 200)).data;
    assert.equal((await post(turn, admin.token, 403)).code, 'CHAT_AUTH_REQUIRED');
    await ctx.db.query('UPDATE usuarios SET activo=FALSE WHERE id_usuario=$1', [second.usuario.id_usuario]);
    assert.equal((await post(turn, second.token, 403)).code, 'CHAT_AUTH_REQUIRED');
    assert.equal(calls.length, 2);
});
