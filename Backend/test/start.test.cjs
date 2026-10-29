'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { supervisar, prepararCredenciales } = require('../start.cjs');
const { leerJsonPrivado, SCOPE } = require('../gmail-mail');
function fixture(env = {}, resist = false) {
    const calls = [], signals = new EventEmitter(); let cleaned = 0;
    const controller = supervisar({ env, signals, startupMs: 30, shutdownMs: 30, log() {},
        prepare: e => ({ env: { ...e, GMAIL_CREDENTIALS_FILE: '/private/fixture.json' }, cleanup() { cleaned++; } }),
        preparePush: e => ({ env: { ...e, PUSH_SERVICE_ACCOUNT_FILE: '/private/sender.json' }, cleanup() { cleaned++; } }),
        spawnImpl(command, args, options) {
            const child = new EventEmitter(); child.kills = [];
            child.kill = signal => { child.kills.push(signal); if (!resist || signal === 'SIGKILL') process.nextTick(() => child.emit('close', 0, signal)); return true; };
            calls.push({ command, args, options, child }); return child;
        } });
    return { ...controller, calls, signals, cleaned: () => cleaned };
}
const enabled = { EMAIL_WORKER_SHARED_CONTAINER: '1', EMAIL_WORKER_ENABLED: '1', EMAIL_REGISTRATION_ENABLED: '1', GMAIL_CREDENTIALS_FILE: '/etc/secrets/fixture', GMAIL_CREDENTIALS_JSON: 'fixture-private-json', EMAIL_WORKER_DATABASE_URL: 'private-fixture-url' };
test('por defecto conserva solo API; SIGTERM cierra el contenedor sin error', async () => {
    const f = fixture(); assert.equal(f.calls.length, 1); assert.match(f.calls[0].args[0], /server.js$/);
    f.signals.emit('SIGTERM'); assert.equal(await f.done, 0); assert.deepEqual(f.calls[0].child.kills, ['SIGTERM']);
    assert.equal(f.signals.listenerCount('SIGTERM'), 0);
});
test('push comparte contenedor con correo: readiness de ambos y secretos separados por proceso', async () => {
    const f = fixture({ ...enabled, AUTH_TOKEN_SECRET: 'fixture-jwt', PUSH_ENABLED: '1', PUSH_WORKER_ENABLED: '1',
        PUSH_WORKER_SHARED_CONTAINER: '1', PUSH_TOKEN_KEY: 'fixture-key', PUSH_SERVICE_ACCOUNT_JSON: 'fixture-json',
        PUSH_DATABASE_URL: 'fixture-db' });
    const push = f.calls.find(c => c.args[0].endsWith('/push.cjs'));
    const email = f.calls.find(c => c.args[0].endsWith('/email-outbox.cjs'));
    assert.equal(f.calls.length, 2);
    for (const key of ['AUTH_TOKEN_SECRET','GMAIL_CREDENTIALS_JSON','EMAIL_WORKER_DATABASE_URL']) assert.equal(push.options.env[key], undefined);
    assert.equal(email.options.env.PUSH_TOKEN_KEY, undefined);
    push.child.emit('message', { event: 'push_worker_ready' }); assert.equal(f.calls.length, 2);
    email.child.emit('message', { event: 'email_worker_ready' }); assert.equal(f.calls.length, 3);
    const api = f.calls[2]; assert.equal(api.options.env.PUSH_TOKEN_KEY, 'fixture-key');
    for (const key of ['PUSH_SERVICE_ACCOUNT_JSON','PUSH_SERVICE_ACCOUNT_FILE','PUSH_DATABASE_URL']) assert.equal(api.options.env[key], undefined);
    assert.equal(api.options.env.PUSH_WORKER_ENABLED, '0');
    push.child.emit('close', 1); assert.equal(await f.done, 1);
    assert.equal(f.cleaned(), 2); assert.equal(f.calls.length, 3);
});
test('push opt-in solo: fallo de readiness no abre API; flags incompatibles fallan cerrados', async () => {
    const f = fixture({ PUSH_ENABLED: '1', PUSH_WORKER_ENABLED: '1', PUSH_WORKER_SHARED_CONTAINER: '1' });
    assert.equal(f.calls.length, 1); assert.equal(await f.done, 1); assert.equal(f.cleaned(), 1);
    for (const env of [{ PUSH_WORKER_ENABLED: '1' }, { PUSH_WORKER_ENABLED: '1', PUSH_WORKER_SHARED_CONTAINER: '1' }]) {
        const invalid = fixture(env); assert.equal(await invalid.done, 1); assert.equal(invalid.calls.length, 0);
    }
});
test('espera readiness del worker y no pasa rutas privadas a la API; cierra ambos una vez', async () => {
    const f = fixture(enabled); assert.equal(f.calls.length, 1); assert.match(f.calls[0].args[0], /email-outbox.cjs$/);
    f.calls[0].child.emit('message', { event: 'other' }); assert.equal(f.calls.length, 1);
    f.calls[0].child.emit('message', { event: 'email_worker_ready' }); assert.equal(f.calls.length, 2);
    f.calls[0].child.emit('message', { event: 'email_worker_ready' }); assert.equal(f.calls.length, 2);
    assert.equal(f.calls[1].options.env.GMAIL_CREDENTIALS_FILE, undefined); assert.equal(f.calls[1].options.env.EMAIL_WORKER_DATABASE_URL, undefined);
    assert.equal(f.calls[0].options.env.GMAIL_CREDENTIALS_JSON, undefined); assert.equal(f.calls[1].options.env.GMAIL_CREDENTIALS_JSON, undefined);
    f.signals.emit('SIGTERM'); f.signals.emit('SIGINT'); assert.equal(await f.done, 0); assert.equal(f.cleaned(), 1);
    for (const c of f.calls) assert.deepEqual(c.child.kills, ['SIGTERM']);
});
test('secreto JSON privado evita proyecciones incompatibles y desaparece del entorno del worker', () => {
    const sender = 'fixture.sender@gmail.com';
    const raw = JSON.stringify({ type: 'authorized_user', client_type: 'desktop', sender, scope: SCOPE, account_verified: false,
        account_check: 'scope_only', client_id: 'fixture.apps.googleusercontent.com', client_secret: 'fixture-secret', refresh_token: 'fixture-refresh' });
    const env = { EMAIL_PROVIDER: 'gmail', GMAIL_SENDER: sender, GMAIL_CREDENTIALS_FILE: '/missing/fixture', GMAIL_CREDENTIALS_JSON: raw };
    const result = prepararCredenciales(env); assert.equal(result.env.GMAIL_CREDENTIALS_JSON, undefined);
    assert.equal(fs.statSync(result.env.GMAIL_CREDENTIALS_FILE).mode & 0o777, 0o600);
    assert.equal(leerJsonPrivado(result.env.GMAIL_CREDENTIALS_FILE).refresh_token, 'fixture-refresh'); result.cleanup();
    for (const invalid of ['invalid fixture JSON', 'x'.repeat(65537), JSON.stringify({ ...JSON.parse(raw), scope: 'openid' })]) {
        assert.throws(() => prepararCredenciales({ ...env, GMAIL_CREDENTIALS_JSON: invalid }), /preparar la credencial/);
    }
});
test('caída de API o worker cierra al otro con error y no reinicia trabajos dentro del proceso', async () => {
    for (const index of [0, 1]) {
        const f = fixture(enabled); f.calls[0].child.emit('message', { event: 'email_worker_ready' });
        f.calls[index].child.emit('close', 1); assert.equal(await f.done, 1);
        assert.deepEqual(f.calls[1 - index].child.kills, ['SIGTERM']); assert.equal(f.calls.length, 2); assert.equal(f.cleaned(), 1);
    }
});
test('timeout de arranque nunca abre la API y escalado de parada mata solo sus propios hijos', async () => {
    const f = fixture(enabled); assert.equal(await f.done, 1); assert.equal(f.calls.length, 1);
    const stubborn = fixture({}, true); stubborn.stop(); assert.equal(await stubborn.done, 1);
    assert.deepEqual(stubborn.calls[0].child.kills, ['SIGTERM', 'SIGKILL']);
});
test('configuración incompatible o error spawn fallan cerrados', async () => {
    for (const env of [{ EMAIL_WORKER_ENABLED: '1' }, { EMAIL_WORKER_SHARED_CONTAINER: '1', EMAIL_REGISTRATION_ENABLED: '1' }]) {
        const f = fixture(env); assert.equal(await f.done, 1); assert.equal(f.calls.length, 0);
    }
    const f = fixture(enabled); f.calls[0].child.emit('error', Error('fixture')); assert.equal(await f.done, 1); assert.equal(f.calls.length, 1);
});
test('un contenedor nuevo recupera el arranque tras un fallo sin reutilizar hijos', async () => {
    const first = fixture(enabled); first.calls[0].child.emit('close', 1); assert.equal(await first.done, 1);
    const fresh = fixture(enabled); fresh.calls[0].child.emit('message', { event: 'email_worker_ready' });
    assert.equal(fresh.calls.length, 2); fresh.stop(); assert.equal(await fresh.done, 0);
});
test('copia efímera 0600 desde secret file, conserva el original y rechaza enlaces', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-start-fixture-'));
    const file = path.join(dir, 'secret.json'); const sender = 'fixture.sender@gmail.com';
    const data = { type: 'authorized_user', client_type: 'desktop', sender, scope: SCOPE, account_verified: false,
        account_check: 'scope_only', client_id: 'fixture.apps.googleusercontent.com', client_secret: 'fixture-secret', refresh_token: 'fixture-refresh' };
    fs.writeFileSync(file, JSON.stringify(data), { mode: 0o644 });
    const env = { EMAIL_PROVIDER: 'gmail', GMAIL_SENDER: sender, GMAIL_CREDENTIALS_FILE: file };
    const result = prepararCredenciales(env), copy = result.env.GMAIL_CREDENTIALS_FILE;
    assert.equal(fs.statSync(path.dirname(copy)).mode & 0o777, 0o700); assert.equal(fs.statSync(copy).mode & 0o777, 0o600);
    assert.deepEqual(leerJsonPrivado(copy), data); result.cleanup(); assert.equal(fs.existsSync(copy), false); assert.equal(fs.existsSync(file), true);
    const link = path.join(dir, 'link'); fs.symlinkSync(file, link); assert.throws(() => prepararCredenciales({ ...env, GMAIL_CREDENTIALS_FILE: link }));
    fs.rmSync(dir, { recursive: true });
});
test('enlace del proveedor solo dentro del volumen de secretos protegido; rechaza escapes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-render-secret-')); fs.chmodSync(dir, 0o700);
    const root = path.join(dir, 'secrets'), dataDir = path.join(root, '..projection');
    fs.mkdirSync(root, { mode: 0o755 }); fs.mkdirSync(dataDir, { mode: 0o700 });
    const sender = 'fixture.sender@gmail.com';
    const raw = JSON.stringify({ type: 'authorized_user', client_type: 'desktop', sender, scope: SCOPE, account_verified: false,
        account_check: 'scope_only', client_id: 'fixture.apps.googleusercontent.com', client_secret: 'fixture-secret', refresh_token: 'fixture-refresh' });
    const original = path.join(dataDir, 'secret.json'), link = path.join(root, 'secret.json');
    fs.writeFileSync(original, raw, { mode: 0o600 }); fs.symlinkSync('..projection/secret.json', link);
    const env = { EMAIL_PROVIDER: 'gmail', GMAIL_SENDER: sender, GMAIL_CREDENTIALS_FILE: link };
    const result = prepararCredenciales(env, { secretDirectory: root });
    assert.equal(leerJsonPrivado(result.env.GMAIL_CREDENTIALS_FILE).refresh_token, 'fixture-refresh'); result.cleanup();
    fs.unlinkSync(link); fs.writeFileSync(path.join(dir, 'outside.json'), raw, { mode: 0o600 }); fs.symlinkSync('../outside.json', link);
    assert.throws(() => prepararCredenciales(env, { secretDirectory: root }));
    fs.unlinkSync(link); fs.symlinkSync('..projection/secret.json', link); fs.chmodSync(root, 0o777);
    assert.throws(() => prepararCredenciales(env, { secretDirectory: root }));
    fs.rmSync(dir, { recursive: true });
});
