'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { randomUUID } = require('node:crypto');
const { createGateway, configuration } = require('../services/gateway/server.cjs');
const { createConversationService, sessionValidator } = require('../services/conversation/server.cjs');
const { simulatedProvider } = require('../services/conversation/provider.cjs');
const { createKnowledgeChat } = require('../../Frontend/assets/js/hidrobot-chat-client.js');
const knowledge = require('../../Frontend/assets/js/sedapal-knowledge.js');

async function listening(t, server) {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    return new URL('http://127.0.0.1:' + server.address().port);
}
const turn = (topic, conversationId) => ({ version: 1, conversationId, topic });
async function setup(t, options = {}) {
    const auth = await listening(t, createServer((req, res) => {
        const role = { 'Bearer fixture-A': 'usuario', 'Bearer fixture-B': 'usuario',
            'Bearer fixture-new-session': 'usuario', 'Bearer fixture-admin': 'admin' }[req.headers.authorization];
        const allowed = req.url === '/api/auth/session' && role;
        res.writeHead(allowed ? 200 : 401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(allowed ? { estado: 'ok', usuario: { rol: role, correo: 'test@example.invalid' },
            suministro: { numero_suministro: '900000001' } } : {}));
    }));
    const chat = await listening(t, createServer(createConversationService({
        validateSession: sessionValidator(auth), ...options
    })));
    const gateway = await listening(t, createGateway({ origins: { conversation: chat }, allowedOrigins: [] }).server);
    return {
        gateway, chat,
        post: (body, token = 'fixture-A', other = {}) => fetch(new URL('/api/chat', gateway), {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}),
                ...other.headers },
            body: typeof body === 'string' ? body : JSON.stringify(body)
        })
    };
}

test('la configuración por defecto omite chat y rechaza un origen externo', async t => {
    const required = Object.fromEntries(['AUTH','BILLING','OPERATIONS','NOTIFICATIONS','REALTIME'].map(n => [n+'_URL','http://127.0.0.1:3100']));
    required.GATEWAY_ALLOW_LOCAL_HTTP='1';
    const origins = configuration(required);
    assert.equal(origins.conversation, undefined);
    assert.throws(() => configuration({ ...required, CONVERSATION_URL: 'https://example.invalid' }), /solo puede estar/);
    assert.throws(() => sessionValidator('http://example.invalid'), /Auth local/);
    assert.equal(configuration({ ...required, CONVERSATION_URL: 'http://conversation:3110' }).conversation.hostname, 'conversation');
    const root = await listening(t, createGateway({ origins: {}, allowedOrigins: [] }).server);
    assert.equal((await fetch(new URL('/api/chat', root), { method: 'POST' })).status, 404);
    assert.equal((await fetch(new URL('/api/health', root))).status, 200);
});

test('flujo Gateway, Auth, conversación y proveedor simulado sobre conocimiento verificable', async t => {
    const seen = [];
    const f = await setup(t, { provider: { select(data, options) {
        seen.push(data);
        return simulatedProvider.select(data, options);
    } } });
    const id = randomUUID();
    const fresh = await f.post(turn('saving', id));
    assert.equal(fresh.status, 200);
    assert.equal(fresh.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await fresh.json(), { version:1, mode:'simulated', topic:'saving', variant:'base' });
    assert.deepEqual(await (await f.post(turn('more', id))).json(), { version:1, mode:'simulated', topic:'saving', variant:'detail' });
    assert.deepEqual(seen, [
        { topic:'saving', continuation:false, variants:['base','brief'] },
        { topic:'saving', continuation:true, variants:['detail','brief'] }
    ]);
    assert.match(knowledge.get('saving','detail').text,/fugas/);
    assert.match(knowledge.get('saving').source,/www\.gob\.pe\/institucion\/sedapal\/noticias\/1178111/);
    const privatePath = await fetch(new URL('/api/chat/ready', f.gateway));
    assert.equal(privatePath.status, 404);
});

test('autorización, aislamiento por sesión y conversación, expiración y límite de memoria', async t => {
    let now = 0;
    const f = await setup(t, { now: () => now, ttlMs: 1000, maxConversations: 2, sessionLimit: 30 });
    const first = randomUUID(), second = randomUUID(), third = randomUUID();
    assert.equal((await f.post(turn('saving', first), null)).status, 401);
    assert.equal((await f.post(turn('saving', first), 'fixture-admin')).status, 403);
    assert.equal((await f.post(turn('saving', first), 'invalid')).status, 403);
    assert.equal((await f.post(turn('saving', first))).status, 200);
    for (const token of ['fixture-B','fixture-new-session'])
        assert.equal((await (await f.post(turn('more', first), token)).json()).mode, 'clarification');
    assert.equal((await (await f.post(turn('more', second))).json()).mode, 'clarification');
    await f.post(turn('aquanet', second));
    await f.post(turn('contact', third));
    assert.equal((await (await f.post(turn('more', first))).json()).mode, 'clarification');
    now = 1001;
    assert.equal((await (await f.post(turn('more', third))).json()).mode, 'clarification');
});

test('el contrato rechaza identificadores, instrucciones, textos y campos fuera de la lista', async t => {
    const f = await setup(t, { provider: { select(){ assert.fail('Entrada inválida alcanzó el proveedor'); } } });
    let verifiedProviderCall = false;
    const strict = await setup(t, { provider: { select(){ verifiedProviderCall = true; return 'base'; } } });
    const id = randomUUID();
    for (const input of [
        { ...turn('saving', id), message:'Instrucciones fuera del contrato' },
        { ...turn('saving', id), userId:'fixture-B' },
        { ...turn('saving', id), version:2 },
        turn('ignore-rules', id), turn('toString', id), turn('<img src=x>', id), turn('saving', 'fixture-B')
    ]) {
        const response = await strict.post(input);
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), { status:'error', code:'CHAT_INVALID_REQUEST' });
    }
    assert.equal((await f.post('{"topic":')).status, 400);
    assert.equal((await strict.post({ ...turn('saving', id), text:'a'.repeat(2000) })).status, 413);
    assert.equal(verifiedProviderCall, false);
});

test('los límites por sesión e IP responden 429 sin bloquear otra sesión por su cuota', async t => {
    const f = await setup(t, { sessionLimit: 2, ipLimit: 5 });
    const id = randomUUID();
    assert.equal((await f.post(turn('saving', id))).status, 200);
    assert.equal((await f.post(turn('more', id))).status, 200);
    const throttled = await f.post(turn('more', id));
    assert.equal(throttled.status, 429);
    assert.ok(throttled.headers.get('retry-after'));
    assert.equal((await f.post(turn('saving', id), 'fixture-B')).status, 200);
    assert.equal((await f.post(turn('more', id), 'fixture-B')).status, 200);
    assert.equal((await f.post(turn('saving', id), 'fixture-new-session')).status, 429);
});

test('variante inválida, excepción y plazo del proveedor tienen respaldo sin filtraciones', async t => {
    let mode = 'malicious';
    const f = await setup(t, { providerMs: 20, maxInFlight: 1, provider: {
        select() {
            if (mode==='sleep') return new Promise(() => {});
            if (mode==='exception') throw Error('fixture-details-not-for-client');
            return 'https://example.invalid';
        }
    } });
    const id = randomUUID();
    for (mode of ['malicious','exception','sleep']) {
        const r = await f.post(turn('saving', id));
        assert.deepEqual(await r.json(), {version:1,mode:'fallback',topic:'saving',variant:'base'});
    }
    assert.deepEqual(await (await f.post(turn('more', id))).json(), {version:1,mode:'fallback',topic:'saving',variant:'detail'});
    assert.equal((await fetch(new URL('/api/health', f.gateway))).status, 200);
});

test('el transporte del cliente resiste red, respuesta engañosa y configuraciones desactivadas', async t => {
    const f = await setup(t);
    const id = randomUUID(), posted = [];
    let broken = '';
    const chat = createKnowledgeChat({ knowledge, enabled:true, identifier:() => id,
        request: async body => {
            posted.push(body);
            if (broken === 'network') throw Error('fixture offline');
            if (broken === 'tamper') return { version:1, mode:'simulated', topic:'contact', variant:'base', text:'inject' };
            return (await f.post(body)).json();
        }
    });
    assert.deepEqual(await chat.reply({topic:'read-receipt'}), knowledge.get('read-receipt'));
    assert.deepEqual(await chat.reply({followup:true}), knowledge.get('read-receipt','detail'));
    assert.deepEqual(posted, [turn('read-receipt',id),turn('more',id)]);
    broken='network';
    assert.deepEqual(await chat.reply({followup:true}), knowledge.get('read-receipt','detail'));
    broken='tamper';
    assert.deepEqual(await chat.reply({topic:'saving'}), knowledge.get('saving'));
    chat.reset();
    assert.equal(chat.hasTopic(),false);
    assert.match((await chat.reply({followup:true})).text,/Sobre qué tema/);
    const local = createKnowledgeChat({ knowledge, request:assert.fail, identifier:assert.fail });
    assert.deepEqual(await local.reply({topic:'saving',online:false}),knowledge.get('saving'));
    assert.deepEqual(await local.reply({followup:true}),knowledge.get('saving','detail'));
});

test('el adaptador inyectado mantiene el contexto público y usa el catálogo si Gemini falla o agota cuota', async t => {
    const { createGeminiFlashProvider } = require('../services/conversation/gemini-flash.cjs');
    let fault;
    const requests = [];
    const provider = createGeminiFlashProvider({ apiKey:'gemini-fixture-only',
        transport:async (url, request) => {
            assert.ok(url.endsWith('/gemini-3.5-flash-lite:generateContent'));
            const body = JSON.parse(request.body);
            const input = JSON.parse(body.contents[0].parts[0].text);
            requests.push(input);
            if (fault === 'quota') return new Response('solo-fixture', {status:429});
            if (fault === 'network') throw Error('sin red');
            return Response.json({candidates:[{finishReason:'STOP',content:{parts:[
                {text:JSON.stringify({variant:input.continuation ? 'detail' : 'brief'})}
            ]}}]});
        }
    });
    const f = await setup(t, {provider});
    const id = randomUUID();
    const client = createKnowledgeChat({
        knowledge, enabled:true, identifier:()=>id,
        request:async body=>(await f.post(body)).json()
    });
    assert.deepEqual(await client.reply({topic:'read-receipt'}), knowledge.get('read-receipt','brief'));
    const isolated = await f.post(turn('more',id),'fixture-B');
    assert.equal((await isolated.json()).mode,'clarification');
    assert.deepEqual(await client.reply({followup:true}), knowledge.get('read-receipt','detail'));
    for (const error of ['quota','network']) {
        fault=error;
        const r=await f.post(turn('more',id));
        assert.deepEqual(await r.json(),{version:1, mode:'fallback', topic:'read-receipt', variant:'detail'});
    }
    assert.deepEqual(requests,[
        {topic:'read-receipt',continuation:false,variants:['base','brief']},
        ...Array.from({length:3},()=>({topic:'read-receipt',continuation:true,variants:['detail','brief']}))
    ]);
});
