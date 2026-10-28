'use strict';
// Inventario visual real: navegador -> API original -> PostgreSQL nuevo.
// No usa .env, cuentas reales, correo real, Firebase ni recursos de producción.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { buildWeb } = require('../build-web');
const { chromium } = require(process.env.HIDRO_PLAYWRIGHT_MODULE || '../../artifacts/vercel-validation/tools/node_modules/playwright');
const root = path.resolve(__dirname, '../..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  assert.equal(process.env.PUSH_REAL_DELIVERY_ALLOWED || '0', '0', 'Entrega real prohibida');
  Object.assign(process.env, { PUSH_REAL_DELIVERY_ALLOWED: '0', PUSH_WORKER_ENABLED: '0', PUSH_REMINDERS_ENABLED: '0', PASSWORD_RECOVERY_REAL_DELIVERY_ALLOWED: '0' });
  const phase = process.argv[2] || 'baseline';
  assert.ok(['baseline', 'after'].includes(phase));
  const statistics = process.env.HIDRO_QUALITY_STATISTICS === '1';
  const emptyStatistics = statistics && process.env.HIDRO_QUALITY_EMPTY === '1';
  if (statistics) assert.equal(phase, 'after');
  const parent = path.join(root, 'artifacts/auditoria-calidad-120');
  fs.mkdirSync(parent, { recursive: true });
  const out = fs.mkdtempSync(path.join(parent, phase + '-'));
  fs.chmodSync(out, 0o700);
  const report = { phase, fixturesOnly: true, realDeliveryAllowed: false, screens: [], geometry: [], states: [], requests: [], errors: [], resources: [] };
  const c = await require('../../Backend/test/incident-tracking-fixture.cjs').start({ includeLegacy: !emptyStatistics });
  let server, browser;
  try {
    const { client, other, admin } = c.accounts;
    let incident, firstReceipt;
    if (!emptyStatistics) {
    incident = await c.create();
    assert.equal(incident.status, 201);
    assert.equal((await c.change(incident.data.incidencia.id_incidencia, 'En revisión', { comentario_publico: 'Inspección programada en el laboratorio.' })).status, 200);
    for (const [index, state] of ['Emitido', 'Vencido', 'Anulado'].entries()) {
      const r = await c.api('/api/admin/recibos', { numero_suministro: client.numero_suministro, periodo: ['Agosto', 'Septiembre', 'Octubre'][index] + ' 2026', fecha_emision: '2026-10-01', fecha_vencimiento: '2026-11-30', monto: 50 + index * 10, consumo_m3: 15 + index * 2 }, admin.token);
      assert.equal(r.status, 201);
      if (index === 0) firstReceipt = r.data.recibo.id_recibo;
      await c.db.query('UPDATE recibos SET estado=$1 WHERE id_recibo=$2', [state, r.data.recibo.id_recibo]);
    }
    assert.equal((await c.api('/api/atencion', { categoria: 'Facturación', asunto: 'Consulta de laboratorio', descripcion: 'Consulta sintética para la demostración de atención.' })).status, 201);
    }
    if (statistics && !emptyStatistics) {
      const demo = await c.api('/api/me/operaciones-pago', { id_recibo: firstReceipt, metodo: 'demostrativo', solicitud_id: require('node:crypto').randomUUID() });
      assert.equal(demo.status, 201);
      assert.equal((await c.db.query('SELECT count(*)::int n FROM pagos')).rows[0].n, 0);
      report.states.push({ name: 'demonstration-without-funds', operations: 1, historicalPayments: 0 });
    }
    const reference = process.env.HIDRO_QUALITY_REFERENCE;
    if (reference) {
      assert.equal(phase, 'baseline');
      assert.match(reference, /^baseline-[A-Za-z0-9]+$/);
      assert.equal(path.dirname(fs.realpathSync(path.join(parent, reference))), fs.realpathSync(parent));
      report.referenceRuntime = reference;
    }
    // Una comparación puede servir el runtime previo preservado, sin revertir
    // archivos ni sustituir pantallas. API y PostgreSQL siguen siendo reales.
    const clientDir = reference ? path.join(parent, reference, 'web') : buildWeb('web', { API_BASE_URL: '' }, path.join(out, 'web'));
    const adminDir = reference ? path.join(parent, reference, 'admin') : buildWeb('admin', { API_BASE_URL: '' }, path.join(out, 'admin'));
    server = http.createServer(async (req, res) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/socket.io/')) {
        try {
          const body = []; for await (const b of req) body.push(b);
          const response = await fetch(c.base + req.url, { method: req.method, headers: { ...req.headers, host: new URL(c.base).host, origin: 'http://localhost:8080' }, ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Buffer.concat(body) }) });
          res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
        } catch (_) { res.writeHead(502); res.end(); }
        return;
      }
      const url = new URL(req.url, 'http://localhost');
      const base = url.pathname.startsWith('/admin/') ? adminDir : clientDir;
      const relative = url.pathname.replace(/^\/(admin\/)?/, '') || 'index.html';
      const file = path.resolve(base, relative);
      if (!file.startsWith(base + path.sep)) { res.writeHead(403); res.end(); return; }
      try {
        res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream');
        res.end(fs.readFileSync(file));
      } catch (_) { res.writeHead(404); res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

    async function context(width, height) {
      const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      await ctx.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await ctx.newPage();
      page.setDefaultTimeout(12000);
      page.on('pageerror', e => report.errors.push(e.message));
      page.on('response', response => {
        if (response.url().includes('/api/')) report.requests.push({ route: new URL(response.url()).pathname.replace(/\/[0-9]+(?=\/|$)/g, '/:id'), status: response.status() });
        else if (response.status() >= 400) report.resources.push({ path: new URL(response.url()).pathname, status: response.status() });
      });
      return { ctx, page };
    }
    async function capture(page, name) {
      await pause(200);
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      const size = page.viewportSize();
      const file = name + '-' + size.width + 'x' + size.height + '.png';
      await page.screenshot({ path: path.join(out, file), fullPage: true });
      report.screens.push({ name, file, ...size });
      const geometry = await page.evaluate(({ name }) => {
        const visible = e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
        const named = e => e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.labels?.length || e.getAttribute('title');
        const controls = [...document.querySelectorAll('button,input:not([type=hidden]),select,textarea')].filter(visible);
        return { name, width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth - innerWidth,
          unlabelled: controls.filter(e => e.tagName !== 'BUTTON' && !named(e)).map(e => e.id),
          unnamedButtons: controls.filter(e => e.tagName === 'BUTTON' && !e.textContent.trim() && !named(e)).map(e => e.id),
          clippedControls: controls.filter(e => !e.closest('.table-scroll,#admin-nav')).filter(e => { const r = e.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).map(e => e.id || e.textContent.trim().slice(0, 40)),
          smallTargets: controls.filter(e => { const r = e.getBoundingClientRect(); return r.height < 44 || r.width < 44; }).map(e => ({ id: e.id || e.textContent.trim().slice(0, 40), width: Math.round(e.getBoundingClientRect().width), height: Math.round(e.getBoundingClientRect().height) })),
          quickWords: [...document.querySelectorAll('#sec-inicio .quick-grid b')].filter(visible).map(e => { const range = document.createRange(); range.selectNodeContents(e); return { text: e.textContent, lines: range.getClientRects().length }; }),
          assistantBodyHeight: document.getElementById('hb-panel')?.classList.contains('open') ? Math.round(document.getElementById('hb-body').getBoundingClientRect().height) : null,
          brokenImages: [...document.images].filter(visible).filter(e => e.getAttribute('src') && (!e.complete || !e.naturalWidth)).length,
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
      }, { name });
      report.geometry.push(geometry);
      if (phase === 'after') {
        if (name === 'client-inicio') {
          assert.equal(geometry.quickWords.length, 5);
          assert.ok(geometry.quickWords.every(word => word.lines === 1), 'Accesos rápidos legibles sin partir palabras');
        }
        if (name === 'client-hidrobot') {
          assert.deepEqual(geometry.smallTargets, [], 'Controles HidroBot de al menos 44 px');
          assert.ok(geometry.assistantBodyHeight >= 96, 'Conversación visible junto con sugerencias y controles');
        }
      }
    }
    async function clientLogin(page, account) {
      await page.locator('#suministro').fill(account.numero_suministro);
      await page.locator('#password').fill(account.password);
      const started = Date.now(); await page.locator('#btn-login').click();
      await page.waitForFunction(() => document.getElementById('view-dashboard').classList.contains('active'));
      await page.waitForFunction(() => !document.getElementById('hb-fab').disabled || document.body.classList.contains('tutorial-open'));
      // El tutorial se abre después de la carga de datos; esperar su control
      // real antes de navegar, sin forzar clicks a través de la superposición.
      await page.locator('#spot-skip-mobile:visible,#spot-skip:visible').first().waitFor();
      await page.locator('#spot-skip-mobile:visible,#spot-skip:visible').first().click();
      await page.waitForFunction(() => !document.body.classList.contains('tutorial-open'));
      report.states.push({ name: 'client-login-ready', width: page.viewportSize().width, milliseconds: Date.now() - started });
    }
    for (const [width, height] of (emptyStatistics ? [] : [[360, 800], [390, 844], [412, 915], [768, 1024]])) {
      const { ctx, page } = await context(width, height);
      await page.goto(origin); await capture(page, 'client-login');
      report.states.push({ name: 'client-cold-load', width, ...await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { domContentLoadedMs: Math.round(n.domContentLoadedEventEnd), loadMs: Math.round(n.loadEventEnd), resourceBytes: performance.getEntriesByType('resource').reduce((a, r) => a + r.transferSize, 0) }; }) });
      await clientLogin(page, client);
      for (const section of ['inicio', 'consumos', 'historial', 'pagos', 'incidencias', 'notificaciones', 'perfil', 'ayuda']) {
        // Algunas pantallas conservan consumos dentro de Inicio, no inventar una ruta.
        if (!(await page.locator('#sidebar [data-sec="' + section + '"]').count())) continue;
        await page.evaluate(s => document.querySelector('#sidebar [data-sec="' + s + '"]').click(), section);
        await page.waitForFunction(s => document.getElementById('sec-' + s).classList.contains('active'), section);
        await capture(page, 'client-' + section);
        if (section === 'incidencias') {
          await page.locator('#inc-list [data-history-id="' + incident.data.incidencia.id_incidencia + '"]').click();
          await page.locator('.incident-event').first().waitFor(); await capture(page, 'client-seguimiento');
          await page.locator('#incident-history-close').click();
        }
      }
      await page.locator('#hb-fab').click(); await page.locator('#hb-panel.open').waitFor();
      await page.locator('#hb-body .hb-msg.bot').first().waitFor();
      await capture(page, 'client-hidrobot'); await page.locator('#hb-close').click();
      await page.evaluate(() => document.getElementById('btn-logout').click());
      await ctx.close(); console.log('Cliente ' + width + 'x' + height + ': capturas reales guardadas');
    }
    for (const [width, height] of [[1366, 768], [1920, 1080]]) {
      const { ctx, page } = await context(width, height);
      await page.goto(origin + '/admin/'); await capture(page, 'admin-login');
      await page.locator('#admin-supply').fill(admin.numero_suministro);
      await page.locator('#admin-password').fill(admin.password); await page.locator('#admin-login-submit').click();
      await page.waitForFunction(() => !document.getElementById('admin-panel').hidden);
      if (statistics) {
        await page.waitForFunction(() => document.getElementById('admin-connection').dataset.state === 'online');
        // El handshake existente refresca por REST tras 150 ms para recuperar
        // eventos previos. Separarlo de la navegación que se está midiendo.
        await pause(250);
        await page.waitForFunction(() => document.getElementById('admin-incident-breakdown') && !document.getElementById('sec-admin').hasAttribute('aria-busy'));
      }
      for (const section of ['admin', 'admin-usuarios', 'admin-recibos', 'admin-pagos', 'admin-incidencias', 'admin-cortes', 'admin-atencion', 'admin-cuenta']) {
        const beforeRequests = report.requests.length;
        await page.locator('#admin-nav [data-sec="' + section + '"]').click();
        await page.waitForFunction(s => { const e = document.getElementById('sec-' + s); return e.classList.contains('active') && !e.hasAttribute('aria-busy'); }, section);
        await capture(page, section);
        if (statistics && section === 'admin') {
          const summary = await c.api('/api/admin/resumen', undefined, admin.token, 'GET'); assert.equal(summary.status, 200);
          assert.equal(await page.locator('#adm-dash-pay').textContent(), String(summary.data.pagos.total));
          assert.equal(summary.data.pagos.total, 0, 'Una demostración no aumenta pagos históricos');
          await page.getByText('Pagos históricos', { exact: true }).waitFor();
          await page.getByText('Sin acreditación bancaria atribuida', { exact: true }).waitFor();
          for (const [id, data, keys, emptyText] of [
            ['admin-incident-breakdown', summary.data.incidencias, ['registradas', 'revision', 'resueltas'], 'Sin incidencias registradas.'],
            ['admin-attention-breakdown', summary.data.solicitudes, ['registradas', 'atencion', 'respondidas', 'cerradas'], 'Sin solicitudes registradas.']
          ]) {
            if (emptyStatistics) { assert.equal(data.total, 0); assert.equal(await page.locator('#' + id + ' .hint').textContent(), emptyText); }
            else for (const key of keys) assert.equal(await page.locator('#' + id + ' [data-stat="' + key + '"] b').textContent(), String(data[key]));
          }
          const reloadRequests = report.requests.slice(beforeRequests).filter(r => r.route === '/api/admin/resumen');
          assert.equal(reloadRequests.length, 1, 'Una consulta de resumen por entrada');
          report.states.push({ name: 'statistics-contract', width, empty: emptyStatistics, uiSummaryRequests: reloadRequests.length, financialFundsInferred: false });

          let release; const gate = new Promise(resolve => { release = resolve; });
          await page.route('**/api/admin/resumen', async route => { await gate; await route.fulfill({ status: 503, json: { estado: 'error', mensaje: 'No disponible temporalmente.' } }); }, { times: 1 });
          await page.locator('#admin-nav [data-sec="admin"]').click();
          await page.waitForFunction(() => document.getElementById('sec-admin').getAttribute('aria-busy') === 'true');
          await capture(page, 'admin-summary-loading'); release();
          await page.locator('#admin-operational-breakdown').getByText('No fue posible consultar esta información.', { exact: true }).waitFor();
          assert.equal(await page.locator('#adm-dash-pay').textContent(), '—', 'El error no conserva una cifra anterior');
          await capture(page, 'admin-summary-error');
          await page.locator('#admin-nav [data-sec="admin"]').click();
          await page.waitForFunction(() => !document.getElementById('sec-admin').hasAttribute('aria-busy'));
          assert.equal(await page.locator('#adm-dash-pay').textContent(), '0');
          report.states.push({ name: 'statistics-loading-error-recovery', width, result: 'passed' });
        }
      }
      await page.locator('#admin-logout').click(); await ctx.close(); console.log('Admin ' + width + 'x' + height + ': capturas reales guardadas');
    }
    if (!emptyStatistics) {
    const { ctx, page } = await context(360, 800);
    await page.goto(origin); await clientLogin(page, other);
    for (const section of ['inicio', 'historial', 'pagos', 'incidencias', 'notificaciones']) {
      await page.evaluate(s => document.querySelector('#sidebar [data-sec="' + s + '"]').click(), section);
      await capture(page, 'empty-' + section);
    }
    await page.evaluate(() => document.getElementById('btn-logout').click()); await ctx.close();
    }
    assert.deepEqual(report.errors, [], 'Errores JavaScript'); assert.deepEqual(report.resources, [], 'Recursos HTTP fallidos');
    report.result = 'captured';
    report.findings = report.geometry.filter(r => r.overflow > 1 || r.unlabelled.length || r.unnamedButtons.length || r.clippedControls.length || r.brokenImages);
    const html = '<!doctype html><html lang="es"><meta charset="utf-8"><title>Galería local Hidro-Mejora</title><style>body{font:16px system-ui;background:#EAF4FB;color:#243746;max-width:1100px;margin:auto;padding:24px}h1{color:#0F4C81}section{background:white;padding:16px;margin:20px 0}img{max-width:100%;max-height:850px;object-fit:contain;object-position:left top}</style><h1>Galería local · ' + phase + '</h1><p>Capturas de ejecución real, datos sintéticos. Sin publicación ni prueba física.</p>' + report.screens.map(s => '<section><h2>' + s.name + ' · ' + s.width + ' × ' + s.height + '</h2><a href="' + s.file + '"><img loading="lazy" src="' + s.file + '" alt="' + s.name + '"></a></section>').join('');
    fs.writeFileSync(path.join(out, 'gallery.html'), html, { mode: 0o600 });
  } catch (error) { report.result = 'failed'; report.failure = error.message; throw error; }
  finally {
    if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve));
    await c.close();
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
    console.log('Evidencia: ' + path.relative(root, out));
  }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
