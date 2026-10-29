'use strict';
// Procesos y PostgreSQL auténticos, únicamente base nueva sintética y proveedor mock.
const { test } = require('node:test'), assert = require('node:assert/strict');
const { spawn } = require('node:child_process'), crypto = require('node:crypto'), net = require('node:net'), path = require('node:path');
const { nuevaBase, sql } = require('./email-schema.cjs');
test('worker push compartido verifica esquema antes de API; caída detiene hermanos sin reenviar', { timeout: 20000 }, async () => {
  const { pool, connection } = await nuevaBase('push_shared');
  let child, done;
  try {
    await pool.query(sql('init.sql')); await pool.query(sql('migrations/011_recuperacion_clave.sql'));
    await pool.query(sql('migrations/012_notificaciones_push.sql'));
    const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
    const db = `postgres://hm_fixture:fixture-only-not-production@127.0.0.1:${connection.port}/${connection.database}`;
    child = spawn(process.execPath, [path.join(__dirname, '../start.cjs')], { env: { ...process.env,
      NODE_ENV: 'test', PORT: String(port), DATABASE_URL: db, EMAIL_PROVIDER: 'resend', EMAIL_REGISTRATION_ENABLED: '0',
      EMAIL_WORKER_ENABLED: '0', EMAIL_WORKER_SHARED_CONTAINER: '0',
      AUTH_TOKEN_SECRET: crypto.randomBytes(32).toString('hex'), PUSH_ENABLED: '1', PUSH_WORKER_ENABLED: '1',
      PUSH_WORKER_SHARED_CONTAINER: '1', PUSH_PROVIDER: 'mock', PUSH_TOKEN_KEY: crypto.randomBytes(32).toString('base64'),
      PUSH_DATABASE_URL: db, PUSH_EXPECTED_DATABASE: connection.database }, stdio: ['ignore', 'pipe', 'pipe'] });
    done = new Promise(resolve => child.once('close', resolve));
    let logs = ''; child.stdout.on('data', b => { logs += b; }); child.stderr.resume();
    // Mock no necesita credencial de Google; el supervisor debe permitir únicamente NODE_ENV=test.
    let health = false;
    for (let i = 0; i < 100 && !health; i++) {
      if (logs.includes('api_started')) {
        try { health = (await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) })).status === 200; } catch (_) {}
      }
      if (!health) await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(logs.includes('push_worker_ready')); assert.ok(logs.indexOf('push_worker_ready') < logs.indexOf('api_started'));
    assert.equal(health, true);
    const events = logs.split('\n').flatMap(l => { try { return [JSON.parse(l)]; } catch (_) { return []; } });
    process.kill(events.find(e => e.event === 'push_worker_ready').pid, 'SIGKILL');
    assert.equal(await done, 1); child = null;
    assert.equal((await pool.query('SELECT count(*)::int n FROM push_entregas')).rows[0].n, 0);
  } finally { if (child) { child.kill('SIGTERM'); await done; } await pool.end(); }
});
