'use strict';
// Solo ejecutar contra una API y cuentas sintéticas aisladas; no usa .env.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { mkdtemp } = require('node:fs/promises');
const root = path.resolve(__dirname, '..');
const env = process.env;
if (env.HM_COVERAGE_SYNTHETIC !== '1') throw Error('Se exige un entorno sintético aislado.');
function localOrigin(name) {
    const value = new URL(env[name]);
    if (value.protocol !== 'http:' || value.hostname !== '127.0.0.1' || value.username || value.password || value.pathname !== '/' || value.search || value.hash) throw Error('Solo se admiten orígenes loopback sin rutas.');
    return value.origin;
}
const client = localOrigin('HM_COVERAGE_CLIENT_ORIGIN'), admin = localOrigin('HM_COVERAGE_ADMIN_ORIGIN');
const clientSupply = env.HM_COVERAGE_CLIENT_SUPPLY, adminSupply = env.HM_COVERAGE_ADMIN_SUPPLY, password = env.HM_COVERAGE_FIXTURE_PASSWORD;
if (!/^\d{9}$/.test(clientSupply || '') || !/^\d{9}$/.test(adminSupply || '') || !password || !env.HM_PLAYWRIGHT_PACKAGE || !env.HM_CHROMIUM) throw Error('Faltan cuentas sintéticas o herramientas locales.');
const { chromium } = createRequire(path.resolve(env.HM_PLAYWRIGHT_PACKAGE))('playwright');
(async () => {
    const parent = path.join(root, 'artifacts/tests'); fs.mkdirSync(parent, { recursive: true });
    const output = await mkdtemp(path.join(parent, 'browser-v8-')); fs.chmodSync(output, 0o700);
    const browser = await chromium.launch({ executablePath: env.HM_CHROMIUM, headless: true, args: ['--no-sandbox'] });
    try {
        for (const [kind, origin, supply] of [['cliente', client, clientSupply], ['admin', admin, adminSupply]]) {
            const page = await browser.newPage(), errors = [];
            page.on('pageerror', () => errors.push('Error JavaScript inesperado'));
            await page.coverage.startJSCoverage({ resetOnNavigation: false });
            await page.goto(origin + '/');
            if (kind === 'cliente') {
                await page.locator('#suministro').fill(supply); await page.locator('#password').fill(password);
                await page.locator('#login-form').evaluate(form => form.requestSubmit());
                await page.locator('#view-dashboard.active').waitFor({ timeout: 15000 });
            } else {
                await page.locator('#admin-supply').fill(supply); await page.locator('#admin-password').fill(password);
                await page.locator('#admin-login-form').evaluate(form => form.requestSubmit());
                await page.locator('#admin-panel:not([hidden])').waitFor({ timeout: 15000 });
                for (const section of ['admin-usuarios', 'admin-recibos', 'admin-incidencias', 'admin-pagos', 'admin-atencion']) {
                    await page.locator(`[data-sec="${section}"]`).first().evaluate(button => button.click());
                    await page.locator(`#sec-${section}.active`).waitFor({ timeout: 15000 });
                    await page.waitForFunction(() => document.querySelector('.dash-sec.active')?.getAttribute('aria-busy') !== 'true');
                }
                await page.locator('#adm-ate-sum').fill('fixture');
                await page.locator('#adm-ate-estado').selectOption({ index: 1 });
                await page.locator('#adm-ate-cat').selectOption({ index: 1 });
                // El filtro de texto se aplica mediante debounce de 300 ms.
                await page.waitForTimeout(500);
            }
            if (errors.length) throw Error(errors[0]);
            fs.writeFileSync(path.join(output, kind + '.json'), JSON.stringify(await page.coverage.stopJSCoverage()), { mode: 0o600 });
            await page.close();
        }
    } finally { await browser.close(); }
    console.log('Cobertura V8 de navegador:', path.relative(root, output));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
