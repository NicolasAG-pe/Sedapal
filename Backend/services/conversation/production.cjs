'use strict';
const { createConversationRouter, readSession, providerLogger, providerTimeout } = require('./server.cjs');
const { configuredProvider, simulatedProvider } = require('./provider.cjs');

const userId = value => /^[1-9]\d{0,18}$/.test(value ?? '');

function createOfficialConversation({ authenticate, authOrigin, env = process.env, transport = globalThis.fetch,
    onProviderError = providerLogger() }) {
    const providerName = env.CHAT_PROVIDER || 'local';
    const canaryUserId = env.CHAT_GROQ_CANARY_USER_ID || '';
    const publicEnabled = env.CHAT_GROQ_PUBLIC === '1';
    const scopeValid = publicEnabled ? !canaryUserId : userId(canaryUserId);
    let provider = simulatedProvider;
    if (!['local', 'groq'].includes(providerName) || (providerName === 'groq' && !scopeValid)) {
        onProviderError('CHAT_PROVIDER_INVALID_CONFIG');
    } else if (providerName === 'groq') {
        provider = configuredProvider(env, transport, onProviderError);
    }

    async function validateSession(bearer) {
        const user = authOrigin ? await readSession(authOrigin, bearer) : (await authenticate(bearer, 1500)).user;
        if (user?.rol !== 'usuario' || !/^\d{9}$/.test(user.numero_suministro || '')) return false;
        return userId(user.id_usuario) && String(user.id_usuario);
    }

    return createConversationRouter({ validateSession, provider, providerMs: providerTimeout, onProviderError,
        canGenerate: identity => publicEnabled || identity === canaryUserId });
}

module.exports = { createOfficialConversation };
