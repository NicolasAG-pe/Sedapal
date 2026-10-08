'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadReleaseSigning } = require('../android-release-signing.cjs');
const directory = path.resolve(__dirname, '../../artifacts/tests/release-signing');
fs.mkdirSync(directory, { recursive: true });
function fixture() {
  const base = fs.mkdtempSync(path.join(directory, 'fixture-'));
  const repository = path.join(base, 'repository'), privateDir = path.join(base, 'private');
  fs.mkdirSync(repository); fs.mkdirSync(privateDir, { mode: 0o700 });
  const key = path.join(privateDir, 'fixture.keystore'), config = path.join(privateDir, 'release.env');
  fs.writeFileSync(key, 'Not a real keystore: loader fixture only', { mode: 0o600 });
  const values = { HM_RELEASE_STORE_FILE: key, HM_RELEASE_STORE_PASSWORD: 'fixture-only-password',
    HM_RELEASE_KEY_ALIAS: 'fixture-only-alias', HM_RELEASE_KEY_PASSWORD: 'fixture-only-password' };
  fs.writeFileSync(config, Object.entries(values).map(([k, v]) => k + '=' + v).join('\n'), { mode: 0o600 });
  return { values, key, config, repository, options: { projectRoot: repository, configFile: config } };
}
test('Carga solo cuatro variables de firma desde archivo privado externo', () => {
  const f = fixture();
  assert.deepEqual(loadReleaseSigning({ DATABASE_URL: 'unrelated-fixture' }, f.options), f.values);
});
test('Las variables explícitas tienen prioridad; una variable vacía falla', () => {
  const f = fixture();
  assert.equal(loadReleaseSigning({ HM_RELEASE_KEY_ALIAS: 'override-fixture' }, f.options).HM_RELEASE_KEY_ALIAS, 'override-fixture');
  assert.throws(() => loadReleaseSigning({ HM_RELEASE_KEY_PASSWORD: '' }, f.options), /Faltan variables/);
});
test('Sin archivo ni variables falla claramente, sin crear material de firma', () => {
  const f = fixture(), config = path.join(f.repository, 'missing.env');
  assert.throws(() => loadReleaseSigning({}, { ...f.options, configFile: config }), /Faltan variables/);
  assert.equal(fs.existsSync(config), false);
});
test('Rechaza credenciales legibles por otros usuarios', () => {
  const f = fixture(); fs.chmodSync(f.config, 0o644);
  assert.throws(() => loadReleaseSigning({}, f.options), /600.*700/);
});
test('Rechaza claves dentro del repositorio y claves con permisos abiertos', () => {
  const f = fixture(), key = path.join(f.repository, 'accidental.keystore');
  fs.writeFileSync(key, 'fixture', { mode: 0o600 });
  assert.throws(() => loadReleaseSigning({ ...f.values, HM_RELEASE_STORE_FILE: key }, f.options), /dentro del repositorio/);
  fs.chmodSync(f.key, 0o644);
  assert.throws(() => loadReleaseSigning(f.values, f.options), /permisos privados/);
});
test('Rechaza enlaces y directorios privados accesibles por otros usuarios', () => {
  const f = fixture(), link = path.join(path.dirname(f.key), 'linked.keystore');
  fs.symlinkSync(f.key, link);
  assert.throws(() => loadReleaseSigning({ ...f.values, HM_RELEASE_STORE_FILE: link }, f.options), /permisos privados/);
  fs.chmodSync(path.dirname(f.config), 0o755);
  assert.throws(() => loadReleaseSigning({}, f.options), /600.*700/);
});
test('Rechaza líneas ejecutables, duplicadas o variables ajenas sin revelar su contenido', () => {
  for (const text of ['export HM_RELEASE_KEY_ALIAS=fixture', 'HM_RELEASE_KEY_ALIAS=a\nHM_RELEASE_KEY_ALIAS=b', 'DATABASE_URL=unrelated-fixture']) {
    const f = fixture(); fs.writeFileSync(f.config, text);
    assert.throws(() => loadReleaseSigning({}, f.options), error => /Formato/.test(error.message) && !error.message.includes('unrelated-fixture'));
  }
});
