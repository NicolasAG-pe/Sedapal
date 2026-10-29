'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { buildFcmRelease } = require('../build-android-fcm-release.cjs');
test('release FCM: conserva original privado, firma/API del constructor y retira solo la copia efímera', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-fcm-release-fixture-'));
  fs.chmodSync(dir, 0o700);
  const root = path.join(dir, 'worktree'), config = path.join(dir, 'google-services.json');
  fs.mkdirSync(path.join(root, 'android/app'), { recursive: true }); fs.writeFileSync(path.join(root, '.git'), 'fixture');
  fs.writeFileSync(config, JSON.stringify({ project_info: { project_id: 'hidromejora-push-dev', project_number: '000000000000' },
    client: [{ client_info: { mobilesdk_app_id: '1:000000000000:android:0000000000000000000000', android_client_info: { package_name: 'pe.edu.hidromejora.app' } }, api_key: [{ current_key: 'fixture-only' }] }] }), { mode: 0o600 });
  const target = path.join(root, 'android/app/google-services.json');
  function build(env) {
    assert.equal(env.HM_PUSH_ANDROID_ENABLED, '1'); assert.equal(env.HM_RELEASE_ENV_FILE, '/private/fixture');
    assert.equal(fs.statSync(target).mode & 0o777, 0o600); return 'fixture-result';
  }
  assert.equal(buildFcmRelease(config, { HM_RELEASE_ENV_FILE: '/private/fixture' }, { root, build }), 'fixture-result');
  assert.equal(fs.existsSync(target), false); assert.equal(fs.existsSync(config), true);
  assert.throws(() => buildFcmRelease(config, {}, { root, build() { throw Error('fixture'); } }));
  assert.equal(fs.existsSync(target), false);
  fs.writeFileSync(target, 'existing-private-fixture');
  assert.throws(() => buildFcmRelease(config, {}, { root, build }));
  assert.equal(fs.readFileSync(target, 'utf8'), 'existing-private-fixture');
  fs.rmSync(dir, { recursive: true });
});
