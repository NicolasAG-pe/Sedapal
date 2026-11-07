'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { cleanEnvironment } = require('../test-runner.cjs');
const { groups, inventory, check, root } = require('../test-catalog.cjs');
test('TEST-T01: inventario íntegro, grupos sin duplicados y live fuera de default', () => {
    check(); const data = inventory();
    assert.equal(data.entries.length, new Set(data.entries.map(e => e.path)).size);
    const safe = [...groups.unit, ...groups.contract]; assert.equal(safe.length, new Set(safe).size);
    assert.ok(!safe.includes('Backend/test/email-live.cjs'));
    assert.ok(safe.includes('Backend/test/email-live.test.js'));
    assert.ok(groups.integration.includes('Backend/test/receipt-profile-compat.cjs'));
});
test('TEST-T02: entorno no hereda secretos, URLs o flags live', () => {
    const env = cleanEnvironment({ PATH: '/fixture', DATABASE_URL: 'DO_NOT_INHERIT', RESEND_API_KEY: 'DO_NOT_INHERIT', NODE_OPTIONS: '--inspect', PUSH_REAL_DELIVERY_ALLOWED: '1' });
    assert.equal(env.DATABASE_URL, undefined); assert.equal(env.RESEND_API_KEY, undefined);
    assert.equal(env.PUSH_REAL_DELIVERY_ALLOWED, '0'); assert.ok(!env.NODE_OPTIONS.includes('--inspect'));
});
test('TEST-T03: guard bloquea destino externo antes de DNS/conexión', () => {
    for (const code of ["require('net').connect({host:'example.invalid',port:443})", "require('net').connect(443,'example.invalid')", "fetch('https://example.invalid').catch(e=>{console.error(e.cause?.code);process.exitCode=1})"]) {
        const result = spawnSync(process.execPath, ['-e', code], { cwd: root, env: cleanEnvironment(), encoding: 'utf8' });
        assert.notEqual(result.status, 0); assert.match(result.stderr, /TEST_NETWORK_BLOCKED/);
    }
});
test('TEST-T04: runner propaga salida no cero de una prueba realmente fallida', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hidro-runner-failure-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'failure.cjs'); fs.writeFileSync(file, "require('node:test')('fallo sintético esperado',()=>{throw Error('synthetic-failure')});");
    const code = `process.exitCode=require(${JSON.stringify(path.join(root,'scripts/test-runner.cjs'))}).runFiles([${JSON.stringify(file)}]);`;
    const result = spawnSync(process.execPath, ['-e', code], { cwd: root, env: cleanEnvironment(), encoding: 'utf8' });
    assert.equal(result.status, 1); assert.match(result.stdout, /synthetic-failure/);
});
test('TEST-T05: CLI inválida y prerrequisitos de integración/E2E ausentes fallan cerrados', () => {
    for (const args of [['unknown'], ['safe','--file=Backend/test/email-live.cjs'], ['integration'], ['e2e']]) {
        const result = spawnSync(process.execPath, ['scripts/test-runner.cjs', ...args], { cwd: root, env: cleanEnvironment(), encoding: 'utf8' });
        assert.equal(result.status, 2, result.stdout + result.stderr);
    }
});

test('TEST-T06: integración no conecta si falta la contraseña sintética', () => {
    const env = { ...cleanEnvironment(), HIDRO_TEST_ISOLATED_DB: '1', HIDRO_EMAIL_TEST_DB_PORT: '54321' };
    const result = spawnSync(process.execPath, ['scripts/test-runner.cjs', 'integration'], { cwd: root, env, encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /contraseña sintéticos explícitos/);
});
