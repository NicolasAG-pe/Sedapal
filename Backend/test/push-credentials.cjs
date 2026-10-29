'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { temporaryAccessToken } = require('../push-credentials');
const { configuredSender } = require('../push-provider');
const scope = 'https://www.googleapis.com/auth/firebase.messaging';
test('validación en Render exige pareja de flags e identificador único; por defecto no limita la cola normal', () => {
  const { validationConfiguration } = require('../workers/push.cjs');
  const id = '00000000-0000-4000-8000-000000000001';
  assert.equal(validationConfiguration({}), null);
  assert.equal(validationConfiguration({ PUSH_VALIDATION_SINGLE_ATTEMPT: '0' }), null);
  assert.deepEqual(validationConfiguration({ PUSH_VALIDATION_SINGLE_ATTEMPT: '1', PUSH_VALIDATION_DELIVERY_ID: id }), { deliveryId: id, singleAttempt: true });
  for (const env of [{ PUSH_VALIDATION_SINGLE_ATTEMPT: '1' }, { PUSH_VALIDATION_DELIVERY_ID: id },
    { PUSH_VALIDATION_SINGLE_ATTEMPT: '0', PUSH_VALIDATION_DELIVERY_ID: id },
    { PUSH_VALIDATION_SINGLE_ATTEMPT: '1', PUSH_VALIDATION_DELIVERY_ID: 'invalid' }]) assert.throws(() => validationConfiguration(env));
});
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-fcm-credential-fixture-'));
  fs.chmodSync(dir, 0o700);
  const file = path.join(dir, 'access-token-fixture.json'), now = Date.now();
  const c = { type: 'fcm_temporary_access_token', project_id: 'hidro-fixture',
    client_email: 'hm-fcm-pilot@hidro-fixture.iam.gserviceaccount.com', scope,
    access_token: 'fixture-temporary-access-0001', expire_time: new Date(now + 600000).toISOString() };
  const write = (changes = {}) => fs.writeFileSync(file, JSON.stringify({ ...c, ...changes }), { mode: 0o600 });
  write();
  return { file, c, write, now, env: { PUSH_PROVIDER: 'fcm', PUSH_REAL_DELIVERY_ALLOWED: '1', PUSH_AUTH_MODE: 'access_token_file',
    PUSH_ACCESS_TOKEN_FILE: file, PUSH_FIREBASE_PROJECT_ID: c.project_id, PUSH_SENDER_SERVICE_ACCOUNT: c.client_email } };
}
test('FCM temporal: vuelve a leer rotación y caducidad sin red OAuth ni clave privada', async () => {
  const f = fixture(), token = temporaryAccessToken(f.env, () => f.now);
  assert.equal((await token()) === f.c.access_token, true);
  f.write({ access_token: 'fixture-temporary-access-0002' });
  assert.equal((await token()) === 'fixture-temporary-access-0002', true);
  f.write({ expire_time: new Date(f.now + 30000).toISOString() });
  await assert.rejects(token(), /Credencial temporal/);
});
test('FCM temporal: rechaza proyecto, identidad, scope, duración y claves privadas inesperadas', async () => {
  const f = fixture(), token = temporaryAccessToken(f.env, () => f.now);
  for (const invalid of [ { project_id: 'otro-fixture' }, { client_email: 'otro@hidro-fixture.iam.gserviceaccount.com' },
    { scope: 'https://www.googleapis.com/auth/cloud-platform' }, { expire_time: new Date(f.now + 7200000).toISOString() },
    { expire_time: 'invalido' }, { private_key: 'fixture-forbidden' }, { access_token: 'fixture\ninvalid-token' } ]) {
    f.write(invalid); await assert.rejects(token(), /Credencial temporal/);
  }
  assert.throws(() => temporaryAccessToken({ ...f.env, PUSH_SENDER_SERVICE_ACCOUNT: 'firebase-adminsdk-fixture@hidro-fixture.iam.gserviceaccount.com' }));
});
test('FCM temporal: rechaza archivo público, symlink, ruta relativa y credencial dentro del repo', async () => {
  const f = fixture(); fs.chmodSync(f.file, 0o644);
  assert.throws(() => temporaryAccessToken(f.env), /Archivo privado/);
  fs.chmodSync(f.file, 0o600);
  const link = f.file + '.link'; fs.symlinkSync(f.file, link);
  assert.throws(() => temporaryAccessToken({ ...f.env, PUSH_ACCESS_TOKEN_FILE: link }), /Archivo privado/);
  assert.throws(() => temporaryAccessToken({ ...f.env, PUSH_ACCESS_TOKEN_FILE: 'relative.json' }), /Archivo privado/);
  const internal = path.resolve(__dirname, '../package.json');
  assert.throws(() => temporaryAccessToken({ ...f.env, PUSH_ACCESS_TOKEN_FILE: internal }), /Archivo privado/);
});
test('FCM permanece cerrado sin autorización y no acepta dos fuentes de identidad', () => {
  const f = fixture();
  assert.throws(() => configuredSender({ ...f.env, PUSH_REAL_DELIVERY_ALLOWED: '0' }), /no autorizado/);
  assert.throws(() => configuredSender({ ...f.env, PUSH_SERVICE_ACCOUNT_FILE: '/fixture/private.json' }), /incompatibles/);
  assert.throws(() => configuredSender({ ...f.env, PUSH_AUTH_MODE: 'invalido' }), /Modo/);
});
test('FCM temporal reutiliza HTTP v1; una credencial vencida no produce ninguna solicitud', async () => {
  const f = fixture(), original = global.fetch; let calls = 0;
  try {
    global.fetch = async (url, options) => {
      calls++; assert.equal(url, 'https://fcm.googleapis.com/v1/projects/hidro-fixture/messages:send');
      assert.equal(options.headers.Authorization === 'Bearer ' + f.c.access_token, true);
      return Response.json({ name: 'projects/hidro-fixture/messages/fixture' });
    };
    const send = configuredSender(f.env), message = { data: { hm_event: 'fixture' } };
    assert.equal((await send({ token: 'fixture-device', message })).kind, 'aceptado');
    f.write({ expire_time: new Date(f.now - 1000).toISOString() });
    assert.equal((await send({ token: 'fixture-device', message })).kind, 'configuracion');
    assert.equal(calls, 1);
    assert.throws(() => configuredSender(f.env), /Credencial temporal/);
  } finally { global.fetch = original; }
});
test('identidad permanente dedicada: JSON de runtime pasa a copia privada sin filtrarse al worker', () => {
  const { preparePushCredentials, validateServiceAccount, readPrivateJson } = require('../push-credentials');
  const { privateKey } = require('node:crypto').generateKeyPairSync('rsa', { modulusLength: 2048 });
  const account = { type: 'service_account', project_id: 'hidro-fixture',
    client_email: 'hm-fcm-pilot@hidro-fixture.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  const env = { PUSH_FIREBASE_PROJECT_ID: account.project_id, PUSH_SENDER_SERVICE_ACCOUNT: account.client_email,
    PUSH_SERVICE_ACCOUNT_JSON: JSON.stringify(account) };
  for (const invalid of [{ project_id: 'otro-fixture' }, { client_email: 'otro-fixture@hidro-fixture.iam.gserviceaccount.com' },
    { private_key: 'not-a-key' }, { type: 'authorized_user' }]) assert.throws(() => validateServiceAccount({ ...account, ...invalid }, env));
  assert.throws(() => validateServiceAccount(account, { ...env, PUSH_SENDER_SERVICE_ACCOUNT: undefined }));
  assert.throws(() => preparePushCredentials({ ...env, PUSH_SERVICE_ACCOUNT_FILE: '/private/other' }));
  assert.throws(() => preparePushCredentials({ ...env, PUSH_AUTH_MODE: 'access_token_file' }));
  const prepared = preparePushCredentials(env), file = prepared.env.PUSH_SERVICE_ACCOUNT_FILE;
  assert.equal(prepared.env.PUSH_SERVICE_ACCOUNT_JSON, undefined);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
  assert.deepEqual(readPrivateJson(file), account);
  prepared.cleanup(); assert.equal(fs.existsSync(file), false);
});
