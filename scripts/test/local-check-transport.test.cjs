'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { secureCheckEndpoint, requireSyntheticFixture, verifyFixtureDatabase } = require('../../Backend/local-check-transport');
test('los chequeos autenticados requieren TLS validado y destinos autorizados', () => {
    assert.equal(secureCheckEndpoint('https://web-tls:8443/', 'web', {}), 'https://web-tls:8443');
    assert.equal(secureCheckEndpoint('https://admin-tls:8443', 'admin', {}), 'https://admin-tls:8443');
    for (const value of [undefined, 'http://web', 'https://admin-tls', 'https://web-tls/path', 'https://user:pw@web-tls', 'https://web-tls/?x=1', 'https://example.invalid'])
        assert.throws(() => secureCheckEndpoint(value, 'web', {}));
    assert.throws(() => secureCheckEndpoint('https://web-tls', 'web', { NODE_TLS_REJECT_UNAUTHORIZED: '0' }), /TLS/);
    assert.throws(() => secureCheckEndpoint('https://web-tls', 'unknown', {}), /inválido/);
});

test('el chequeo rechaza configuración real o ambigua y verifica la identidad de PostgreSQL', async () => {
    const fixture = { NODE_ENV: 'development', POSTGRES_DB: 'hm_rootless_test', POSTGRES_USER: 'hm_fixture', DB_HOST: 'db', AUTH_TOKEN_SECRET: 'hidro-local-check-synthetic-only-2026' };
    assert.doesNotThrow(() => requireSyntheticFixture(fixture));
    for (const change of [{ NODE_ENV: 'production' }, { POSTGRES_DB: 'production' }, { POSTGRES_USER: 'postgres' }, { DB_HOST: 'example.invalid' }, { DATABASE_URL: 'postgres://fixture' }, { AUTH_TOKEN_SECRET: 'other' }])
        assert.throws(() => requireSyntheticFixture({ ...fixture, ...change }), /sintéticos/);
    await verifyFixtureDatabase({ query: async () => ({ rows: [{ db: 'hm_rootless_test', role: 'hm_fixture' }] }) });
    await assert.rejects(verifyFixtureDatabase({ query: async () => ({ rows: [{ db: 'production', role: 'hm_fixture' }] }) }), /ajeno/);
});
