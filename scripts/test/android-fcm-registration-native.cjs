'use strict';
// SDK FCM real para el registro; no llama messages:send ni crea un worker de envío.
const assert = require('node:assert/strict');
module.exports = async ({ ctx, getPage, restart, until, ok, screenshot, login, dashboard, logout, android }) => {
  const p = () => getPage(), pkg = 'pe.edu.hidromejora.app';
  assert.equal(process.env.PUSH_REAL_DELIVERY_ALLOWED, '0');
  assert.equal(process.env.PUSH_WORKER_ENABLED, '0');
  const apiLevel = android('shell', 'getprop', 'ro.build.version.sdk').trim();
  assert.ok(['33', '34', '35'].includes(apiLevel));
  const accounts = [];
  for (const n of [711, 712]) {
    const a = ctx.registro(n), reg = (await ctx.request('register', a, 202)).data;
    await ctx.drain();
    const d = (await ctx.request('verify-email', ctx.verificar(reg.registro_id, ctx.codigo(a.correo)), 201)).data;
    accounts.push({ ...a, ...d });
  }
  async function profile() {
    await until(() => p().evaluate(() => localStorage.getItem('hm_tutorial_seen') === '1' || document.body.classList.contains('tutorial-open')), 'tutorial disponible antes de Cuenta');
    if (await p().evaluate(() => document.body.classList.contains('tutorial-open')))
      await p().locator('#spot-skip-mobile:visible,#spot-skip:visible').first().click();
    await until(() => p().evaluate(() => !document.body.classList.contains('tutorial-open')), 'tutorial cerrado con su control real');
    await p().evaluate(() => document.querySelector('#sidebar [data-sec=perfil]').click());
    await p().waitForFunction(() => !document.getElementById('push-enable').disabled);
    await p().locator('#push-settings').scrollIntoViewIfNeeded();
  }
  const active = async () => (await ctx.db.query('SELECT count(*)::int n FROM push_dispositivos WHERE activo')).rows[0].n;
  async function nativeTap(pattern) {
    let target;
    await until(() => {
      try {
        android('shell', 'uiautomator', 'dump', '/sdcard/hm-fcm-permission.xml');
        const xml = android('shell', 'cat', '/sdcard/hm-fcm-permission.xml');
        target = [...xml.matchAll(/<node\b[^>]*>/g)].map(x => Object.fromEntries([...x[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]])))
          .find(n => pattern.test(n['resource-id'] || ''));
        return !!target;
      } catch (_) { return false; }
    }, 'permiso Android voluntario');
    const b = target.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/).slice(1).map(Number);
    android('shell', 'input', 'tap', String((b[0] + b[2]) >> 1), String((b[1] + b[3]) >> 1));
  }
  await login(accounts[0].numero_suministro); await profile();
  assert.equal(await active(), 0);
  assert.equal(await p().evaluate(async () => (await Capacitor.nativePromise('HidroPushState', 'read', {})).enabled), false);
  assert.notEqual(await p().evaluate(async () => (await Capacitor.Plugins.PushNotifications.checkPermissions()).receive), 'granted');
  ok('API ' + apiLevel + ': sin prompt ni alta FCM al login; configuración nativa real disponible');
  await p().locator('#push-enable').click(); await nativeTap(/\/permission_deny_button$/);
  await p().waitForFunction(() => document.getElementById('push-status').textContent.includes('No activadas'));
  assert.equal(await active(), 0); ok('Rechazar el permiso conserva el consentimiento desactivado y el centro interno');
  await p().locator('#push-enable').click(); await nativeTap(/\/permission_allow_button$/);
  await until(async () => await active() === 1, 'registro FCM real y asociación cifrada', 120000);
  const row = (await ctx.db.query('SELECT id,token_cifrado,revision,id_usuario FROM push_dispositivos WHERE activo')).rows[0];
  assert.equal(String(row.id_usuario), String(accounts[0].usuario.id_usuario));
  let token = require('../../Backend/push').open(row.token_cifrado, Buffer.from(process.env.PUSH_TOKEN_KEY, 'base64'), row.id, row.revision);
  assert.ok(typeof token === 'string' && token.length > 50 && !token.startsWith('fixture:'), 'Token del SDK real disponible sin mostrar su valor');
  assert.equal(row.token_cifrado.includes(Buffer.from(token)), false);
  const noPlain = await p().evaluate(() => ![localStorage, sessionStorage].some(s => Object.keys(s).some(k => /fcm.*token|push.*token/i.test(k))));
  assert.equal(noPlain, true);
  const logs = android('logcat', '-d'); assert.equal(logs.includes(token), false, 'Token FCM ausente de logcat'); token = undefined;
  const channels = await p().evaluate(() => Capacitor.Plugins.PushNotifications.listChannels());
  assert.ok(channels.channels.some(c => c.id === 'hm_updates'));
  screenshot('fcm-consent-enabled'); ok('Permiso real concedido; SDK registrado, token cifrado y canal existente, sin mensajes enviados');
  await restart('finish'); await dashboard(accounts[0].numero_suministro); await profile();
  await until(async () => await active() === 1, 'registro tras restaurar sesión');
  ok('Reapertura conserva sesión Keystore y una asociación push autorizada');
  await p().locator('#push-disable').click();
  await until(async () => await active() === 0, 'revocación del dispositivo');
  assert.equal((await ctx.db.query('SELECT count(*)::int n FROM push_dispositivos WHERE token_cifrado IS NOT NULL')).rows[0].n, 0);
  ok('Desactivar revoca asociación y retira ciphertext de PostgreSQL');
  await logout(); await login(accounts[1].numero_suministro); await profile();
  assert.equal(await active(), 0);
  assert.equal(await p().evaluate(async () => (await Capacitor.nativePromise('HidroPushState', 'read', {})).enabled), false);
  ok('Cambio de usuario no hereda consentimiento ni token del anterior');
  await p().locator('#push-enable').click();
  await until(async () => await active() === 1, 'registro voluntario de segunda cuenta', 120000);
  assert.equal(String((await ctx.db.query('SELECT id_usuario FROM push_dispositivos WHERE activo')).rows[0].id_usuario), String(accounts[1].usuario.id_usuario));
  await logout(); await until(async () => await active() === 0, 'logout revoca asociación');
  ok('Logout retira el dispositivo y ningún usuario conserva autorización push');
  assert.equal((await ctx.db.query("SELECT count(*)::int n FROM push_entregas WHERE estado='aceptado'")).rows[0].n, 0);
};
