'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const merge = path.join(root, 'scripts/merge-browser-coverage.cjs');
const capture = path.join(root, 'scripts/capture-browser-coverage.cjs');
const c8 = require.resolve('c8/package.json');
function run(script, args, env = {}) {
    return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } });
}
test('fusiona únicamente fuentes locales idénticas y omite HTML inline', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-coverage-test-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const node = path.join(dir, 'node.json'), client = path.join(dir, 'client.json'), admin = path.join(dir, 'admin.json');
    fs.writeFileSync(node, '{}'); fs.writeFileSync(admin, '[]');
    const source = fs.readFileSync(path.join(root, 'Shared/ui.js'), 'utf8');
    const entry = { url: 'http://127.0.0.1/shared/ui.js', source, functions: [{ functionName: '', isBlockCoverage: true, ranges: [{ startOffset: 0, endOffset: source.length, count: 1 }] }] };
    fs.writeFileSync(client, JSON.stringify([entry, { url: 'http://localhost/index.html' }, { ...entry, source: source + ' changed' }]));
    const result = run(merge, [node, client, admin, dir, c8]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /1 scripts con fuente verificada; 1 inline sin mapear; 1 sin coincidencia/);
    assert.match(fs.readFileSync(path.join(dir, 'lcov.info'), 'utf8'), /SF:.*Shared\/ui\.js/);
    entry.url = 'https://example.com/shared/ui.js'; fs.writeFileSync(client, JSON.stringify([entry]));
    const rejected = run(merge, [node, client, admin, dir, c8]);
    assert.notEqual(rejected.status, 0); assert.match(rejected.stderr, /origen no local rechazada/);
});
test('captura exige entorno sintético y rechaza orígenes externos antes de iniciar navegador', () => {
    const withoutFlag = run(capture, [], { HM_COVERAGE_SYNTHETIC: '' });
    assert.notEqual(withoutFlag.status, 0); assert.match(withoutFlag.stderr, /entorno sintético aislado/);
    const external = run(capture, [], { HM_COVERAGE_SYNTHETIC: '1', HM_COVERAGE_CLIENT_ORIGIN: 'https://example.com' });
    assert.notEqual(external.status, 0); assert.match(external.stderr, /orígenes loopback/);
    const noCredentials = run(capture, [], { HM_COVERAGE_SYNTHETIC: '1', HM_COVERAGE_CLIENT_ORIGIN: 'http://127.0.0.1:1234', HM_COVERAGE_ADMIN_ORIGIN: 'http://127.0.0.1:1235' });
    assert.notEqual(noCredentials.status, 0); assert.match(noCredentials.stderr, /Faltan cuentas sintéticas/);
});
