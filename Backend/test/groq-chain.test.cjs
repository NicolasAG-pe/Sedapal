'use strict';
// Cadena Gateway → conversación → adaptador GroqCloud real con transporte controlado y datos sintéticos.
// Ninguna prueba abre una conexión a Internet: el transporte es una función local.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { randomUUID } = require('node:crypto');
const { createGateway } = require('../services/gateway/server.cjs');
const { createConversationService, sessionValidator, providerLogger } = require('../services/conversation/server.cjs');
const { createGroqCloudProvider } = require('../services/conversation/groq-cloud.cjs');
const knowledge = require('../../Frontend/assets/js/sedapal-knowledge.js');

const apiKey = 'groq-fixture-only';
const prose = { text: 'Para cuidar el agua en casa, revisa los caños y acorta las duchas.', evidence: ['base'] };
const completion = content => Response.json({
    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(content) } }]
});
const fallbackBrief = { version: 2, mode: 'fallback', topic: 'saving', variant: 'brief' };

async function listening(t, server) {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
    return new URL('http://127.0.0.1:' + server.address().port);
}

async function setup(t, transport, { service = {}, now } = {}) {
    const sessions = { 'Bearer jwt-sintetico-A': 'A', 'Bearer jwt-sintetico-B': 'B' };
    const auth = await listening(t, createServer((req, res) => {
        const known = req.url === '/api/auth/session' && sessions[req.headers.authorization];
        res.writeHead(known ? 200 : 401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(known ? { estado: 'ok', usuario: { rol: 'usuario', correo: 'sintetico@example.invalid' },
            suministro: { numero_suministro: '900000001' } } : {}));
    }));
    const logs = [];
    const provider = createGroqCloudProvider({ apiKey, transport, ...(now ? { now } : {}) });
    const chatServer = createServer(createConversationService({
        validateSession: sessionValidator(auth), provider, providerMs: 6000, onProviderError: code => logs.push(code), ...service
    }));
    const chat = await listening(t, chatServer);
    const gateway = await listening(t, createGateway({ origins: { conversation: chat }, allowedOrigins: [] }).server);
    const post = (body, token = 'A', signal) => fetch(new URL('/api/chat', gateway), {
        method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-sintetico-' + token },
        body: JSON.stringify({ version: 2, conversationId: randomUUID(), topic: 'saving', style: 'summary', ...body })
    });
    return { post, logs, chatServer };
}

test('el JWT, el identificador de conversación y los datos de la cuenta no llegan al proveedor', async t => {
    const outbound = [];
    const f = await setup(t, async (_url, request) => { outbound.push(request); return completion(prose); });
    const conversationId = randomUUID();
    const response = await f.post({ conversationId });
    assert.equal(response.status, 200);
    const answer = await response.json();
    assert.equal(answer.mode, 'generated');
    assert.equal(answer.source, undefined);
    assert.deepEqual(answer.evidence, ['base']);
    assert.equal(outbound.length, 1);
    const wire = JSON.stringify(outbound[0]);
    assert.equal(outbound[0].headers.Authorization, 'Bearer ' + apiKey);
    for (const secret of ['jwt-sintetico', conversationId, '900000001', 'sintetico@example.invalid']) {
        assert.equal(wire.includes(secret), false, secret);
    }
});

test('un plazo vencido cancela la solicitud real del adaptador y el Gateway responde con el catálogo', async t => {
    let aborted = false;
    const f = await setup(t, (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => { aborted = true; reject(signal.reason); }, { once: true });
    }), { service: { providerMs: 40 } });
    const started = performance.now();
    const response = await f.post();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), fallbackBrief);
    assert.ok(performance.now() - started < 2000);
    assert.equal(aborted, true);
    assert.deepEqual(f.logs, ['CHAT_PROVIDER_TIMEOUT']);
});

test('HTTP 429 con Retry-After responde con el catálogo y no repite la salida durante la pausa', async t => {
    let calls = 0;
    let clock = 1_000_000;
    const f = await setup(t, async () => {
        calls++;
        return new Response('{}', { status: 429, headers: { 'Retry-After': '7' } });
    }, { now: () => clock });
    assert.deepEqual(await (await f.post()).json(), fallbackBrief);
    assert.deepEqual(await (await f.post({}, 'B')).json(), fallbackBrief);
    assert.equal(calls, 1);
    assert.deepEqual(f.logs, ['GROQ_QUOTA', 'GROQ_QUOTA']);
    clock += 7001;
    assert.deepEqual(await (await f.post()).json(), fallbackBrief);
    assert.equal(calls, 2);
});

test('los errores 401, 403, 5xx, red y contenido inválido usan el catálogo con códigos acotados', async t => {
    const cases = [
        [() => new Response('{}', { status: 401 }), 'GROQ_AUTH'],
        [() => new Response('{}', { status: 403 }), 'GROQ_AUTH'],
        [() => new Response('{}', { status: 400 }), 'GROQ_REQUEST'],
        [() => new Response('{}', { status: 503 }), 'GROQ_UNAVAILABLE'],
        [() => { throw Error('detalle de red confidencial'); }, 'GROQ_UNAVAILABLE'],
        [() => completion({ text: 'Tu consumo de agua fue de noventa y seis litros hoy.', evidence: ['base'] }), 'GROQ_INVALID_OUTPUT'],
        [() => completion({ text: 'Mira https://ejemplo.invalid/agua para cuidar el agua en casa.', evidence: ['base'] }), 'GROQ_INVALID_OUTPUT'],
        [() => new Response('no es json', { status: 200 }), 'GROQ_INVALID_OUTPUT']
    ];
    let current;
    const f = await setup(t, async () => current());
    for (const [response, code] of cases) {
        current = response;
        const result = await f.post();
        assert.equal(result.status, 200);
        const text = await result.text();
        assert.deepEqual(JSON.parse(text), fallbackBrief);
        assert.doesNotMatch(text, /confidencial|ejemplo\.invalid|noventa/);
        assert.equal(f.logs.at(-1), code);
    }
    assert.equal(f.logs.length, cases.length);
});

test('el respaldo conserva el contrato y los logs solo contienen el código y el motivo fijo', async t => {
    const warning = t.mock.method(console, 'warn', () => {});
    let reply;
    const f = await setup(t, () => reply, { service: { onProviderError: providerLogger() } });
    const conversationId = randomUUID();
    for (let i = 0; i < 2; i++) {
        reply = completion({ text: 'Para cuidar el agua usa los caños. Contacto privado sintetico@example.invalid.',
            evidence:['base'] });
        assert.deepEqual(await (await f.post({ conversationId })).json(), fallbackBrief);
    }
    reply = new Response(JSON.stringify({ choices: [{ finish_reason: 'length',
        message: { role: 'assistant', content: apiKey } }] }));
    assert.deepEqual(await (await f.post({ conversationId })).json(), fallbackBrief);
    providerLogger()('GROQ_INVALID_OUTPUT', 'Bearer jwt-sintetico-A PII ' + apiKey);
    providerLogger()(apiKey + ' jwt-sintetico-A');
    assert.deepEqual(warning.mock.calls.map(call => call.arguments), [
        ['[conversation]', 'GROQ_INVALID_OUTPUT', 'CHARACTERS'],
        ['[conversation]', 'GROQ_INVALID_OUTPUT', 'FINISH_LENGTH'],
        ['[conversation]', 'GROQ_INVALID_OUTPUT'],
        ['[conversation]', 'CHAT_PROVIDER_ERROR']
    ]);
    const logged = JSON.stringify(warning.mock.calls.map(call => call.arguments));
    for (const privateValue of [apiKey, 'jwt-sintetico-A', 'sintetico@example.invalid', conversationId, '900000001', 'Contacto privado']) {
        assert.equal(logged.includes(privateValue), false);
    }
});

test('la saturación del servicio usa el catálogo sin abrir más salidas que el límite de concurrencia', { timeout: 8000 }, async t => {
    const bothOpen = Promise.withResolvers();
    const release = [];
    let calls = 0;
    const f = await setup(t, () => new Promise(resolve => {
        calls++;
        release.push(() => resolve(completion(prose)));
        if (release.length === 2) bothOpen.resolve();
    }), { service: { maxInFlight: 2, sessionLimit: 50, ipLimit: 100 } });
    const pending = [f.post(), f.post()].map(async request => (await request).json());
    await bothOpen.promise;
    try {
        const fallbacks = await Promise.all([f.post(), f.post()].map(async request => (await request).json()));
        assert.deepEqual(fallbacks, [fallbackBrief, fallbackBrief]);
        assert.equal(calls, 2);
    } finally {
        release.forEach(finish => finish());
        const completed = await Promise.all(pending);
        assert.deepEqual(completed.map(answer => answer.mode), ['generated', 'generated']);
    }
});

test('si el cliente se desconecta, la solicitud al proveedor se cancela y libera su plaza', { timeout: 8000 }, async t => {
    const started = Promise.withResolvers();
    const cancelled = Promise.withResolvers();
    const f = await setup(t, (_url, request) => new Promise((_resolve, reject) => {
        const { signal } = request;
        signal.addEventListener('abort', () => { reject(signal.reason); cancelled.resolve(); }, { once: true });
        started.resolve(signal);
    }));
    const controller = new AbortController();
    const pending = f.post({}, 'A', controller.signal).then(() => 'respuesta', () => 'cancelada');
    const signal = await started.promise;
    assert.equal(signal.aborted, false);
    controller.abort();
    assert.equal(await pending, 'cancelada');
    await cancelled.promise;
    assert.equal(signal.aborted, true);
    assert.deepEqual(f.logs, []);
});

test('una desconexión durante Auth no abre salida al proveedor ni guarda contexto', { timeout: 4000 }, async t => {
    const authStarted = Promise.withResolvers();
    const authResult = Promise.withResolvers();
    const chatClosed = Promise.withResolvers();
    let validations = 0;
    let calls = 0;
    const f = await setup(t, async () => { calls++; return completion(prose); }, {
        service: { validateSession() {
            if (++validations !== 1) return true;
            authStarted.resolve();
            return authResult.promise;
        } }
    });
    f.chatServer.once('request', (_req, res) => res.once('close', chatClosed.resolve));

    const conversationId = randomUUID();
    const controller = new AbortController();
    const cancelled = assert.rejects(f.post({ conversationId }, 'A', controller.signal), { name: 'AbortError' });
    await authStarted.promise;
    controller.abort();
    await Promise.all([cancelled, chatClosed.promise]);
    authResult.resolve(true);

    const followup = await f.post({ conversationId, topic: 'more' });
    assert.equal(calls, 0);
    assert.deepEqual(await followup.json(), { version: 2, mode: 'clarification' });
});

test('dos sesiones usan conversaciones separadas y la continuación no cruza cuentas', async t => {
    const seen = [];
    const f = await setup(t, async (_url, request) => {
        seen.push(JSON.parse(JSON.parse(request.body).messages[1].content));
        return completion(prose);
    });
    const conversationId = randomUUID();
    assert.equal((await (await f.post({ conversationId }, 'A')).json()).mode, 'generated');
    assert.equal((await (await f.post({ conversationId, topic: 'more' }, 'B')).json()).mode, 'clarification');
    assert.equal((await (await f.post({ conversationId, topic: 'more' }, 'A')).json()).mode, 'generated');
    assert.deepEqual(seen.map(({ continuation }) => continuation), [false, true]);
    assert.deepEqual(seen[0].extracts, seen[1].extracts);
    assert.equal(seen[0].extracts[0].text, knowledge.evidence('saving')[0].text.split(' En Inicio')[0]);
});
