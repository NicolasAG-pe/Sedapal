'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, '.local/k8s/browser-cache');
const { chromium } = require(path.join(root, '.local/k8s/browser/node_modules/playwright'));
(async () => {
  const credentials = JSON.parse(fs.readFileSync(path.join(root, '.local/k8s/state/accounts.json')));
  const browser = await chromium.launch({ headless: true });
  const errors = [], failures = [], checks = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400 && !r.url().includes('/api/auth/')) failures.push({ url: r.url(), status: r.status() }); });
    await page.goto('http://localhost:8083/');
    await page.locator('#admin-supply').fill(credentials.user.numero_suministro);
    await page.locator('#admin-password').fill(credentials.user.password);
    await page.locator('#admin-login-form').evaluate(form => form.requestSubmit());
    await page.locator('#admin-login-error').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => sessionStorage.getItem('hm_admin_token')), null);
    checks.push('Panel administrativo rechaza cuenta de usuario normal.');
    await page.locator('#admin-supply').fill(credentials.admin.numero_suministro);
    await page.locator('#admin-password').fill(credentials.admin.password);
    await page.locator('#admin-login-form').evaluate(form => form.requestSubmit());
    await page.locator('#admin-panel').waitFor({ state: 'visible' });
    await page.waitForFunction(() => Number(document.getElementById('adm-dash-usu').textContent) >= 2);
    checks.push('Login administrativo con suministro y contraseña; resumen con las cuentas locales.');
    await page.screenshot({ path: path.join(root, '.local/k8s/state/admin-desktop.png'), fullPage: true });
    for (const section of ['admin-usuarios', 'admin-recibos', 'admin-cortes', 'admin-incidencias', 'admin-pagos', 'admin-atencion', 'admin-cuenta']) {
      await page.locator('[data-sec="' + section + '"]').click();
      await page.waitForFunction(() => document.querySelector('.dash-sec.active')?.getAttribute('aria-busy') !== 'true');
    }
    await page.waitForFunction(() => document.getElementById('ac-correo').textContent === 'admin@prueba.invalid');
    checks.push('Navegación por los siete módulos administrativos sin errores HTTP.');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(root, '.local/k8s/state/admin-mobile.png'), fullPage: true });
    await context.close();
    const client = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const userPage = await client.newPage();
    userPage.on('pageerror', e => errors.push(e.message));
    userPage.on('response', r => { if (r.status() >= 400) failures.push({ url: r.url(), status: r.status() }); });
    await userPage.goto('http://localhost:8082/');
    await userPage.locator('#suministro').fill(credentials.user.numero_suministro);
    await userPage.locator('#password').fill(credentials.user.password);
    await userPage.locator('#login-form').evaluate(form => form.requestSubmit());
    await userPage.locator('#view-dashboard.active').waitFor({ state: 'visible' });
    await userPage.screenshot({ path: path.join(root, '.local/k8s/state/user-desktop.png'), fullPage: true });
    await userPage.setViewportSize({ width: 390, height: 844 });
    await userPage.screenshot({ path: path.join(root, '.local/k8s/state/user-mobile.png'), fullPage: true });
    checks.push('Login y dashboard de usuario en escritorio y móvil.');
    assert.deepEqual(errors, [], 'Errores JavaScript');
    assert.deepEqual(failures, [], 'Errores HTTP');
    fs.writeFileSync(path.join(root, '.local/k8s/state/browser-verification.json'), JSON.stringify({ date: new Date().toISOString(), checks, errors, failures }, null, 2));
    for (const check of checks) console.log('OK: ' + check);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
