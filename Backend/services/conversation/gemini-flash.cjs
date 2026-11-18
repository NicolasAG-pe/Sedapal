'use strict';

const knowledge = require('../../../Frontend/assets/js/sedapal-knowledge.js');
const defaultModel = 'gemini-3.5-flash-lite';
const flashModel = /^gemini-[3-9]\d?(?:\.\d+)?-flash(?:-lite)?$/;
const instructions = 'Selecciona una variante para un tema público. base: explicación general; detail: ampliación; brief: resumen corto. Devuelve solo la selección solicitada.';

function failure(code) {
    return Object.assign(new Error(code), { code });
}

function selection(data, variants) {
    if (data?.promptFeedback?.blockReason || !Array.isArray(data?.candidates) || data.candidates.length !== 1) {
        throw failure('GEMINI_INVALID_OUTPUT');
    }
    const [candidate] = data.candidates;
    const parts = candidate?.content?.parts;
    if (candidate?.finishReason !== 'STOP' || !Array.isArray(parts)) throw failure('GEMINI_INVALID_OUTPUT');
    const answer = parts.filter(part => part?.thought !== true);
    const text = answer[0]?.text;
    if (answer.length !== 1 || typeof text !== 'string' || text.length > 128 ||
        Object.keys(answer[0]).some(key => !['text', 'thought'].includes(key))) {
        throw failure('GEMINI_INVALID_OUTPUT');
    }
    let decoded;
    try { decoded = JSON.parse(text); }
    catch (_) { throw failure('GEMINI_INVALID_OUTPUT'); }
    if (!decoded || Object.keys(decoded).length !== 1 || !variants.includes(decoded.variant)) {
        throw failure('GEMINI_INVALID_OUTPUT');
    }
    return decoded.variant;
}

// Declarar un adaptador no lo activa. El arranque del servicio solo instancia el simulador.
function createGeminiFlashProvider({ model = defaultModel, apiKey, transport } = {}) {
    if (typeof model !== 'string' || !flashModel.test(model) ||
        typeof apiKey !== 'string' || !apiKey.trim() || /\s/.test(apiKey) ||
        typeof transport !== 'function') {
        throw failure('GEMINI_INVALID_CONFIG');
    }
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';

    return Object.freeze({
        mode: 'gemini',
        async select({ topic, continuation, variants }, { signal } = {}) {
            const baseVariant = continuation === true ? 'detail' : 'base';
            if (typeof topic !== 'string' || !knowledge.get(topic) || typeof continuation !== 'boolean' ||
                !Array.isArray(variants) || !variants.length || variants.length > 2 ||
                !variants.every(variant => variant === baseVariant || variant === 'brief')) {
                throw failure('GEMINI_INVALID_INPUT');
            }
            if (!signal || signal.aborted) throw failure('GEMINI_CANCELLED');
            const allowed = [...new Set(variants)];
            const body = {
                systemInstruction: { parts: [{ text: instructions }] },
                contents: [{ role: 'user', parts: [{ text: JSON.stringify({ topic, continuation, variants: allowed }) }] }],
                generationConfig: {
                    maxOutputTokens: 128,
                    responseFormat: { text: {
                        mimeType: 'APPLICATION_JSON',
                        schema: {
                            type: 'object',
                            properties: { variant: { type: 'string', enum: allowed } },
                            required: ['variant'],
                            additionalProperties: false
                        }
                    } }
                }
            };
            let response;
            try {
                response = await transport(url, {
                    method: 'POST', redirect: 'error', signal,
                    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                    body: JSON.stringify(body)
                });
            } catch (_) {
                throw failure(signal.aborted ? 'GEMINI_CANCELLED' : 'GEMINI_UNAVAILABLE');
            }
            if (!response.ok) {
                await response.body?.cancel().catch(() => {});
                throw failure(response.status === 429 ? 'GEMINI_QUOTA' : 'GEMINI_UNAVAILABLE');
            }
            if (signal.aborted) throw failure('GEMINI_CANCELLED');
            let data;
            try { data = await response.json(); }
            catch (_) { throw failure(signal.aborted ? 'GEMINI_CANCELLED' : 'GEMINI_INVALID_OUTPUT'); }
            if (signal.aborted) throw failure('GEMINI_CANCELLED');
            return selection(data, allowed);
        }
    });
}

module.exports = { createGeminiFlashProvider };
