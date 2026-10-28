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
  const parent = path.join(root, 'artifacts/auditoria-calidad-120');
  fs.mkdirSync(parent, { recursive: true });
  const out = fs.mkdtempSync(path.join(parent, phase + '-'));
  fs.chmodSync(out, 0o700);
  const report = { phase, fixturesOnly: true, realDeliveryAllowed: false, screens: [], geometry: [], states: [], requests: [], errors: [], resources: [] };
  const c = await require('../../Backend/test/incident-tracking-fixture.cjs').start();
  let server, browser;
  try {
    const { client, other, admin } = c.accounts;
    const incident = await c.create();
    assert.equal(incident.status, 201);
    assert.equal((await c.change(incident.data.incidencia.id_incidencia, 'En revisión', { comentario_publico: 'Inspección programada en el laboratorio.' })).status, 200);
    for (const [index, state] of ['Emitido', 'Vencido', 'Anulado'].entries()) {
      const r = await c.api('/api/admin/recibos', { numero_suministro: client.numero_suministro, periodo: ['Agosto', 'Septiembre', 'Octubre'][index] + ' 2026', fecha_emision: '2026-10-01', fecha_vencimiento: '2026-11-30', monto: 50 + index * 10, consumo_m3: 15 + index * 2 }, admin.token);
      assert.equal(r.status, 201);
      await c.db.query('UPDATE recibos SET estado=$1 WHERE id_recibo=$2', [state, r.data.recibo.id_recibo]);
    }
    assert.equal((await c.api('/api/atencion', { categoria: 'Facturación', asunto: 'Consulta de laboratorio', descripcion: 'Consulta sintética para la demostración de atención.' })).status, 201);
    const clientDir = buildWeb('web', { API_BASE_URL: '' }, path.join(out, 'web'));
    const adminDir = buildWeb('admin', { API_BASE_URL: '' }, path.join(out, 'admin'));
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
      report.geometry.push(await page.evaluate(({ name }) => {
        const visible = e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
        const named = e => e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.labels?.length || e.getAttribute('title');
        const controls = [...document.querySelectorAll('button,input:not([type=hidden]),select,textarea')].filter(visible);
        return { name, width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth - innerWidth,
          unlabelled: controls.filter(e => e.tagName !== 'BUTTON' && !named(e)).map(e => e.id),
          unnamedButtons: controls.filter(e => e.tagName === 'BUTTON' && !e.textContent.trim() && !named(e)).map(e => e.id),
          clippedControls: controls.filter(e => !e.closest('.table-scroll,#admin-nav')).filter(e => { const r = e.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).map(e => e.id || e.textContent.trim().slice(0, 40)),
          smallTargets: controls.filter(e => { const r = e.getBoundingClientRect(); return r.height < 44 || r.width < 44; }).map(e => ({ id: e.id || e.textContent.trim().slice(0, 40), width: Math.round(e.getBoundingClientRect().width), height: Math.round(e.getBoundingClientRect().height) })),
          brokenImages: [...document.images].filter(visible).filter(e => e.getAttribute('src') && (!e.complete || !e.naturalWidth)).length,
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
      }, { name }));
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
    for (const [width, height] of [[360, 800], [390, 844], [412, 915], [768, 1024]]) {
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
      for (const section of ['admin', 'admin-usuarios', 'admin-recibos', 'admin-pagos', 'admin-incidencias', 'admin-cortes', 'admin-atencion', 'admin-cuenta']) {
        await page.locator('#admin-nav [data-sec="' + section + '"]').click();
        await page.waitForFunction(s => { const e = document.getElementById('sec-' + s); return e.classList.contains('active') && !e.hasAttribute('aria-busy'); }, section);
        await capture(page, section);
      }
      await page.locator('#admin-logout').click(); await ctx.close(); console.log('Admin ' + width + 'x' + height + ': capturas reales guardadas');
    }
    const { ctx, page } = await context(360, 800);
    await page.goto(origin); await clientLogin(page, other);
    for (const section of ['inicio', 'historial', 'pagos', 'incidencias', 'notificaciones']) {
      await page.evaluate(s => document.querySelector('#sidebar [data-sec="' + s + '"]').click(), section);
      await capture(page, 'empty-' + section);
    }
    await page.evaluate(() => document.getElementById('btn-logout').click()); await ctx.close();
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
