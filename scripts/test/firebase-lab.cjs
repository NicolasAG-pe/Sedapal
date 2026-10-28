'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { validateConfig, localApi } = require('../build-android-fcm-lab.cjs');
test('compilación FCM solo acepta configuración privada del proyecto y paquete autorizados', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-sdk-fixture-')); fs.chmodSync(dir, 0o700);
  const file = path.join(dir, 'google-services.json');
  const config = { project_info: { project_id: 'hidromejora-push-dev', project_number: '000000000000' },
    client: [{ client_info: { mobilesdk_app_id: '1:000000000000:android:0000000000000000000000',
      android_client_info: { package_name: 'pe.edu.hidromejora.app' } }, api_key: [{ current_key: 'fixture-only' }] }] };
  const write = c => fs.writeFileSync(file, JSON.stringify(c), { mode: 0o600 });
  write(config); assert.equal(!!validateConfig(file), true);
  write({ ...config, project_info: { ...config.project_info, project_id: 'otro-fixture' } });
  assert.throws(() => validateConfig(file));
  config.client[0].client_info.android_client_info.package_name = 'otro.fixture'; write(config);
  assert.throws(() => validateConfig(file));
});
test('APK de laboratorio rechaza APIs externas, credenciales y parámetros; admite solo loopback/emulador', () => {
  assert.equal(localApi('http://10.0.2.2:12345'), 'http://10.0.2.2:12345');
  for (const u of ['https://api.example.invalid', 'http://192.168.1.4', 'http://user:secret@localhost',
    'http://localhost/?token=fixture', 'http://localhost/api']) assert.throws(() => localApi(u));
});
