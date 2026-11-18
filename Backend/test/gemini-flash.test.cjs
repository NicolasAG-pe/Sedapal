'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGeminiFlashProvider } = require('../services/conversation/gemini-flash.cjs');

const config = { apiKey: 'gemini-fixture-only' };
const context = { topic: 'saving', continuation: false, variants: ['base', 'brief'] };
const options = () => ({ signal: new AbortController().signal });
const structured = (text, finishReason = 'STOP') => ({
    candidates: [{ finishReason, content: { parts: [{ text }] } }]
});

test('Gemini requiere transporte inyectado y valida un ID Flash configurable', () => {
    assert.throws(() => createGeminiFlashProvider(config), { code: 'GEMINI_INVALID_CONFIG' });
    for (const model of ['', 'gemini-flash-latest', 'gemini-2.0-flash', 'gemini-3.5-flash-lite-preview', '../gemini-3.5-flash-lite', 'gemini-3.8-flash-tts']) {
        assert.throws(() => createGeminiFlashProvider({ ...config, model, transport: assert.fail }), { code: 'GEMINI_INVALID_CONFIG' });
    }
    assert.throws(() => createGeminiFlashProvider({ ...config, apiKey: '', transport: assert.fail }), { code: 'GEMINI_INVALID_CONFIG' });
});

test('el adaptador envía solo la selección pública, con esquema cerrado y sin redirecciones', async () => {
    const captured = [];
    const provider = createGeminiFlashProvider({ ...config, transport: async (url, request) => {
        captured.push({ url, request });
        return Response.json(structured('{"variant":"brief"}'));
    } });
    assert.equal(provider.mode, 'gemini');
    const opts = options();
    const input = { ...context, text: 'privado-fixture', receipt: 'recibo-fixture', token: 'sesion-fixture',
        conversationId: 'conversacion-fixture', account: 'cuenta-fixture' };
    assert.equal(await provider.select(input, opts), 'brief');
    assert.equal(captured.length, 1);
    const [{ url, request }] = captured;
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    assert.equal(request.headers['x-goog-api-key'], config.apiKey);
    assert.deepEqual(Object.keys(request.headers), ['Content-Type', 'x-goog-api-key']);
    assert.equal(request.method, 'POST');
    assert.equal(request.redirect, 'error');
    assert.equal(request.signal, opts.signal);
    const body = JSON.parse(request.body);
    assert.deepEqual(JSON.parse(body.contents[0].parts[0].text), context);
    assert.equal(body.generationConfig.responseFormat.text.mimeType, 'APPLICATION_JSON');
    assert.deepEqual(body.generationConfig.responseFormat.text.schema, {
        type:'object', properties:{ variant:{ type:'string', enum:['base','brief'] } }, required:['variant'], additionalProperties:false
    });
    assert.doesNotMatch(url + request.body, /privado-fixture|recibo-fixture|sesion-fixture|conversacion-fixture|cuenta-fixture|gemini-fixture-only/);
    assert.equal(body.tools, undefined);
});

test('permite configurar otro ID Flash estable sin cambiar el servicio', async () => {
    const provider = createGeminiFlashProvider({ ...config, model:'gemini-3.8-flash', transport:async url => {
        assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
        return Response.json(structured('{"variant":"brief"}'));
    } });
    assert.equal(await provider.select(context, options()), 'brief');
});

test('rechaza temas o variantes no públicas y cancelación previa sin llamar al transporte', async () => {
    const provider = createGeminiFlashProvider({ ...config, transport: assert.fail });
    await assert.rejects(provider.select({ ...context, topic:'suministro-falso' }, options()), { code:'GEMINI_INVALID_INPUT' });
    await assert.rejects(provider.select({ ...context, variants:['detail'] }, options()), { code:'GEMINI_INVALID_INPUT' });
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(provider.select(context, { signal:controller.signal }), { code:'GEMINI_CANCELLED' });
});

test('clasifica 429 y fallo de red sin reintentos ni detalles sensibles', async () => {
    for (const [reply, code] of [
        [() => new Response('cuota-fixture-privada', { status:429 }), 'GEMINI_QUOTA'],
        [() => new Response('detalle-fixture-privado', { status:503 }), 'GEMINI_UNAVAILABLE'],
        [() => { throw Error('transporte-fixture-privado'); }, 'GEMINI_UNAVAILABLE']
    ]) {
        let calls = 0;
        const provider = createGeminiFlashProvider({ ...config, transport: async () => { calls++; return reply(); } });
        await assert.rejects(provider.select(context, options()), { code, message:code });
        assert.equal(calls, 1);
    }
});

test('rechaza respuesta truncada, texto libre, campos extra, bloqueo y metadatos de herramienta', async () => {
    const output = [
        structured('{"variant":"brief"}', 'MAX_TOKENS'),
        structured('{"variant":"detail"}'),
        structured('{"variant":"brief","output":"texto no fundamentado"}'),
        structured('no es json'),
        { ...structured('{"variant":"brief"}'), promptFeedback:{blockReason:'SAFETY'} },
        { candidates:[{finishReason:'STOP',content:{parts:[{text:'{"variant":"brief"}',functionCall:{name:'lookup'}}]}}] }
    ];
    for (const entry of output) {
        const provider = createGeminiFlashProvider({ ...config, transport: async () => Response.json(entry) });
        await assert.rejects(provider.select(context, options()), { code:'GEMINI_INVALID_OUTPUT' });
    }
});

test('respeta el aborto del servicio durante la petición', async () => {
    const controller = new AbortController();
    const provider = createGeminiFlashProvider({ ...config, transport: async (_url, {signal}) => {
        assert.equal(signal, controller.signal);
        controller.abort();
        throw signal.reason;
    } });
    await assert.rejects(provider.select(context, {signal:controller.signal}), { code:'GEMINI_CANCELLED' });
});
