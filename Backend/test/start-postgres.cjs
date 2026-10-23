'use strict';
// Supervisor, API y worker reales; red externa bloqueada por el laboratorio.
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { spawn } = require('node:child_process'), net = require('node:net');
const { nuevaBase, sql } = require('./email-schema.cjs');
const { SCOPE } = require('../gmail-mail');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
test('esquema outbox ausente falla antes de readiness y no abre la API', { timeout: 15000 }, async () => {
    const { pool, connection } = await nuevaBase('shared_missing_schema');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-shared-missing-')); fs.chmodSync(dir, 0o700);
    try {
        const file = path.join(dir, 'secret.json'), sender = 'fixture.sender@gmail.com';
        fs.writeFileSync(file, JSON.stringify({ type: 'authorized_user', client_type: 'desktop', sender, scope: SCOPE,
            account_verified: false, account_check: 'scope_only', client_id: 'fixture.apps.googleusercontent.com', client_secret: 'fixture-secret', refresh_token: 'fixture-refresh' }), { mode: 0o600 });
        const child = spawn(process.execPath, [path.join(__dirname, '../start.cjs')], { env: { ...process.env,
            EMAIL_WORKER_SHARED_CONTAINER: '1', EMAIL_WORKER_ENABLED: '1', EMAIL_REGISTRATION_ENABLED: '1', EMAIL_PROVIDER: 'gmail',
            GMAIL_SENDER: sender, GMAIL_CREDENTIALS_FILE: file, EMAIL_WORKER_EXPECTED_DATABASE: connection.database,
            EMAIL_WORKER_DATABASE_URL: `postgres://hm_fixture:fixture-only-not-production@127.0.0.1:${connection.port}/${connection.database}`,
            EMAIL_OUTBOX_KEY: crypto.randomBytes(32).toString('base64') }, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.resume();
        assert.equal(await new Promise(resolve => child.on('close', resolve)), 1);
        assert.ok(!output.includes('worker_ready')); assert.ok(!output.includes('api_started'));
    } finally { await pool.end(); fs.rmSync(dir, { recursive: true }); }
});
async function waitFor(predicate) {
    for (let i = 0; i < 120; i++) { if (await predicate()) return; await sleep(100); }
    throw Error('Timeout de fixture de procesos compartidos.');
}
test('API/worker reales: canario, OTP, login, SIGTERM, caídas y recuperación sin duplicados', { timeout: 60000 }, async () => {
    const { pool, connection } = await nuevaBase('shared_processes');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-shared-')); fs.chmodSync(dir, 0o700);
    let active;
    try {
        await pool.query(sql('init.sql')); await pool.query(sql('migrations/006_correo_outbox.sql'));
        const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
        const sender = 'fixture.sender@gmail.com', recipient = 'worker@example.invalid';
        const credentialFile = path.join(dir, 'secret.json'), mailbox = path.join(dir, 'mail.txt'), codeFile = path.join(dir, 'code.txt');
        fs.writeFileSync(credentialFile, JSON.stringify({ type: 'authorized_user', client_type: 'desktop', scope: SCOPE, sender,
            account_verified: false, account_check: 'scope_only', client_id: 'fixture.apps.googleusercontent.com',
            client_secret: 'fixture-secret', refresh_token: 'fixture-refresh' }), { mode: 0o644 });
        const db = `postgres://hm_fixture:fixture-only-not-production@127.0.0.1:${connection.port}/${connection.database}`;
        const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), CORS_ALLOWED_ORIGINS: 'https://localhost',
            DATABASE_URL: db, AUTH_TOKEN_SECRET: crypto.randomBytes(48).toString('hex'), EMAIL_OTP_SECRET: crypto.randomBytes(48).toString('hex'),
            EMAIL_OUTBOX_KEY: crypto.randomBytes(32).toString('base64'), EMAIL_PROVIDER: 'gmail', GMAIL_SENDER: sender,
            GMAIL_CREDENTIALS_FILE: '/missing/fixture.json', GMAIL_CREDENTIALS_JSON: fs.readFileSync(credentialFile, 'utf8'),
            EMAIL_REGISTRATION_ALLOWED_EMAIL: recipient, EMAIL_REGISTRATION_ENABLED: '1',
            EMAIL_WORKER_SHARED_CONTAINER: '1', EMAIL_WORKER_ENABLED: '1', EMAIL_WORKER_DATABASE_URL: db,
            EMAIL_WORKER_EXPECTED_DATABASE: connection.database, HIDRO_GMAIL_TEST_MAILBOX: mailbox, HIDRO_GMAIL_TEST_CODE_FILE: codeFile,
            NODE_OPTIONS: '--require=' + path.join(__dirname, 'gmail-fixture.cjs') };
        function start() {
            const child = spawn(process.execPath, [path.join(__dirname, '../start.cjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
            const state = { child, logs: '', errors: '' };
            child.stdout.on('data', data => { state.logs += data; }); child.stderr.on('data', data => { state.errors += data; });
            state.done = new Promise(resolve => child.once('close', code => resolve(code))); active = state; return state;
        }
        const base = `http://127.0.0.1:${port}`;
        async function ready(state) {
            await waitFor(async () => { try { return state.logs.includes('worker_ready') && (await fetch(base + '/api/health')).status === 200; } catch (_) { return false; } });
            assert.ok(state.logs.indexOf('worker_ready') < state.logs.indexOf('api_started'));
        }
        async function request(route, body, expected, token) {
            const r = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { Origin: 'https://localhost',
                'Content-Type': 'application/json', 'X-Hidro-Auth-Contract': 'otp-outbox-v1', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
                ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000) });
            assert.equal(r.status, expected, route); return r.json();
        }
        const initial = start(); await ready(initial);
        await request('/api/auth/otp/register', { solicitud_id: crypto.randomUUID(), correo: 'other@example.invalid', numero_suministro: '979000010', password: 'FixtureOnly123!' }, 503);
        assert.equal((await pool.query('SELECT count(*)::int n FROM registros_correo_pendientes')).rows[0].n, 0);
        const account = { solicitud_id: crypto.randomUUID(), correo: recipient, numero_suministro: '979000011', password: 'FixtureOnly123!' };
        const registration = await request('/api/auth/otp/register', account, 202);
        await waitFor(async () => (await pool.query("SELECT count(*)::int n FROM correo_outbox WHERE estado='aceptado'")).rows[0].n === 1);
        assert.equal(fs.readFileSync(mailbox, 'utf8'), 'accepted\n');
        await request('/api/auth/verify-email', { registro_id: registration.registro_id, codigo: fs.readFileSync(codeFile, 'utf8') }, 201);
        const login = await request('/api/auth/login', { numero_suministro: account.numero_suministro, password: account.password }, 200);
        const session = await request('/api/auth/session', null, 200, login.token); assert.equal(session.usuario.rol, 'usuario');
        // SIGKILL a cada hijo propio; el supervisor debe cerrar al otro y salir con 1.
        for (const role of ['worker_ready', 'api_started']) {
            const state = active; const event = state.logs.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (_) { return {}; } }).find(e => e.event === role);
            assert.ok(Number.isInteger(event.pid)); process.kill(event.pid, 'SIGKILL'); assert.equal(await state.done, 1);
            const recovered = start(); await ready(recovered); await sleep(1200);
            assert.equal(fs.readFileSync(mailbox, 'utf8'), 'accepted\n');
        }
        const last = active; last.child.kill('SIGTERM'); assert.equal(await last.done, 0); active = null;
        assert.equal((await pool.query('SELECT count(*)::int n FROM usuarios')).rows[0].n, 1);
        assert.equal((await pool.query('SELECT count(*)::int n FROM suministros')).rows[0].n, 1);
        assert.equal((await pool.query("SELECT count(*)::int n FROM correo_outbox WHERE estado='aceptado' AND intentos=1 AND payload IS NULL")).rows[0].n, 1);
        for (const privateValue of [account.password, 'fixture-refresh', 'fixture-secret', login.token, fs.readFileSync(codeFile, 'utf8')]) assert.ok(!last.logs.includes(privateValue));
    } finally {
        if (active) { active.child.kill('SIGTERM'); await active.done; }
        await pool.end(); fs.rmSync(dir, { recursive: true });
    }
});
