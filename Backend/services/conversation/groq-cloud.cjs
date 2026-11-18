'use strict';

const knowledge = require('../../../Frontend/assets/js/sedapal-knowledge.js');
const defaultModel = 'openai/gpt-oss-20b';
const models = new Set([defaultModel, 'openai/gpt-oss-120b']);
const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
const maxResponseBytes = 16 * 1024;
const instructions = 'Redacta orientación pública en español peruano usando solo los extractos proporcionados. ' +
    'El estilo standard explica, detail amplía, simple usa palabras sencillas y summary resume. ' +
    'Apoya cada frase en un extracto y devuelve sus identificadores en evidence. ' +
    'Evita enlaces, cifras, datos de usuarios, afirmaciones sobre casos concretos y acciones en nombre del usuario. ' +
    'Entrega texto plano entre 25 y 640 caracteres y hasta 280 para summary. Si falta sustento, devuelve texto vacío.';

function failure(code) {
    return Object.assign(new Error(code), { code });
}

async function readResponse(response, signal) {
    const reader = response.body?.getReader();
    if (!reader) throw failure('GROQ_INVALID_OUTPUT');
    const cancel = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener('abort', cancel, { once: true });
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let size = 0;
    let data = '';
    try {
        for (;;) {
            signal.throwIfAborted();
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxResponseBytes) throw failure('GROQ_INVALID_OUTPUT');
            data += decoder.decode(value, { stream: true });
        }
        signal.throwIfAborted();
        return JSON.parse(data + decoder.decode());
    } catch (error) {
        cancel();
        throw error;
    } finally {
        signal.removeEventListener('abort', cancel);
        reader.releaseLock();
    }
}

function responseCode(status) {
    if (status === 429) return 'GROQ_QUOTA';
    if (status === 401 || status === 403) return 'GROQ_AUTH';
    if (status >= 400 && status < 500) return 'GROQ_REQUEST';
    return 'GROQ_UNAVAILABLE';
}

function claimsAccountFacts(text) {
    const literal = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return /\b(?:tu (?:recibo|pago|consumo|deuda|incidencia|suministro|corte)|pagaste|adeudas|tarifas?|cuesta|costara|vencera|restablecera|soles|centimos|dolares|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/.test(literal) ||
        /\b(?:un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|cien|mil|veinti\w+|\w+enta)\s+(?:litros|metros cubicos|m³)/.test(literal) ||
        /\b(?:incidencia|reporte)\b.{0,48}\b(?:resuelt[oa]|cerrad[oa]|en tramite)\b/.test(literal);
}

function createGroqCloudProvider({ model = defaultModel, apiKey, transport, now = Date.now } = {}) {
    if (!models.has(model) || typeof apiKey !== 'string' || !/^[!-~]+$/.test(apiKey) || typeof transport !== 'function') {
        throw failure('GROQ_INVALID_CONFIG');
    }
    let nextRequestAt = 0;

    return Object.freeze({
        mode: 'groq',
        async generate({ topic, continuation, style }, { signal } = {}) {
            const extracts = knowledge.evidence(topic);
            if (!extracts.length || typeof continuation !== 'boolean' || !knowledge.styles.includes(style)) {
                throw failure('GROQ_INVALID_INPUT');
            }
            if (!signal || signal.aborted) throw failure('GROQ_CANCELLED');
            if (now() < nextRequestAt) throw failure('GROQ_QUOTA');
            const body = {
                model,
                messages: [
                    { role: 'system', content: instructions },
                    { role: 'user', content: JSON.stringify({ topic, continuation, style, extracts }) }
                ],
                max_completion_tokens: 512,
                reasoning_effort: 'low',
                include_reasoning: false,
                response_format: { type: 'json_schema', json_schema: {
                    name: 'orientacion_publica', strict: true, schema: {
                        type: 'object',
                        properties: {
                            text: { type: 'string' },
                            evidence: { type: 'array', items: { type: 'string', enum: extracts.map(extract => extract.id) } }
                        },
                        required: ['text', 'evidence'],
                        additionalProperties: false
                    }
                } }
            };

            let response;
            try {
                response = await transport(endpoint, {
                    method: 'POST', redirect: 'error', signal,
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
                    body: JSON.stringify(body)
                });
            } catch (_) {
                throw failure(signal.aborted ? 'GROQ_CANCELLED' : 'GROQ_UNAVAILABLE');
            }
            if (!response?.ok || signal.aborted) {
                void response?.body?.cancel().catch(() => {});
                if (signal.aborted) throw failure('GROQ_CANCELLED');
                if (response?.status === 429) {
                    const retryAfter = response.headers.get('retry-after') || '';
                    const seconds = /^\d+$/.test(retryAfter) ? Math.min(60, Math.max(1, Number(retryAfter))) : 10;
                    nextRequestAt = Math.max(nextRequestAt, now() + seconds * 1000);
                }
                throw failure(responseCode(response?.status));
            }

            try {
                const { choices } = await readResponse(response, signal);
                if (!Array.isArray(choices) || choices.length !== 1) throw failure('GROQ_INVALID_OUTPUT');
                const [choice] = choices;
                const message = choice?.message;
                if (choice?.finish_reason !== 'stop' || message?.role !== 'assistant' || message.refusal ||
                    message.tool_calls?.length || message.function_call || typeof message.content !== 'string' ||
                    message.content.length > 2048) {
                    throw failure('GROQ_INVALID_OUTPUT');
                }
                const answer = knowledge.generated(topic, JSON.parse(message.content), style);
                if (!answer || answer.text.includes(apiKey) || claimsAccountFacts(answer.text)) throw failure('GROQ_INVALID_OUTPUT');
                return answer;
            } catch (_) {
                throw failure(signal.aborted ? 'GROQ_CANCELLED' : 'GROQ_INVALID_OUTPUT');
            }
        }
    });
}

module.exports = { createGroqCloudProvider };
