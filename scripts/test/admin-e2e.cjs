/* Prueba real de navegador/API/PostgreSQL sobre una base nueva y aislada.
 * Nunca usa .env, la base hidro_mejora ni sus credenciales.
 * Preparar PostgreSQL tmpfs según README y pasar HIDRO_TEST_DB_PORT.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const requireBackend = createRequire(path.resolve('Backend/package.json'));
const { Pool } = requireBackend('pg');
const WebSocket = requireBackend('ws');
const root = path.resolve(__dirname, '../..');
const password = 'FixtureAdmin123';
const adminSupply = '900000001', userSupply = '900000002';
const report = { database: 'hm_admin_test', checks: [], endpoints: {}, browserErrors: [], assetFailures: [] };
function record(method, endpoint, status) {
  const pathname = new URL(endpoint, 'http://fixture').pathname.replace(/\/\d+(?=\/|$)/g, '/:id');
  const key = method + ' ' + pathname;
  report.endpoints[key] = [...new Set([...(report.endpoints[key] || []), status])];
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(check, label, milliseconds = 12000) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) { if (await check()) return; await pause(80); }
  throw new Error('Timeout: ' + label);
}
function ok(label) { report.checks.push(label); console.log('OK: ' + label); }

async function browser(executable) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hidro-admin-browser-'));
  const chrome = spawn(executable, ['--headless', '--no-sandbox', '--disable-gpu',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let output = '';
  chrome.stderr.on('data', data => { output += data; });
  await wait(() => /DevTools listening on (ws:\/\/\S+)/.test(output), 'inicio Chromium');
  const ws = new WebSocket(output.match(/DevTools listening on (ws:\/\/\S+)/)[1]);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  let id = 0, sessionId;
  const pending = new Map(), requests = [], byRequest = new Map();
  ws.on('message', raw => {
    const message = JSON.parse(raw);
    if (message.id && pending.has(message.id)) {
      const job = pending.get(message.id); pending.delete(message.id);
      message.error ? job.reject(new Error(job.method + ': ' + message.error.message)) : job.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const detail = message.params.exceptionDetails;
      report.browserErrors.push(detail.exception?.description || detail.text);
    }
    if (message.method === 'Network.requestWillBeSent') {
      const request = message.params.request;
      requests.push({ url: request.url, method: request.method });
      byRequest.set(message.params.requestId, { url: request.url, method: request.method });
    }
    if (message.method === 'Network.responseReceived') {
      const request = byRequest.get(message.params.requestId);
      if (request && request.url.includes('/api/')) record(request.method, request.url, message.params.response.status);
      else if(request&&message.params.response.status>=400)report.assetFailures.push({url:request.url,status:message.params.response.status});
    }
  });
  function command(method, params = {}, attached = true) {
    return new Promise((resolve, reject) => {
      const next = ++id; pending.set(next, { resolve, reject, method });
      ws.send(JSON.stringify({ id: next, method, params, ...(attached && sessionId ? { sessionId } : {}) }));
    });
  }
  const { targetId } = await command('Target.createTarget', { url: 'about:blank' }, false);
  ({ sessionId } = await command('Target.attachToTarget', { targetId, flatten: true }, false));
  await command('Runtime.enable'); await command('Page.enable'); await command('Network.enable');
  async function evaluate(expression) {
    const value = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text);
    return value.result.value;
  }
  async function goto(url) {
    await command('Page.navigate', { url });
    await wait(() => evaluate('document.readyState === "complete" && document.URL.startsWith(' + JSON.stringify(url) + ')'), 'carga ' + url);
  }
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill = (selector, value) => evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const submit = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).requestSubmit();${process.env.HIDRO_TEST_DOUBLE_SUBMIT==='1'?`document.querySelector(${JSON.stringify(selector)}).requestSubmit();`:''}`);
  async function screenshot(file) {
    const result = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(file, Buffer.from(result.data, 'base64'));
  }
  return { command, evaluate, goto, click, fill, submit, screenshot, requests,
    async close() { ws.close(); chrome.kill('SIGTERM'); } };
}

(async () => {
  const port = Number(process.env.HIDRO_TEST_DB_PORT);
  assert.ok(Number.isInteger(port) && port > 0, 'HIDRO_TEST_DB_PORT obligatorio: puerto de PostgreSQL tmpfs aislado.');
  const output = process.env.HIDRO_TEST_REPORT_DIR
    ? path.join(process.env.HIDRO_TEST_REPORT_DIR, 'run_' + Date.now())
    : fs.mkdtempSync(path.join(os.tmpdir(), 'hidro-admin-e2e-'));
  fs.mkdirSync(output, { recursive: true });
  const connection = { host: '127.0.0.1', port, database: 'hm_admin_test', user: 'hm_fixture', password: 'fixture-only-not-production' };
  const database = 'hm_admin_test_' + Date.now();
  const parent = new Pool(connection);
  let pool;
  let backend, web, chrome;
  let serverOutput = '';
  try {
    assert.equal((await parent.query('SELECT current_database() AS db')).rows[0].db, 'hm_admin_test');
    // Una base nueva por ejecución; conservar incluso los fixtures anteriores.
    await parent.query('CREATE DATABASE "' + database + '"');
    await parent.end();
    pool = new Pool({ ...connection, database });
    report.database = database;
    assert.equal(Number((await pool.query("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")).rows[0].count), 0, 'La base de pruebas debe estar vacía. No tocar bases existentes.');
    await pool.query(fs.readFileSync(path.join(root, 'Base-de-Datos/init.sql'), 'utf8'));
    ok('PostgreSQL aislado: esquema original en una base nueva y vacía');

    const probe = http.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const backendPort = probe.address().port; await new Promise(resolve => probe.close(resolve));
    const base = 'http://127.0.0.1:' + backendPort;
    web = http.createServer((request, response) => {
      const name = new URL(request.url, 'http://fixture').pathname;
      if (name.endsWith('/hm-api-config.js')) {
        response.setHeader('Content-Type', 'text/javascript'); response.end('window.HM_API_BASE = ' + JSON.stringify(base) + ';'); return;
      }
      const client = name.startsWith('/cliente/');
      const relative = client ? name.slice('/cliente/'.length) : name.slice(1);
      let file;
      if (relative.startsWith('shared/')) file = path.join(root, 'Shared', relative.slice(7));
      else if (relative.startsWith('assets/')) {
        file = path.join(root, client ? 'Frontend' : 'Admin', relative);
        if (!fs.existsSync(file)) file = path.join(root, 'Frontend', relative);
      } else file = path.join(root, client ? 'Frontend' : 'Admin', 'index.html');
      const allowed = ['Admin', 'Frontend', 'Shared'].some(folder => file.startsWith(path.join(root, folder) + path.sep));
      if (!allowed || !fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
      response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      response.end(fs.readFileSync(file));
    });
    await new Promise(resolve => web.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + web.address().port;
    backend = spawn(process.execPath, ['server.js'], { cwd: path.join(root, 'Backend'), stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: String(backendPort), DATABASE_URL: '', DB_HOST: '127.0.0.1', DB_PORT: String(port),
        POSTGRES_DB: database, POSTGRES_USER: 'hm_fixture', POSTGRES_PASSWORD: 'fixture-only-not-production',
        AUTH_TOKEN_SECRET: 'isolated-e2e-fixture-secret-not-production', NODE_ENV: 'development', CORS_ALLOWED_ORIGINS: origin } });
    backend.stdout.on('data', data => { serverOutput += data; }); backend.stderr.on('data', data => { serverOutput += data; });
    await wait(async () => { try { return (await fetch(base + '/api/health')).ok; } catch (_) { return false; } }, 'API aislada');
    async function request(method, endpoint, token, body, status) {
      const response = await fetch(base + endpoint, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (status) assert.equal(response.status, status, method + ' ' + endpoint);
      record(method, endpoint, response.status);
      return response.headers.get('content-type')?.includes('application/json') ? response.json() : response.arrayBuffer();
    }
    for (const [supply, email] of [[adminSupply, 'admin@fixture.invalid'], [userSupply, 'cliente@fixture.invalid']]) {
      await request('POST', '/api/auth/register', null, { numero_suministro: supply, correo: email, password }, 201);
    }
    await pool.query("UPDATE usuarios SET rol='admin' WHERE correo='admin@fixture.invalid'");
    const admin = await request('POST', '/api/auth/login', null, { numero_suministro: adminSupply, password }, 200);
    const user = await request('POST', '/api/auth/login', null, { numero_suministro: userSupply, password }, 200);
    const jwt=requireBackend('jsonwebtoken');
    const claims=jwt.decode(user.token);delete claims.iat;delete claims.exp;
    const expiredToken=jwt.sign({...claims,exp:Math.floor(Date.now()/1000)-60},'isolated-e2e-fixture-secret-not-production');
    await request('GET','/api/me/perfil',expiredToken,undefined,401);
    await request('GET','/api/admin/usuarios',user.token+'.alterado',undefined,401);
    ok('JWT firmado pero expirado y firma alterada son rechazados por la API (401)');
    const userId = user.usuario.id_usuario;
    const supplyId = user.suministro.id_suministro;
    const routes = [...fs.readFileSync(path.join(root, 'Backend/server.js'), 'utf8').matchAll(/app\.(get|post|patch)\(["'](\/api\/admin\/[^"']+)["'], requiereAdmin/g)];
    assert.equal(routes.length, 19);
    for (const route of routes) {
      const method = route[1].toUpperCase(), endpoint = route[2].replace(':id', '1');
      await request(method, endpoint, user.token, method === 'GET' ? undefined : {}, 403);
      await request(method, endpoint, null, method === 'GET' ? undefined : {}, 401);
    }
    ok('Las 19 rutas administrativas rechazan usuario normal (403) y ausencia de JWT (401)');
    const receipt = await request('POST', '/api/admin/recibos', admin.token, { numero_suministro: userSupply, periodo: 'Pago fixture', fecha_emision: '2026-01-01', fecha_vencimiento: '2026-02-01', monto: 30, consumo_m3: 10 }, 201);
    await request('POST', '/api/pagos', user.token, { id_recibo: receipt.recibo.id_recibo, metodo: 'Tarjeta' }, 201);
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=';
    const incident = await request('POST', '/api/incidencias', user.token, { tipo: 'Fuga de agua', descripcion: 'Reporte de prueba aislada', referencia: 'Dirección fixture', foto_base64: 'data:image/png;base64,' + png, foto_mime: 'image/png' }, 201);
    const attention = await request('POST', '/api/atencion', user.token, { categoria: 'Facturación', asunto: 'Consulta fixture', descripcion: 'Solicitud de prueba aislada' }, 201);
    ok('Datos de prueba creados únicamente en hm_admin_test');

    chrome = await browser(process.env.HIDRO_TEST_CHROME || '/home/nico/.cache/puppeteer/chrome-headless-shell/linux-154.0.8037.57/chrome-headless-shell-linux64/chrome-headless-shell');
    await chrome.goto('http://localhost:8081/');
    assert.equal(await chrome.evaluate('document.getElementById("admin-login").hidden'), false);
    await chrome.screenshot(path.join(output, 'admin-local-login.png'));
    assert.equal((await fetch('http://localhost:8080/')).status, 200);
    assert.equal((await fetch('http://localhost:8081/api/health')).status, 200);
    ok('8080 conserva Frontend; 8081 sirve login Admin y proxy /api/health con PostgreSQL local');
    await chrome.goto(origin + '/');
    await require('./visual-checks.cjs').matrix(chrome,output,'admin-login','admin');
    await chrome.evaluate(`window.__sockets=[];const originalIO=window.io;window.io=Object.assign((...args)=>{const socket=originalIO(...args);window.__sockets.push(socket);return socket;},originalIO);void 0;`);
    await chrome.evaluate('location.hash="admin-usuarios"');
    await pause(100);
    assert.equal(await chrome.evaluate('document.getElementById("admin-content").children.length'), 0);
    const before = chrome.requests.length;
    async function login(supply) {
      await chrome.fill('#admin-supply', supply); await chrome.fill('#admin-password', password); await chrome.submit('#admin-login-form');
    }
    await login(userSupply);
    await wait(() => chrome.evaluate('!document.getElementById("admin-login-error").hidden'), 'rechazo usuario normal');
    assert.equal(chrome.requests.slice(before).filter(item => item.url.includes('/api/admin/')).length, 0);
    assert.equal(await chrome.evaluate('sessionStorage.getItem("hm_admin_token")'), null);
    ok('Login normal rechazado sin consultas administrativas; hash sin sesión bloqueado');
    await login(adminSupply);
    await wait(() => chrome.evaluate('!document.getElementById("admin-panel").hidden && document.getElementById("adm-dash-usu").textContent==="2"'), 'resumen administrativo');
    await wait(() => chrome.evaluate('__sockets.filter(s=>s.connected).length===1'), 'Socket.IO');
    ok('Login admin y resumen: validación de rol y JWT contra PostgreSQL antes de mostrar datos');
    await require('./visual-checks.cjs').matrix(chrome,output,'admin-dashboard','admin');

    async function nav(name, selector) {
      await chrome.click('[data-sec="' + name + '"]');
      if (selector) await wait(() => chrome.evaluate('document.querySelector(' + JSON.stringify(selector) + ') !== null'), 'módulo ' + name);
      await wait(()=>chrome.evaluate('document.querySelector(".dash-sec.active")?.getAttribute("aria-busy")!=="true"'),'carga administrativa '+name);
      await require('./visual-checks.cjs')(chrome,output,name);
      await require('./visual-checks.cjs').matrix(chrome,output,name,'admin');
    }
    async function cardButton(list, text, label) {
      await chrome.evaluate(`(() => {const card=[...document.querySelectorAll(${JSON.stringify(list + ' .inc-item')})].find(n=>n.textContent.includes(${JSON.stringify(text)}));const button=card&&[...card.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(label)});if(!button)throw Error('Botón no encontrado');button.click();})()`);
    }
    async function dbValue(sql, params = []) { return (await pool.query(sql, params)).rows[0]; }
    await nav('admin-usuarios', '#admin-usu-list .inc-item');
    await require('./visual-checks.cjs')(chrome,output,'admin-usuarios-mobile',390,844);
    await chrome.command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await chrome.command('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    assert.equal(await chrome.evaluate('document.activeElement.id'),'adm-usu-search','Tab desde el título enfocado llega al buscador');
    await cardButton('#admin-usu-list', 'cliente@fixture.invalid', 'Ver detalle');
    await wait(() => chrome.evaluate('!document.getElementById("admin-usu-det-card").hidden'), 'detalle usuario');
    await chrome.click('#admin-usu-toggle');
    await require('./visual-checks.cjs')(chrome,output,'admin-confirm-modal',768,900);
    await chrome.evaluate('document.getElementById("confirm-ok").focus()');
    await chrome.command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await chrome.command('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    assert.equal(await chrome.evaluate('document.activeElement.id'),'confirm-close','El foco permanece dentro de la confirmación');
    await chrome.click('#confirm-ok');
    await wait(async () => (await dbValue('SELECT activo FROM usuarios WHERE id_usuario=$1', [userId])).activo === false, 'desactivar usuario');
    await wait(() => chrome.evaluate('document.getElementById("admin-usu-toggle").textContent==="Reactivar cuenta"'), 'detalle desactivado');
    await chrome.click('#admin-usu-toggle'); await chrome.click('#confirm-ok');
    await wait(async () => (await dbValue('SELECT activo FROM usuarios WHERE id_usuario=$1', [userId])).activo === true, 'reactivar usuario');
    await wait(() => chrome.evaluate('document.getElementById("admin-usu-toggle").textContent==="Desactivar cuenta"'), 'detalle reactivado');
    await chrome.click('#admin-usu-edit-ubi');
    await require('./visual-checks.cjs').matrix(chrome,output,'admin-suministro-form','admin');
    await chrome.fill('#adm-ubi-distrito', 'Distrito fixture'); await chrome.fill('#adm-ubi-zona', 'Zona fixture'); await chrome.submit('#admin-ubi-form');
    await wait(async () => (await dbValue('SELECT zona FROM suministros WHERE id_suministro=$1', [supplyId])).zona === 'Zona fixture', 'ubicación suministro');
    ok('Usuarios: lista, detalle, desactivar/reactivar; suministro: editar ubicación y persistir');

    await nav('admin-recibos', '#admin-rec-list .inc-item');
    await chrome.click('#btn-nuevo-recibo');
    await require('./visual-checks.cjs').matrix(chrome,output,'admin-recibo-form','admin');
    for (const [id, value] of Object.entries({ 'adm-rec-suministro': userSupply, 'adm-rec-periodo': 'Recibo UI fixture', 'adm-rec-emision': '2026-01-01', 'adm-rec-vencimiento': '2026-02-01', 'adm-rec-consumo': '18', 'adm-rec-monto': '72.50' })) await chrome.fill('#' + id, value);
    await chrome.submit('#admin-recibo-form');
    await wait(async () => !!(await dbValue("SELECT id_recibo FROM recibos WHERE periodo='Recibo UI fixture'")), 'crear recibo');
    await wait(() => chrome.evaluate('document.getElementById("admin-rec-list").textContent.includes("Recibo UI fixture")'), 'render recibo');
    await cardButton('#admin-rec-list', 'Recibo UI fixture', 'Editar');
    await chrome.fill('#adm-rec-monto', '80'); await chrome.submit('#admin-recibo-form');
    await wait(async () => Number((await dbValue("SELECT monto FROM recibos WHERE periodo='Recibo UI fixture'")).monto) === 80, 'editar recibo');
    await wait(() => chrome.evaluate('document.getElementById("admin-rec-list").textContent.includes("80.00")'), 'render edición');
    await cardButton('#admin-rec-list', 'Recibo UI fixture', 'Anular'); await chrome.click('#confirm-ok');
    await wait(async () => (await dbValue("SELECT estado FROM recibos WHERE periodo='Recibo UI fixture'")).estado === 'Anulado', 'anular recibo');
    ok('Recibos: listar, crear, editar y anular desde la interfaz hasta PostgreSQL');

    await nav('admin-cortes'); await chrome.click('#btn-nuevo-corte');
    await require('./visual-checks.cjs').matrix(chrome,output,'admin-corte-form','admin');
    await chrome.fill('#adm-alcance', 'Zona'); await chrome.fill('#adm-distrito', 'Distrito fixture'); await chrome.fill('#adm-zona', 'Zona fixture');
    await chrome.fill('#adm-motivo', 'Corte UI fixture'); await chrome.fill('#adm-inicio', '2030-01-01T09:00'); await chrome.fill('#adm-fin', '2030-01-01T12:00');
    await chrome.submit('#admin-corte-form');
    await wait(async () => !!(await dbValue("SELECT id_corte FROM cortes_servicio WHERE motivo='Corte UI fixture'")), 'crear corte');
    await wait(() => chrome.evaluate('document.getElementById("admin-cortes-list").textContent.includes("Corte UI fixture")'), 'render corte');
    await cardButton('#admin-cortes-list', 'Corte UI fixture', 'Editar'); await chrome.fill('#adm-motivo', 'Corte editado fixture'); await chrome.submit('#admin-corte-form');
    await wait(async () => !!(await dbValue("SELECT id_corte FROM cortes_servicio WHERE motivo='Corte editado fixture'")), 'editar corte');
    await wait(() => chrome.evaluate('document.getElementById("admin-cortes-list").textContent.includes("Corte editado fixture")'), 'render edición corte');
    await cardButton('#admin-cortes-list', 'Corte editado fixture', 'Cancelar'); await chrome.click('#confirm-ok');
    await wait(async () => (await dbValue("SELECT cancelado FROM cortes_servicio WHERE motivo='Corte editado fixture'")).cancelado === true, 'cancelar corte');
    ok('Cortes: listar, crear, editar y cancelar desde la interfaz hasta PostgreSQL');

    await nav('admin-incidencias', '#admin-inc-list .inc-item');
    await chrome.fill('#admin-inc-list select', 'En revisión');
    await wait(async () => (await dbValue('SELECT estado FROM incidencias WHERE id_incidencia=$1', [incident.incidencia.id_incidencia])).estado === 'En revisión', 'estado incidencia');
    await wait(() => chrome.evaluate('document.querySelector("#admin-inc-list button") !== null'), 'fotografía');
    await chrome.click('#admin-inc-list button');
    await wait(() => chrome.evaluate('document.getElementById("foto-img").naturalWidth>0'), 'imagen autenticada');
    await require('./visual-checks.cjs')(chrome,output,'admin-foto-modal',1366,900);
    await chrome.click('#foto-close');
    assert.equal(await chrome.evaluate('document.getElementById("foto-img").hasAttribute("src")'), false);
    ok('Incidencias: listado, cambio de estado, fotografía protegida y liberación de imagen');
    // Solo fixture: una hora cuya representación UTC cae al día siguiente.
    const diaLima = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    await pool.query('UPDATE pagos SET fecha_pago=$1::timestamp WHERE id_recibo=$2', [diaLima+' 21:00:00',receipt.recibo.id_recibo]);
    await nav('admin-pagos', '#admin-pay-list .inc-item');
    assert.equal(await chrome.evaluate('document.getElementById("adm-pay-total").textContent'), '1');
    assert.equal(await chrome.evaluate('document.getElementById("adm-pay-hoy").textContent'), '1', 'El indicador debe usar el día visible en Lima, no el prefijo UTC.');
    assert.equal(await chrome.evaluate('document.getElementById("adm-pay-mes").textContent'), '1');
    await chrome.fill('#adm-pay-sum', userSupply);
    await wait(() => chrome.evaluate('document.getElementById("admin-pay-list").textContent.includes("30.00")'), 'filtro pagos');
    ok('Pagos: listado de solo lectura, filtros e indicadores');
    await nav('admin-atencion', '#admin-ate-list .inc-item');
    await chrome.click('#admin-ate-list button');
    await require('./visual-checks.cjs').matrix(chrome,output,'admin-atencion-form','admin');
    await chrome.fill('#adm-ate-estado-new', 'Respondida'); await chrome.fill('#adm-ate-resp-text', 'Respuesta administrativa fixture'); await chrome.submit('#admin-ate-resp-form');
    await wait(async () => (await dbValue('SELECT respuesta FROM solicitudes_atencion WHERE id_solicitud=$1', [attention.solicitud.id_solicitud])).respuesta === 'Respuesta administrativa fixture', 'respuesta atención');
    ok('Atención: consultar, responder y cambiar estado con persistencia');
    await nav('admin-cuenta');
    await wait(() => chrome.evaluate('document.getElementById("ac-correo").textContent==="admin@fixture.invalid"'), 'cuenta administrativa');
    await chrome.screenshot(path.join(output, 'admin-fixture-cuenta.png'));
    assert.equal(await chrome.evaluate('__sockets.length'), 1);
    assert.equal(await chrome.evaluate('__sockets.filter(s=>s.connected).length'), 1);
    ok('Cuenta administrativa y un solo socket después de navegar por todos los módulos');

    // Respuesta ya iniciada, pero entregada al código tras cerrar sesión.
    await chrome.evaluate(`const originalFetch=window.fetch;window.fetch=async(...args)=>{const response=await originalFetch(...args);if(String(args[0]).includes('/api/admin/usuarios'))await new Promise(resolve=>setTimeout(resolve,900));return response;};`);
    await nav('admin-usuarios'); await pause(100); await chrome.click('#admin-logout'); await pause(1100);
    assert.equal(await chrome.evaluate('document.getElementById("admin-content").children.length'), 0);
    assert.equal(await chrome.evaluate('document.body.textContent.includes("cliente@fixture.invalid")'), false);
    assert.equal(await chrome.evaluate('document.querySelectorAll("img[src^=blob]").length'), 0);
    assert.equal(await chrome.evaluate('sessionStorage.getItem("hm_admin_token")'), null);
    assert.equal(await chrome.evaluate('__sockets.filter(s=>s.connected).length'), 0);
    await chrome.evaluate('location.hash="admin-usuarios"'); await pause(100);
    assert.equal(await chrome.evaluate('document.getElementById("admin-content").children.length'), 0);
    ok('Logout elimina datos, formularios, fotos, sesión y socket; una respuesta tardía no repuebla el DOM');
    await login(adminSupply);
    await wait(() => chrome.evaluate('!document.getElementById("admin-panel").hidden'), 'segundo login');
    await wait(() => chrome.evaluate('__sockets.filter(s=>s.connected).length===1'), 'socket segundo login');
    assert.equal(await chrome.evaluate('__sockets.length'), 2);
    await chrome.click('#admin-logout');
    ok('Segundo login crea una conexión nueva y no conserva conexiones anteriores');

    await require('./client-checks.cjs')({ chrome, origin, output, pool, request, admin, user, password,
      adminSupply, userSupply, supplyId, png, wait, pause, ok, expiredToken });

    for (const route of routes) {
      const method = route[1].toUpperCase();
      const id = route[2].includes('/usuarios/') ? userId : route[2].includes('/suministros/') ? supplyId : route[2].includes('/incidencias/') ? incident.incidencia.id_incidencia : route[2].includes('/atencion/') ? attention.solicitud.id_solicitud : 1;
      const endpoint = route[2].replace(':id', String(id));
      if (method === 'GET') await request(method, endpoint, admin.token, undefined, 200);
    }
    assert.deepEqual(report.browserErrors, [], 'Errores JavaScript del navegador');
    assert.deepEqual(report.assetFailures, [], 'Recursos con errores HTTP');
    assert.equal(chrome.requests.some(request=>request.url.includes('trycloudflare.com')),false,'Sin peticiones a túneles');
    ok('Sin errores JavaScript del navegador; lecturas administrativas autenticadas verificadas');
  } catch (error) {
    report.failure = error.stack;
    if (chrome) { try { await chrome.screenshot(path.join(output, 'failure.png')); } catch (_) {} }
    console.error(error.message); process.exitCode = 1;
  } finally {
    if (chrome) await chrome.close();
    if (backend) backend.kill('SIGTERM');
    if (web) await new Promise(resolve => web.close(resolve));
    if (pool) await pool.end();
    else await parent.end();
    fs.writeFileSync(path.join(output, 'admin-e2e.json'), JSON.stringify(report, null, 2) + '\n');
    fs.writeFileSync(path.join(output, 'isolated-backend.log'), serverOutput);
    console.log('Reporte: ' + path.join(output, 'admin-e2e.json'));
  }
})();
