// Solo lecturas; no registra usuarios, pagos, incidencias ni notificaciones.
// Ejecutar: docker compose exec -T backend node < scripts/check-local.cjs
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');

async function request(base, path, options = {}) {
    return fetch(base + path, { ...options, signal: AbortSignal.timeout(10000) });
}

async function cors(base, origin, allowed) {
    const response = await request(base, '/api/auth/login', {
        method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization' }
    });
    assert.equal(response.headers.get('access-control-allow-origin'), allowed ? origin : null);
}

async function socket(base, origin, token, expectAuthenticated = true) {
    await new Promise((resolve, reject) => {
        const ws = new WebSocket(base.replace(/^http/, 'ws') + '/socket.io/?EIO=4&transport=websocket', { origin });
        const timer = setTimeout(() => finish(new Error('Timeout Socket.IO')), 10000);
        function finish(error) { clearTimeout(timer); ws.close(); error ? reject(error) : resolve(); }
        ws.on('message', data => {
            const packet = data.toString();
            if (packet.startsWith('0')) ws.send('40' + JSON.stringify({ token }));
            else if (packet === '2') ws.send('3');
            else if (packet.startsWith('40')) finish(expectAuthenticated ? undefined : new Error('Socket aceptó token inválido'));
            else if (packet.startsWith('44')) finish(expectAuthenticated ? new Error('Socket rechazó autenticación válida') : undefined);
        });
        ws.on('error', () => finish(new Error('Conexión WebSocket fallida')));
    });
}

async function denySocket(base, origin) {
    await new Promise((resolve, reject) => {
        const ws = new WebSocket(base.replace(/^http/, 'ws') + '/socket.io/?EIO=4&transport=websocket', { origin });
        const timer = setTimeout(() => { ws.terminate(); reject(new Error('Timeout verificando origen WebSocket')); }, 10000);
        ws.on('unexpected-response', (_req, response) => {
            let body = '';
            response.on('data', data => { body += data; });
            response.on('end', () => {
                clearTimeout(timer); ws.terminate();
                // Engine.IO usa 400 + Forbidden para abortUpgrade, y 403
                // para polling. Comprobar el motivo, no aceptar cualquier 400.
                [400, 403].includes(response.statusCode) && body.trim() === 'Forbidden'
                    ? resolve() : reject(new Error('Rechazo WebSocket inesperado: ' + response.statusCode));
            });
        });
        ws.on('open', () => { clearTimeout(timer); ws.close(); reject(new Error('Origen WebSocket ajeno aceptado')); });
        ws.on('error', () => {});
    });
}

(async () => {
    const pool = new Pool({ host: process.env.DB_HOST || 'db', port: Number(process.env.DB_PORT || 5432), database: process.env.POSTGRES_DB, user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, options: '-c default_transaction_read_only=on' });
    let child;
    try {
        const web = 'http://web';
        assert.equal((await request(web, '/')).status, 200);
        const config = await (await request(web, '/hm-api-config.js')).text();
        assert.match(config, /window\.HM_API_BASE\s*=\s*''/);
        assert.ok(!config.includes('trycloudflare'));
        for (const asset of ['/assets/css/app-layout.css','/assets/js/client-home.js','/assets/js/documents.js','/shared/icons.js','/shared/styles.css','/shared/assets/hm-symbol.svg','/shared/assets/water-pattern.svg']) {
            const response = await request(web, asset);
            assert.equal(response.status, 200, asset);
            const type = asset.endsWith('.svg') ? 'image/svg+xml' : asset.endsWith('.css') ? 'text/css' : 'javascript';
            assert.ok(response.headers.get('content-type')?.includes(type), asset + ': recurso real, sin fallback HTML.');
        }
        const health = await request(web, '/api/health');
        assert.equal(health.status, 200);
        assert.equal((await health.json()).estado, 'ok');
        assert.equal((await request(web, '/api/cortes')).status, 200);
        assert.equal((await request(web, '/api/me/perfil')).status, 401);
        console.log('OK: frontend relativo, health con PostgreSQL, cortes y protección REST.');

        const user = (await pool.query("SELECT id_usuario FROM usuarios WHERE activo=true AND rol='usuario' ORDER BY id_usuario LIMIT 1")).rows[0];
        assert.ok(user, 'Se necesita un usuario activo existente para verificar lecturas autenticadas.');
        const token = jwt.sign({ id_usuario: Number(user.id_usuario) }, process.env.AUTH_TOKEN_SECRET, { expiresIn: '2m' });
        for (const path of ['/api/me/perfil', '/api/me/recibos', '/api/me/pagos', '/api/me/incidencias', '/api/me/cortes', '/api/notificaciones', '/api/atencion']) {
            assert.equal((await request(web, path, { headers: { Authorization: 'Bearer ' + token } })).status, 200, path);
        }
        assert.equal((await request(web, '/api/admin/resumen', { headers: { Authorization: 'Bearer ' + token } })).status, 403);
        console.log('OK: 7 endpoints privados de lectura y separación usuario/admin (JWT interno de prueba).');

        for (const origin of ['http://localhost:8080', 'https://localhost', 'http://localhost']) {
            await cors(web, origin, true);
            const polling = await request(web, '/socket.io/?EIO=4&transport=polling', { headers: { Origin: origin } });
            assert.equal(polling.status, 200);
            assert.equal(polling.headers.get('access-control-allow-origin'), origin);
            await socket(web, origin, token);
        }
        await socket(web, 'http://localhost:8080', 'invalid-fixture', false);
        await cors(web, 'https://untrusted.example.invalid', false);
        const deniedPolling = await request(web, '/socket.io/?EIO=4&transport=polling', { headers: { Origin: 'https://untrusted.example.invalid' } });
        assert.equal(deniedPolling.status, 403);
        assert.equal((await deniedPolling.json()).code, 4);
        await denySocket(web, 'https://untrusted.example.invalid');
        console.log('OK: CORS local/Android, polling, Socket.IO autenticado y rechazo de token/origen ajeno.');

        const url = new URL('postgresql://db:5432/');
        url.username = process.env.POSTGRES_USER;
        url.password = process.env.POSTGRES_PASSWORD;
        url.pathname = '/' + process.env.POSTGRES_DB;
        child = spawn(process.execPath, ['/app/server.js'], {
            env: { ...process.env, PORT: '3101', DATABASE_URL: url.toString(), NODE_ENV: 'production', CORS_ALLOWED_ORIGINS: 'https://hidro-smoke.vercel.app,https://localhost', PGOPTIONS: '-c default_transaction_read_only=on' },
            stdio: 'ignore'
        });
        const direct = 'http://127.0.0.1:3101';
        let started = false;
        for (let i = 0; i < 40; i++) {
            try { if ((await request(direct, '/api/health')).status === 200) { started = true; break; } } catch (_) {}
            if (child.exitCode !== null) break;
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        assert.ok(started, 'API temporal PORT/DATABASE_URL no respondió');
        await cors(direct, 'https://hidro-smoke.vercel.app', true);
        await cors(direct, 'https://localhost', true);
        await cors(direct, 'http://localhost:8080', false);
        await socket(direct, 'https://hidro-smoke.vercel.app', token);
        await socket(direct, 'https://localhost', token);
        await denySocket(direct, 'http://localhost:8080');
        console.log('OK: PORT configurable, DATABASE_URL local real y CORS/Socket.IO de producción en instancia temporal.');
    } finally {
        if (child && child.exitCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); }
        await pool.end();
    }
})().catch(error => { console.error('FAIL:', error.message); process.exitCode = 1; });
