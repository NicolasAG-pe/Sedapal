'use strict';

const knowledge = require('./sedapal-knowledge.js');
const defaultModel = 'openai/gpt-oss-20b';
const models = new Set([defaultModel, 'openai/gpt-oss-120b']);
const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
const maxResponseBytes = 16 * 1024;
const instructions = 'Redacta orientación pública en español peruano usando solo los extractos proporcionados. ' +
    'Usa una oración para explicar en palabras sencillas (simple) o resumir (summary). Amplía en detail y explica en standard, con hasta dos oraciones. ' +
    'En cada oración conserva al menos dos palabras de contenido distintas de cuatro letras o más del extracto citado y devuelve sus identificadores una sola vez en evidence. ' +
    'Usa texto plano en estilo impersonal, sin listas, enlaces, dígitos, guiones, fechas, importes ni acciones en nombre del usuario. ' +
    'Escribe «el recibo» o «el consumo» y evita atribuir datos al lector. ' +
    'Entrega de 25 a 640 caracteres y hasta 280 para summary. Si falta sustento, devuelve texto vacío.';
const outputReasons = new Set(['HTTP_BODY', 'BODY_SIZE', 'HTTP_JSON', 'ENVELOPE', 'FINISH_LENGTH', 'FINISH_REASON',
    'MESSAGE', 'MESSAGE_CONTENT', 'CONTENT_JSON', 'SCHEMA', 'EVIDENCE', 'TEXT_LENGTH', 'CHARACTERS', 'UNSAFE_TEXT',
    'GROUNDING', 'ACCOUNT_FACTS', 'SECRET_ECHO', 'CATALOG']);
const isGroqOutputReason = reason => outputReasons.has(reason);

function failure(code) {
    return Object.assign(new Error(code), { code });
}

function invalidOutput(reason) {
    return Object.assign(failure('GROQ_INVALID_OUTPUT'), { reason });
}

function parseJson(raw, reason) {
    try { return JSON.parse(raw); } catch (_) { throw invalidOutput(reason); }
}

async function readResponse(response, signal) {
    const reader = response.body?.getReader();
    if (!reader) throw invalidOutput('HTTP_BODY');
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
            if (size > maxResponseBytes) throw invalidOutput('BODY_SIZE');
            data += decoder.decode(value, { stream: true });
        }
        signal.throwIfAborted();
        return parseJson(data + decoder.decode(), 'HTTP_JSON');
    } catch (error) {
        cancel();
        if (signal.aborted) throw failure('GROQ_CANCELLED');
        throw invalidOutput(isGroqOutputReason(error?.reason) ? error.reason : 'HTTP_BODY');
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

// El catálogo local conserva sus datos públicos. A Groq solo se le ofrecen
// oraciones que satisfacen los mismos filtros que deberá superar la respuesta.
function publicExtracts(topic) {
    return knowledge.evidence(topic).flatMap(({ id, text }) => {
        const sentences = text.split(/(?<=[.!?])\s+/).filter(sentence =>
            !claimsAccountFacts(sentence) && knowledge.generated(topic, { text: sentence, evidence: [id] }));
        return sentences.length ? [{ id, text: sentences.join(' ') }] : [];
    });
}

function createGroqCloudProvider({ model = defaultModel, apiKey, transport, now = Date.now } = {}) {
    if (!models.has(model) || typeof apiKey !== 'string' || !/^[!-~]+$/.test(apiKey) || typeof transport !== 'function') {
        throw failure('GROQ_INVALID_CONFIG');
    }
    let nextRequestAt = 0;

    return Object.freeze({
        mode: 'groq',
        async generate({ topic, continuation, style }, { signal } = {}) {
            if (!knowledge.get(topic) || typeof continuation !== 'boolean' || !knowledge.styles.includes(style)) {
                throw failure('GROQ_INVALID_INPUT');
            }
            if (!signal || signal.aborted) throw failure('GROQ_CANCELLED');
            if (now() < nextRequestAt) throw failure('GROQ_QUOTA');
            const extracts = publicExtracts(topic);
            if (!extracts.length) throw invalidOutput('CATALOG');
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

            const payload = await readResponse(response, signal);
            const choices = payload?.choices;
            if (!Array.isArray(choices) || choices.length !== 1) throw invalidOutput('ENVELOPE');
            const [choice] = choices;
            if (choice?.finish_reason === 'length') throw invalidOutput('FINISH_LENGTH');
            if (choice?.finish_reason !== 'stop') throw invalidOutput('FINISH_REASON');
            const message = choice.message;
            if (message?.role !== 'assistant' || message.refusal || message.tool_calls?.length || message.function_call) {
                throw invalidOutput('MESSAGE');
            }
            if (typeof message.content !== 'string' || message.content.length > 2048) throw invalidOutput('MESSAGE_CONTENT');
            const content = parseJson(message.content, 'CONTENT_JSON');
            const answer = knowledge.generated(topic, content, style, { extracts, onReject(reason) { throw invalidOutput(reason); } });
            if (answer.text.includes(apiKey)) throw invalidOutput('SECRET_ECHO');
            if (claimsAccountFacts(answer.text)) throw invalidOutput('ACCOUNT_FACTS');
            return answer;
        }
    });
}

module.exports = { createGroqCloudProvider, isGroqOutputReason };
