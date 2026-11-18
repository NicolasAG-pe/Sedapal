'use strict';

const knowledge = require('./sedapal-knowledge.js');

// El proveedor solo decide la variante de un artículo público. No recibe mensajes, cuentas ni el token.
const simulatedProvider = Object.freeze({
    async select({ continuation, variants }) {
        return continuation && variants.includes('detail') ? 'detail' : 'base';
    }
});

const simulatedGenerationProvider = Object.freeze({
    ...simulatedProvider,
    mode: 'simulated',
    async generate({ topic, continuation, style }) {
        const extracts = knowledge.evidence(topic);
        const preferred = ['simple', 'summary'].includes(style) ? 'brief' : continuation ? 'detail' : 'base';
        const extract = extracts.find(entry => entry.id === preferred) || extracts[0];
        const introduction = { simple: 'En palabras sencillas: ', summary: 'En resumen: ', detail: 'Con más detalle: ' };
        return { text: (introduction[style] || 'Para orientarte: ') + extract.text, evidence: [extract.id] };
    }
});

function configuredProvider(env, transport = globalThis.fetch, onError = () => {}) {
    switch (env.CHAT_PROVIDER || 'local') {
        case 'local': return simulatedProvider;
        case 'simulated-generation': return simulatedGenerationProvider;
        case 'groq': {
            const { createGroqCloudProvider } = require('./groq-cloud.cjs');
            try {
                return createGroqCloudProvider({ model: env.CHAT_GROQ_MODEL, apiKey: env.CHAT_GROQ_API_KEY, transport });
            } catch (error) {
                if (error?.code !== 'GROQ_INVALID_CONFIG') throw error;
                onError(error.code);
                return simulatedProvider;
            }
        }
        default: throw Error('CHAT_PROVIDER_INVALID');
    }
}

module.exports = { simulatedProvider, configuredProvider };
