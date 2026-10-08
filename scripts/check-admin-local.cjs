// Solo lecturas de datos reales. Los POST/PATCH se envían exclusivamente con
// JWT de usuario normal y deben quedar bloqueados por requiereAdmin antes de SQL.
// docker compose exec -T backend node < scripts/check-admin-local.cjs
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
async function socket(base, origin, token) {
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace(/^http/, 'ws') + '/socket.io/?EIO=4&transport=websocket', { origin });
    const timer = setTimeout(() => finish(new Error('Timeout Socket.IO')), 10000);
    let done = false;
    function finish(error) { if(done) return; done = true; clearTimeout(timer); ws.close(); error ? reject(error) : resolve(); }
    ws.on('message', message => {
      const value = message.toString();
      if(value.startsWith('0')) ws.send('40' + JSON.stringify({ token }));
      else if(value.startsWith('40')) finish();
      else if(value.startsWith('44')) finish(new Error('Socket rechazado'));
      else if(value === '2') ws.send('3');
    });
    ws.on('error', error => finish(error));
  });
}
(async () => {
  const pool = new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT,
    database: process.env.POSTGRES_DB, user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD,
    options: '-c default_transaction_read_only=on' });
  try {
    const rows = (await pool.query("SELECT u.id_usuario,u.rol,s.id_suministro FROM usuarios u LEFT JOIN suministros s ON s.id_usuario=u.id_usuario WHERE u.activo=true ORDER BY u.id_usuario")).rows;
    const admin = rows.find(row => row.rol === 'admin'), user = rows.find(row => row.rol === 'usuario');
    assert.ok(admin && user, 'Se necesitan cuentas existentes activas de ambos roles.');
    const sign = account => jwt.sign({ id_usuario: Number(account.id_usuario) }, process.env.AUTH_TOKEN_SECRET, { expiresIn: '2m' });
    const adminToken = sign(admin), userToken = sign(user), base = 'http://admin';
    async function request(endpoint, method = 'GET', token, body) {
      return fetch(base + endpoint, { method, headers: { Origin: 'http://localhost:8081', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
    }
    for (const client of ['http://web', base]) {
      assert.equal((await fetch(client + '/')).status, 200);
      const health = await fetch(client + '/api/health'); assert.equal(health.status, 200);
      assert.equal((await health.json()).estado, 'ok');
    }
    for (const asset of ['/assets/js/admin.js','/assets/css/admin.css','/assets/css/workspace.css','/shared/session.js','/shared/api.js','/shared/realtime.js','/shared/ui.js','/shared/icons.js','/shared/styles.css','/assets/vendor/socket.io.min.js','/shared/assets/hm-symbol.svg','/shared/assets/water-pattern.svg']) {
      const response = await request(asset);
      assert.equal(response.status, 200, asset);
      const type = asset.endsWith('.svg') ? 'image/svg+xml' : asset.endsWith('.css') ? 'text/css' : 'javascript';
      assert.ok(response.headers.get('content-type')?.includes(type), asset + ': debe servir el recurso, no un fallback HTML.');
    }
    console.log('OK: web/8080 y admin/8081; assets, proxies y health con PostgreSQL real.');
    const source = fs.readFileSync('/app/server.js','utf8');
    const routes = [...source.matchAll(/app\.(get|post|patch)\(["'](\/api\/admin\/[^"']+)["'], requiereAdmin/g)];
    assert.equal(routes.length, 19);
    for (const route of routes) {
      const method = route[1].toUpperCase(), endpoint = route[2].replace(':id','1');
      assert.equal((await request(endpoint, method, userToken, method === 'GET' ? undefined : {})).status, 403, method+' '+endpoint);
      assert.equal((await request(endpoint, method)).status, 401, method+' '+endpoint);
    }
    console.log('OK: las 19 rutas administrativas reales devuelven 403 a usuarios y 401 sin JWT.');
    for (const endpoint of ['/api/admin/resumen','/api/admin/usuarios','/api/admin/usuarios/'+user.id_usuario,
      '/api/admin/recibos','/api/admin/cortes','/api/admin/incidencias','/api/admin/pagos','/api/admin/atencion','/api/me/perfil']) {
      const response = await request(endpoint, 'GET', adminToken); assert.equal(response.status, 200, endpoint); await response.json();
    }
    const photo = (await pool.query('SELECT id_incidencia FROM incidencias WHERE foto IS NOT NULL LIMIT 1')).rows[0];
    if(photo) assert.equal((await request('/api/admin/incidencias/'+photo.id_incidencia+'/foto','GET',adminToken)).status,200);
    console.log('OK: resumen, usuarios/detalle, recibos, cortes, incidencias, pagos, atención y cuenta reales.');
    const cors = await fetch(base+'/api/auth/login', { method:'OPTIONS', headers:{Origin:'http://localhost:8081','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,authorization'} });
    assert.equal(cors.headers.get('access-control-allow-origin'),'http://localhost:8081');
    const polling = await request('/socket.io/?EIO=4&transport=polling'); assert.equal(polling.status,200);
    assert.equal(polling.headers.get('access-control-allow-origin'),'http://localhost:8081');
    await socket(base,'http://localhost:8081',adminToken);
    await socket('http://web','http://localhost:8080',userToken);
    console.log('OK: CORS 8081 y Socket.IO autenticado por ambos proxies, sin escrituras aceptadas.');
  } finally { await pool.end(); }
})().catch(error => { console.error(error.message); process.exitCode=1; });
