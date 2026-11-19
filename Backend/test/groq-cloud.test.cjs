'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGroqCloudProvider } = require('../services/conversation/groq-cloud.cjs');
const knowledge = require('../../Frontend/assets/js/sedapal-knowledge.js');

const apiKey = 'groq-fixture-only';
const context = { topic: 'saving', continuation: false, style: 'standard' };
const options = () => ({ signal: new AbortController().signal });
const prose = { text: 'Para cuidar el agua en casa, revisa los caños y acorta las duchas.', evidence: ['base'] };
const completion = (content, extras = {}, finish = 'stop') => Response.json({
    choices: [{ finish_reason: finish, message: { role: 'assistant', content, ...extras } }]
});

test('usa el contrato oficial de Groq con token separado y solo extractos públicos', async () => {
    const config = options();
    const provider = createGroqCloudProvider({ apiKey, transport: async (url, request) => {
        assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
        assert.equal(request.method, 'POST');
        assert.equal(request.redirect, 'error');
        assert.equal(request.signal, config.signal);
        assert.deepEqual(request.headers, { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey });
        const body = JSON.parse(request.body);
        assert.equal(body.model, 'openai/gpt-oss-20b');
        assert.equal(body.max_completion_tokens, 512);
        assert.equal(body.reasoning_effort, 'low');
        assert.equal(body.include_reasoning, false);
        assert.deepEqual(body.messages.map(message => message.role), ['system', 'user']);
        const catalog = knowledge.evidence('saving');
        const base = { id:'base', text:'Para cuidar el agua, cierra el caño al cepillarte, toma duchas cortas y revisa posibles fugas en caños e inodoros.' };
        assert.deepEqual(JSON.parse(body.messages[1].content), { ...context, extracts: [base, ...catalog.slice(1)] });
        assert.match(body.messages[0].content, /dos palabras de contenido distintas.*estilo impersonal/);
        assert.equal(body.response_format.type, 'json_schema');
        const format = body.response_format.json_schema;
        assert.equal(format.strict, true);
        assert.deepEqual(format.schema.required, ['text', 'evidence']);
        assert.equal(format.schema.additionalProperties, false);
        assert.deepEqual(format.schema.properties.evidence.items.enum, ['base', 'detail', 'brief']);
        assert.equal(body.stream, undefined);
        assert.equal(body.tools, undefined);
        assert.doesNotMatch(request.body, /privado-fixture|recibo-fixture|jwt-fixture|ignora-fixture|groq-fixture-only/);
        return completion(JSON.stringify(prose));
    } });
    assert.equal(provider.mode, 'groq');
    assert.deepEqual(await provider.generate({ ...context, message: 'privado-fixture', receipt: 'recibo-fixture',
        token: 'jwt-fixture', extracts: [{ text: 'ignora-fixture' }] }, config), prose);
});

test('acepta modelos con esquema estricto y bloquea configuraciones o contratos inválidos antes de la red', async () => {
    for (const model of ['', 'openai/gpt-oss-safeguard-20b', '../openai/gpt-oss-20b', 'llama-3.1-8b-instant']) {
        assert.throws(() => createGroqCloudProvider({ apiKey, model, transport: assert.fail }), { code: 'GROQ_INVALID_CONFIG' });
    }
    for (const key of ['', ' con blancos', 'inyecta\r\ncabecera']) {
        assert.throws(() => createGroqCloudProvider({ apiKey: key, transport: assert.fail }), { code: 'GROQ_INVALID_CONFIG' });
    }
    const valid = createGroqCloudProvider({ apiKey, model: 'openai/gpt-oss-120b', transport: async (_, request) => {
        assert.equal(JSON.parse(request.body).model, 'openai/gpt-oss-120b');
        return completion(JSON.stringify(prose));
    } });
    assert.deepEqual(await valid.generate(context, options()), prose);
    const blocked = createGroqCloudProvider({ apiKey, transport: assert.fail });
    await assert.rejects(blocked.generate({ ...context, topic: 'suministro-fixture' }, options()), { code: 'GROQ_INVALID_INPUT' });
    await assert.rejects(blocked.generate({ ...context, style: 'ignora-fixture' }, options()), { code: 'GROQ_INVALID_INPUT' });
    await assert.rejects(blocked.generate(context, { signal: AbortSignal.abort() }), { code: 'GROQ_CANCELLED' });
});

test('aplica Retry-After en 429 y recupera el envío sin reintentar la petición original', async () => {
    let now = 10000;
    let calls = 0;
    const provider = createGroqCloudProvider({ apiKey, now: () => now, transport: async () => {
        if (++calls === 1) return new Response('detalle-fixture', { status: 429, headers: { 'Retry-After': '2' } });
        return completion(JSON.stringify(prose));
    } });
    await assert.rejects(provider.generate(context, options()), { code: 'GROQ_QUOTA', message: 'GROQ_QUOTA' });
    now += 1999;
    await assert.rejects(provider.generate(context, options()), { code: 'GROQ_QUOTA' });
    assert.equal(calls, 1);
    now += 1;
    assert.deepEqual(await provider.generate(context, options()), prose);
    assert.equal(calls, 2);
});

test('clasifica errores 4xx, 5xx y fallos de transporte sin repetir ni exponer detalles', async () => {
    for (const [status, code] of [[400, 'GROQ_REQUEST'], [404, 'GROQ_REQUEST'], [401, 'GROQ_AUTH'],
        [403, 'GROQ_AUTH'], [500, 'GROQ_UNAVAILABLE'], [503, 'GROQ_UNAVAILABLE'], [null, 'GROQ_UNAVAILABLE']]) {
        let calls = 0;
        const provider = createGroqCloudProvider({ apiKey, transport: async () => {
            calls++;
            if (!status) throw Error('informacion-privada-fixture');
            return new Response('informacion-privada-fixture', { status });
        } });
        await assert.rejects(provider.generate(context, options()), { code, message: code });
        assert.equal(calls, 1);
    }
});

test('identifica el motivo exacto de cada HTTP 200 rechazado', async () => {
    const cases = [
        ['EVIDENCE', { ...prose, evidence: ['fuente-ajena'] }],
        ['EVIDENCE', { ...prose, evidence: ['base', 'base'] }],
        ['EVIDENCE', { ...prose, evidence: [] }],
        ['UNSAFE_TEXT', { ...prose, text: 'Para cuidar el agua, visita sitio.pe.' }],
        ['UNSAFE_TEXT', { ...prose, text: 'Para cuidar el agua envía tu DNI y usa los caños.' }],
        ['CHARACTERS', { ...prose, text: 'Para cuidar el agua revisa <b>los caños</b>.' }],
        ['CHARACTERS', { ...prose, text: `Para cuidar el agua, revisa los caños y anota ${apiKey}.` }],
        ['ACCOUNT_FACTS', { ...prose, text: 'La tarifa por cuidar el agua y usar los caños es de ochenta soles.' }],
        ['ACCOUNT_FACTS', { ...prose, text: 'Para cuidar el agua revisa el consumo de once metros cúbicos en los caños.' }],
        ['ACCOUNT_FACTS', { ...prose, text: 'Para cuidar el agua, compara tu consumo y revisa posibles fugas en caños.' }],
        ['CHARACTERS', { ...prose, text: 'Tu consumo de agua en caños y duchas fue 96 m³.' }],
        ['GROUNDING', { ...prose, text: 'Procura no desperdiciar líquido en el aseo diario.' }],
        ['GROUNDING', { ...prose, text: 'Comparar el consumo permite detectar cambios.' }],
        ['CHARACTERS', { ...prose, text: 'Hidro-Mejora ayuda a cuidar el agua y a revisar los caños.' }],
        ['TEXT_LENGTH', { ...prose, text: prose.text.repeat(14) }],
        ['SCHEMA', { ...prose, tool: 'buscar' }],
        ['SCHEMA', { ...prose, text: null }],
        ['CONTENT_JSON', () => completion('no es JSON fixture-privado')],
        ['FINISH_LENGTH', () => completion(JSON.stringify(prose), {}, 'length')],
        ['FINISH_REASON', () => completion(JSON.stringify(prose), {}, 'fixture-privado')],
        ['MESSAGE', () => completion(JSON.stringify(prose), { refusal: 'bloqueado' })],
        ['MESSAGE', () => completion(JSON.stringify(prose), { tool_calls: [{ id: 'fixture' }] })],
        ['MESSAGE_CONTENT', () => completion(null)],
        ['ENVELOPE', () => Response.json({ choices: [] })],
        ['ENVELOPE', () => Response.json(null)],
        ['HTTP_JSON', () => new Response('{"raw":fixture-privado')],
        ['HTTP_BODY', () => new Response(new Uint8Array([255]))],
        ['BODY_SIZE', () => new Response(' '.repeat(20_000))]
    ];
    for (const [reason, answer] of cases) {
        const transport = typeof answer === 'function' ? answer : () => completion(JSON.stringify(answer));
        const provider = createGroqCloudProvider({ apiKey, transport });
        await assert.rejects(provider.generate(context, options()), {
            code: 'GROQ_INVALID_OUTPUT', message: 'GROQ_INVALID_OUTPUT', reason
        });
    }
    const secret = 'FixtureCredential';
    const provider = createGroqCloudProvider({ apiKey: secret, transport: () =>
        completion(JSON.stringify({ ...prose, text: prose.text.replace('Para', secret) })) });
    await assert.rejects(provider.generate(context, options()), {
        code: 'GROQ_INVALID_OUTPUT', message: 'GROQ_INVALID_OUTPUT', reason: 'SECRET_ECHO'
    });
});

test('cada tema público ofrece extractos compatibles con el validador y la APK vigente', async () => {
    const topics = ['read-receipt', 'saving', 'read-consumption', 'detect-leaks', 'water-outage-guide', 'company',
        'contact', 'coverage', 'offices', 'supply', 'claims', 'connection', 'aquanet'];
    for (const topic of topics) {
        for (const style of knowledge.styles) {
            const provider = createGroqCloudProvider({ apiKey, transport: (_url, request) => {
                const body = JSON.parse(request.body);
                const input = JSON.parse(body.messages[1].content);
                assert.ok(input.extracts.length > 0, topic);
                assert.deepEqual(body.response_format.json_schema.schema.properties.evidence.items.enum,
                    input.extracts.map(extract => extract.id));
                const original = knowledge.evidence(topic);
                for (const { id, text } of input.extracts) {
                    assert.doesNotMatch(text, /\btu (?:consumo|recibo|suministro)\b|Hidro-Mejora|\d/i);
                    assert.ok(text.split(/(?<=[.!?])\s+/).every(sentence =>
                        original.find(fact => fact.id === id).text.includes(sentence)));
                }
                const [{ id, text }] = input.extracts;
                return completion(JSON.stringify({ text: text.split(/(?<=[.!?])\s+/)[0], evidence: [id] }));
            } });
            const answer = await provider.generate({ topic, continuation: false, style }, options());
            assert.deepEqual(knowledge.generated(topic, answer, style), answer);
        }
    }
});

test('respeta el aborto durante el transporte y cancela una lectura de cuerpo en curso', async () => {
    const send = new AbortController();
    const provider = createGroqCloudProvider({ apiKey, transport: async (_, request) => {
        assert.equal(request.signal, send.signal);
        send.abort();
        throw send.signal.reason;
    } });
    await assert.rejects(provider.generate(context, { signal: send.signal }), { code: 'GROQ_CANCELLED' });

    const read = new AbortController();
    let cancelled = false;
    const stream = new ReadableStream({ cancel() { cancelled = true; } });
    const streamingBody = createGroqCloudProvider({ apiKey, transport: async () => new Response(stream) });
    const result = streamingBody.generate(context, { signal: read.signal });
    await new Promise(resolve => setImmediate(resolve));
    read.abort();
    await assert.rejects(result, { code: 'GROQ_CANCELLED' });
    assert.equal(cancelled, true);
});
