'use strict';
// Cadena Gateway → conversación → adaptador GroqCloud real con transporte controlado y datos sintéticos.
// Ninguna prueba abre una conexión a Internet: el transporte es una función local.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { randomUUID } = require('node:crypto');
const { createGateway } = require('../services/gateway/server.cjs');
const { createConversationService, sessionValidator } = require('../services/conversation/server.cjs');
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
    const chat = await listening(t, createServer(createConversationService({
        validateSession: sessionValidator(auth), provider, providerMs: 6000, onProviderError: code => logs.push(code), ...service
    })));
    const gateway = await listening(t, createGateway({ origins: { conversation: chat }, allowedOrigins: [] }).server);
    const post = (body, token = 'A', signal) => fetch(new URL('/api/chat', gateway), {
        method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-sintetico-' + token },
        body: JSON.stringify({ version: 2, conversationId: randomUUID(), topic: 'saving', style: 'summary', ...body })
    });
    return { post, logs };
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

test('la saturación del servicio usa el catálogo sin abrir más salidas que el límite de concurrencia', async t => {
    let open = 0;
    let peak = 0;
    const release = [];
    const f = await setup(t, () => new Promise(resolve => {
        open++; peak = Math.max(peak, open);
        release.push(() => { open--; resolve(completion(prose)); });
    }), { service: { maxInFlight: 2, sessionLimit: 50, ipLimit: 100 } });
    const pending = [f.post(), f.post(), f.post(), f.post()].map(async request => (await request).json());
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(peak, 2);
    release.forEach(finish => finish());
    const modes = (await Promise.all(pending)).map(answer => answer.mode).sort();
    assert.deepEqual(modes, ['fallback', 'fallback', 'generated', 'generated']);
});

test('si el cliente se desconecta, la solicitud al proveedor se cancela y libera su plaza', async t => {
    let signal;
    const f = await setup(t, (_url, request) => new Promise((_resolve, reject) => {
        signal = request.signal;
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const controller = new AbortController();
    const pending = f.post({}, 'A', controller.signal).then(() => 'respuesta', () => 'cancelada');
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.ok(signal && !signal.aborted);
    controller.abort();
    assert.equal(await pending, 'cancelada');
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(signal.aborted, true);
    assert.deepEqual(f.logs, []);
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
    assert.deepEqual(seen.map(({ extracts }) => extracts), Array(2).fill(knowledge.evidence('saving')));
});
