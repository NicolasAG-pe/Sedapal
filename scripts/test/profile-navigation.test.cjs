// Regresión de Perfil con el HTML/JS real y respuestas ficticias, sin base de datos.
// Requiere Playwright/Chromium de las herramientas de validación existentes.
// PLAYWRIGHT_BROWSERS_PATH=artifacts/vercel-validation/browsers node --test scripts/test/profile-navigation.test.cjs
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildWeb } = require('../build-web');
const root = path.resolve(__dirname, '../..');
const { chromium } = require(process.env.HIDRO_PLAYWRIGHT_MODULE || path.join(root, 'artifacts/vercel-validation/tools/node_modules/playwright'));
const origin = 'https://profile.test';
const api = 'https://api.profile.test';
const profile = { correo: 'perfil@fixture.invalid', numero_suministro: '900000002', fecha_registro: '2026-10-01T12:00:00Z' };
let browser, runtime;
before(async () => {
  const staging = path.join(root, 'artifacts/tests/profile-navigation');
  fs.mkdirSync(staging, { recursive: true });
  runtime = fs.mkdtempSync(path.join(staging, 'runtime-'));
  buildWeb('android', { API_BASE_URL: api }, runtime);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
});
after(async () => { if (browser) await browser.close(); });

async function fixture(t, hash = 'inicio') {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [], requests = [];
  let hold = false, release, pending;
  page.on('pageerror', error => errors.push(error.message));
  await page.route(origin + '/**', async route => {
    const name = new URL(route.request().url()).pathname;
    if (name.endsWith('/socket.io.min.js')) {
      return route.fulfill({ contentType: 'application/javascript', body: 'window.io=()=>({on(){},removeAllListeners(){},disconnect(){}});' });
    }
    const file = path.resolve(runtime, '.' + (name === '/' ? '/index.html' : name));
    assert.ok(file.startsWith(runtime + path.sep));
    const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
    return route.fulfill({ status: fs.existsSync(file) ? 200 : 404, contentType: mime[path.extname(file)] || 'application/octet-stream', body: fs.existsSync(file) ? fs.readFileSync(file) : '' });
  });
  await page.route(api + '/**', async route => {
    const req = route.request(), name = new URL(req.url()).pathname;
    requests.push({ name, method: req.method(), jwt: req.headers().authorization });
    assert.ok(name.startsWith('/api/'), 'No conexiones externas en fixtures');
    let json;
    if (name === '/api/auth/login') json = { estado: 'ok', token: 'fixture-only-token', usuario: { rol: 'usuario', numero_suministro: profile.numero_suministro } };
    else {
      assert.equal(req.method(), 'GET', 'Perfil y navegación no escriben datos');
      assert.equal(req.headers().authorization, 'Bearer fixture-only-token');
      if (name === '/api/me/perfil') {
        json = profile;
        if (hold) await new Promise(resolve => { release = resolve; pending = true; });
      } else json = { recibos: [], pagos: [], incidencias: [], cortes: [], solicitudes: [], notificaciones: [] };
    }
    try { await route.fulfill({ json }); } catch (e) { if (!pending) throw e; }
  });
  await page.goto(origin + '/#' + hash);
  await page.locator('#suministro').fill(profile.numero_suministro);
  await page.locator('#password').fill('Fixture123');
  await page.locator('#btn-login').click();
  await page.waitForFunction(() => document.getElementById('view-dashboard').classList.contains('active') && document.getElementById('stat-debt').textContent === 'S/ 0.00');
  await page.waitForTimeout(700); // termina el bloqueo de navegación de 600 ms
  const count = () => requests.filter(r => r.name === '/api/me/perfil').length;
  const populated = async () => {
    await page.waitForFunction(d => document.getElementById('sec-perfil').classList.contains('active') && document.getElementById('pf-correo').textContent === d.correo && document.getElementById('pf-suministro').textContent === d.numero_suministro && document.getElementById('pf-fecha').textContent === window.HMShared.ui.date(d.fecha_registro), profile, { timeout: 5000 });
  };
  t.after(() => assert.deepEqual(errors, [], 'Sin errores de JavaScript'));
  return { page, count, populated, hold: () => { hold = true; }, pending: () => pending, release: () => release() };
}

test('Cuenta móvil, hash y menú de escritorio cargan Perfil exactamente una vez por entrada', async t => {
  const f = await fixture(t);
  const { page, count, populated } = f;
  for (const mode of ['mobile', 'hash', 'desktop']) {
    const n = count();
    if (mode === 'mobile') await page.locator('.mobile-tabs [data-sec="perfil"]').click();
    else if (mode === 'hash') await page.evaluate(() => { location.hash = 'perfil'; });
    else {
      await page.setViewportSize({ width: 1366, height: 900 });
      await page.locator('[data-sec="perfil"]').first().evaluate(el => el.click());
    }
    await populated();
    assert.equal(count() - n, 1, mode + ': una petición autenticada');
    await page.evaluate(() => { location.hash = 'inicio'; });
    await page.waitForFunction(() => document.getElementById('sec-inicio').classList.contains('active'));
    await page.waitForTimeout(700);
  }
});

test('El hash inicial #perfil carga los datos después del login', async t => {
  const f = await fixture(t, 'perfil');
  await f.populated();
  assert.equal(f.count(), 1);
});

test('Logout cancela Perfil pendiente y el hash no restaura datos ni sesión', async t => {
  const f = await fixture(t);
  f.hold();
  await f.page.locator('.mobile-tabs [data-sec="perfil"]').click();
  await f.page.waitForFunction(() => document.getElementById('sec-perfil').classList.contains('active'));
  for (let i = 0; i < 100 && !f.pending(); i++) await f.page.waitForTimeout(20);
  assert.equal(f.pending(), true, 'La navegación inicia la petición de Perfil');
  await f.page.locator('#btn-logout').evaluate(el => el.click());
  f.release();
  await f.page.waitForTimeout(300);
  const n = f.count();
  await f.page.evaluate(() => { location.hash = 'perfil'; });
  await f.page.waitForTimeout(200);
  assert.equal(f.count(), n, 'No peticiones de Perfil sin sesión');
  assert.equal(await f.page.evaluate(() => ['pf-correo', 'pf-suministro', 'pf-fecha'].every(id => document.getElementById(id).textContent === '—') && !document.getElementById('view-dashboard').classList.contains('active') && sessionStorage.getItem('hm_token') === null), true);
});
