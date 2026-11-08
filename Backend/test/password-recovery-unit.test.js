'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const C = require('../password-recovery-crypto');
const { createPasswordRecovery, eligible } = require('../password-recovery');

function environment() {
  return { PASSWORD_RECOVERY_ENABLED: '1', PASSWORD_RECOVERY_SECRET: 'fixture-secret-distinct-for-recovery-123',
    PASSWORD_RECOVERY_OUTBOX_KEY: Buffer.alloc(32, 7).toString('base64'), RESEND_FROM: 'Pruebas <fixture@example.invalid>' };
}
test('recuperación exige claves independientes y remitente válido', () => {
  assert.equal(C.config({}), null);
  const env = environment();
  assert.equal(C.config(env).provider, 'resend');
  assert.throws(() => C.config({ ...env, PASSWORD_RECOVERY_SECRET: 'short' }), /Configuración privada/);
  assert.throws(() => C.config({ ...env, PASSWORD_RECOVERY_OUTBOX_KEY: 'invalid' }), /Configuración privada/);
  assert.throws(() => C.config({ ...env, AUTH_TOKEN_SECRET: env.PASSWORD_RECOVERY_SECRET }), /independientes/);
  assert.throws(() => C.config({ ...env, EMAIL_OUTBOX_KEY: Buffer.alloc(32, 7).toString('hex') }), /independientes/);
  assert.throws(() => C.config({ ...env, RESEND_FROM: 'invalid' }), /Remitente/);
});
test('cifrado de correo protege datos y autenticación asociada', () => {
  const key = crypto.randomBytes(32), id = crypto.randomUUID(), request = crypto.randomUUID();
  const message = C.message('fixture@example.invalid', 'other@example.invalid', '12345678');
  const encrypted = C.seal(message, key, id, request);
  assert.equal(C.open(encrypted, key, id, request), message);
  assert.ok(!encrypted.includes(Buffer.from('12345678')));
  assert.throws(() => C.open(encrypted, key, id, crypto.randomUUID()));
  const modified = Buffer.from(encrypted); modified[modified.length - 1] ^= 1;
  assert.throws(() => C.open(modified, key, id, request));
  assert.throws(() => C.open(Buffer.alloc(28), key, id, request), /inválido/);
  assert.match(JSON.parse(C.message('a@example.invalid', 'b@example.invalid')).text, /segundo factor/);
});
test('comparación de firmas rechaza formatos inválidos y propósitos diferentes', () => {
  const first = C.hmac('fixture-key', 'grant', 'value');
  assert.equal(C.equal(first, first), true);
  assert.equal(C.equal(first, C.hmac('fixture-key', 'code', 'value')), false);
  for (const invalid of [null, '', 'a'.repeat(63), 'Z'.repeat(64)]) assert.equal(C.equal(first, invalid), false);
  assert.equal(C.keyId(Buffer.from('fixture')), C.sha(Buffer.from('fixture')).slice(0, 16));
});
test('elegibilidad exige correo verificado y segundo factor para administradores', () => {
  const user = { activo: true, correo_verificado_en: '2026-01-01', rol: 'usuario', mfa_activo: false };
  assert.ok(eligible(user));
  assert.ok(!eligible({ ...user, activo: false }));
  assert.ok(!eligible({ ...user, correo_verificado_en: null }));
  assert.ok(!eligible({ ...user, rol: 'admin' }));
  assert.ok(eligible({ ...user, rol: 'admin', mfa_activo: true }));
  assert.ok(!eligible({ ...user, rol: 'otro' }));
});
test('solicitudes inválidas se rechazan antes de acceder a datos', async () => {
  const service = createPasswordRecovery({ pool: null, env: environment() });
  const id = crypto.randomUUID();
  assert.equal(service.enabled(), true);
  for (const correo of ['', 'sin-arroba', 'x'.repeat(121) + '@x.test']) {
    const response = await service.request({ solicitud_id: id, correo });
    assert.equal(response.error.status, 400);
  }
  assert.equal((await service.verify({ solicitud_id: id, codigo: 'x'.repeat(33) })).error.status, 400);
  assert.equal((await service.complete({ solicitud_id: 'incorrecto', permiso: 'x'.repeat(43) })).error.status, 400);
  for (const password of ['abcdefgh', '12345678', 'a1']) {
    assert.equal((await service.complete({ solicitud_id: id, permiso: 'x'.repeat(43), password_nueva: password, password_confirmacion: password })).error.status, 400);
  }
  assert.equal((await service.complete({ solicitud_id: id, permiso: 'x'.repeat(43), password_nueva: 'validpass1', password_confirmacion: 'different1' })).error.status, 400);
  const disabled = createPasswordRecovery({ pool: null, env: {} });
  assert.equal(disabled.enabled(), false);
  for (const method of ['request', 'verify', 'complete']) assert.equal((await disabled[method]({})).error.status, 503);
});
