'use strict';
// Solo PostgreSQL sintético. Ningún correo ni servicio externo.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const OTPAuth = require('otpauth'), jwt = require('jsonwebtoken');
const { iniciar } = require('./email-api.cjs');
const { nuevaBase, sql } = require('./email-schema.cjs');
global.WebSocket = require('ws');
const { io } = require('../../Frontend/assets/vendor/socket.io.min.js');
let ctx, n = 820, ip = 1;
const key = crypto.randomBytes(32);
before(async () => { process.env.TOTP_ENCRYPTION_KEY = key.toString('base64');process.env.TOTP_ENROLLMENT_ENABLED='1';ctx = await iniciar(); });
after(async () => { if (ctx) await ctx.close();delete process.env.TOTP_ENCRYPTION_KEY;delete process.env.TOTP_ENROLLMENT_ENABLED; });
async function request(path, body, token, status) {
    const res = await fetch(ctx.base + path, { method: body === undefined ? 'GET' : 'POST', headers: {
        'Content-Type': 'application/json', 'X-Forwarded-For': '192.0.2.' + ip++, ...(token ? { Authorization: 'Bearer ' + token } : {})
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await res.json();if (status) assert.equal(res.status, status, data.mensaje);
    return { data, res };
}
async function account() {
    const a = ctx.registro(++n), p = (await ctx.request('register', a, 202)).data;
    const { data } = await ctx.request('verify-email', ctx.verificar(p.registro_id, ctx.codigo(a.correo)), 201);
    return { ...a, id: data.usuario.id_usuario, token: data.token };
}
async function secret(a, pending = false) {
    const m = (await ctx.db.query('SELECT * FROM usuario_2fa WHERE id_usuario=$1', [a.id])).rows[0];
    const raw = pending ? m.pendiente_secreto : m.secreto;
    const [, iv, text, tag] = raw.split('.'), d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    d.setAAD(Buffer.from('hidro-totp-v1:' + a.id));d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(text, 'base64')), d.final()]).toString('utf8');
}
function code(secret, ahead = 0) { return new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) }).generate({ timestamp: Date.now() + ahead }); }
function wrongCode(secret) {
    const valid = new Set([-30000, 0, 30000].map(offset => code(secret, offset)));
    let n = 0;while (valid.has(String(n).padStart(6, '0'))) n++;
    return String(n).padStart(6, '0');
}
async function enabled() {
    const a = await account();
    await request('/api/auth/2fa/setup', { password: a.password }, a.token, 200);
    a.secret = await secret(a, true);
    const { data } = await request('/api/auth/2fa/confirm', { codigo: code(a.secret) }, a.token, 200);
    a.oldToken = a.token;a.token = data.token;a.codes = data.codigos_recuperacion;return a;
}
async function challenge(a) { return (await ctx.request('login', { numero_suministro: a.numero_suministro, password: a.password }, 202)).data; }
const complete = (d, codigo, status) => request('/api/auth/2fa/login', { desafio: d.desafio, codigo }, null, status);
async function socket(token) {
    return new Promise(resolve => {
        const s = io(ctx.base, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 2000 });
        const done = success => { s.close();resolve(success); };s.on('connect', () => done(true));s.on('connect_error', () => done(false));
    });
}
test('Migración 007 aditiva/repetible conserva datos anteriores y no activa usuarios', async () => {
    const { pool } = await nuevaBase('totp_legacy');
    try {
        await pool.query(`CREATE TABLE usuarios(id_usuario BIGSERIAL PRIMARY KEY,correo TEXT,activo BOOLEAN,clave_hash TEXT);
            CREATE TABLE suministros(id_suministro BIGSERIAL PRIMARY KEY,id_usuario BIGINT REFERENCES usuarios,numero_suministro TEXT);
            INSERT INTO usuarios(correo,activo,clave_hash) VALUES ('legacy@example.invalid',TRUE,'fixture-no-plaintext-password');
            INSERT INTO suministros(id_usuario,numero_suministro) VALUES (1,'980000001')`);
        const before = (await pool.query('SELECT row_to_json(u) row FROM usuarios u')).rows;
        for (let i = 0; i < 2; i++) await pool.query(sql('migrations/007_usuario_2fa.sql'));
        assert.deepEqual((await pool.query('SELECT row_to_json(u) row FROM usuarios u')).rows, before);
        assert.equal((await pool.query('SELECT count(*)::int n FROM usuario_2fa')).rows[0].n, 0);
        assert.equal((await pool.query('SELECT numero_suministro FROM suministros')).rows[0].numero_suministro, '980000001');
    } finally { await pool.end(); }
    await ctx.db.query(sql('migrations/007_usuario_2fa.sql'));await ctx.db.query(sql('migrations/007_usuario_2fa.sql'));
});
test('TOTP interoperable con vector RFC 6238; usuario sin 2FA conserva login y JWT anterior', async () => {
    const t = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromUTF8('12345678901234567890'), digits: 8 });
    assert.equal(t.generate({ timestamp: 59000 }), '94287082');
    const a = await account(), login = await ctx.request('login', { numero_suministro: a.numero_suministro, password: a.password }, 200);
    const claims = jwt.verify(login.data.token, process.env.AUTH_TOKEN_SECRET);
    assert.equal(claims.exp - claims.iat, 28800);
    const old = jwt.sign({ id_usuario: a.id, rol: 'usuario' }, process.env.AUTH_TOKEN_SECRET, { expiresIn: '8h' });
    await request('/api/auth/session', undefined, old, 200);
    assert.equal(await socket(old), true);
});
test('QR privado y secreto cifrado: activación exige contraseña reciente y OTP válido', async () => {
    const a = await account();
    await request('/api/auth/2fa/setup', { password: 'wrong-fixture' }, a.token, 401);
    const qr = await request('/api/auth/2fa/setup', { password: a.password }, a.token, 200);
    assert.match(qr.data.qr, /^data:image\/png;base64,/);assert.equal(qr.res.headers.get('cache-control'), 'no-store');
    const s = await secret(a, true), m = (await ctx.db.query('SELECT * FROM usuario_2fa WHERE id_usuario=$1', [a.id])).rows[0];
    assert.equal(m.activo, false);assert.ok(!m.pendiente_secreto.includes(s));assert.ok(!JSON.stringify(qr.data).includes(s));
    await request('/api/auth/2fa/confirm', { codigo: wrongCode(s) }, a.token, 401);
    const { data } = await request('/api/auth/2fa/confirm', { codigo: code(s) }, a.token, 200);
    assert.equal(data.codigos_recuperacion.length, 10);
    assert.ok(data.codigos_recuperacion.every(c => /^[A-F0-9]{8}(?:-[A-F0-9]{8}){3}$/.test(c)));
    const hashes = (await ctx.db.query('SELECT codigo_hash FROM usuario_2fa_recuperacion WHERE id_usuario=$1', [a.id])).rows;
    assert.ok(!hashes.some(r => data.codigos_recuperacion.includes(r.codigo_hash)));
    const token = jwt.verify(data.token, process.env.AUTH_TOKEN_SECRET);assert.deepEqual(token.amr, ['pwd', 'otp']);
    await request('/api/auth/session', undefined, a.token, 401);await request('/api/auth/session', undefined, data.token, 200);
});
test('Setup vencido no activa ni emite sesión', async () => {
    const a = await account();await request('/api/auth/2fa/setup', { password: a.password }, a.token, 200);
    const s = await secret(a, true);await ctx.db.query("UPDATE usuario_2fa SET pendiente_hasta=clock_timestamp()-INTERVAL '1 second' WHERE id_usuario=$1", [a.id]);
    const r = await request('/api/auth/2fa/confirm', { codigo: code(s) }, a.token, 401);assert.ok(!r.data.token);
});
test('Desafío no es JWT ni autoriza sesión, perfil, recibos, Admin o Socket.IO', async () => {
    const a = await enabled(), d = await challenge(a);
    assert.ok(!d.token);assert.equal(d.estado, 'segundo_factor');
    for (const route of ['/api/auth/session', '/api/me/perfil', '/api/recibos/' + a.numero_suministro, '/api/admin/usuarios'])await request(route, undefined, d.desafio, 401);
    assert.equal(await socket(d.desafio), false);assert.equal(await socket(a.oldToken), false);assert.equal(await socket(a.token), true);
    const forged = jwt.sign({ id_usuario: a.id, rol: 'usuario', mfa_version: 1, token_use: 'challenge' }, process.env.AUTH_TOKEN_SECRET, { expiresIn: '5m' });
    await request('/api/auth/session', undefined, forged, 401);
    const onlyPassword = jwt.sign({ id_usuario: a.id, rol: 'usuario', mfa_version: 1, token_use: 'access', amr: ['pwd'] }, process.env.AUTH_TOKEN_SECRET, { expiresIn: '8h' });
    await request('/api/auth/session', undefined, onlyPassword, 401);assert.equal(await socket(onlyPassword), false);
    assert.equal((await ctx.db.query('SELECT count(*)::int n FROM desafios_2fa WHERE id_hash=$1', [d.desafio])).rows[0].n, 0, 'No se guarda el desafío en claro');
});
test('Activar 2FA desconecta un socket previamente autenticado', async t => {
    const a = await account(), s = io(ctx.base, { auth: { token: a.token }, transports: ['websocket'], reconnection: false, timeout: 2000 });
    t.after(() => s.close());
    await new Promise((resolve, reject) => { s.once('connect', resolve);s.once('connect_error', reject); });
    await request('/api/auth/2fa/setup', { password: a.password }, a.token, 200);
    const secretValue = await secret(a, true);
    const closed = new Promise(resolve => s.once('disconnect', resolve));
    await request('/api/auth/2fa/confirm', { codigo: code(secretValue) }, a.token, 200);
    let timeout;
    try { await Promise.race([closed, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Socket anterior no desconectado')), 2000); })]); }
    finally { clearTimeout(timeout); }
    assert.equal(s.connected, false);
});
test('Un desafío no puede completarse con códigos de recuperación de otra cuenta', async () => {
    const a = await enabled(), b = await enabled();
    await complete(await challenge(a), b.codes[0], 401);
    const r = await complete(await challenge(b), b.codes[0], 200);
    assert.equal(r.data.usuario.correo, b.correo);
});
test('TOTP válido completa login; paso temporal y desafío no pueden reutilizarse', async () => {
    const a = await enabled(), d = await challenge(a), current = code(a.secret, 30000);
    let expired = code(a.secret, -90000);
    if (expired === current) expired = wrongCode(a.secret);
    await complete(d, expired, 401);
    const { data } = await complete(d, current, 200);
    await request('/api/auth/session', undefined, data.token, 200);
    await complete(d, current, 401);await complete(await challenge(a), current, 401);
});
test('Recuperación concurrente de un solo uso; otro código permite recuperar acceso', async () => {
    const a = await enabled(), first = await challenge(a), second = await challenge(a);
    const results = await Promise.all([first, second].map(d => complete(d, a.codes[0])));
    assert.deepEqual(results.map(r => r.res.status).sort(), [200, 401]);
    await complete(await challenge(a), a.codes[0], 401);
    const r = await complete(await challenge(a), a.codes[1], 200);assert.ok(r.data.token);
});
test('Caducidad, cambio de contraseña, baja y cambio de versión invalidan desafíos', async () => {
    const a = await enabled(), d = await challenge(a);
    await ctx.db.query("UPDATE desafios_2fa SET vence_en=clock_timestamp()-INTERVAL '1 second' WHERE id_usuario=$1", [a.id]);
    await complete(d, a.codes[0], 401);
    const changed = await challenge(a);
    await ctx.db.query("UPDATE usuarios SET clave_hash=clave_hash||'fixture-changed' WHERE id_usuario=$1", [a.id]);
    await complete(changed, a.codes[0], 401);
    await ctx.db.query('UPDATE usuarios SET activo=FALSE WHERE id_usuario=$1', [a.id]);
    await complete(changed, a.codes[0], 401);
    const b = await enabled(), v = await challenge(b);
    await ctx.db.query('UPDATE usuario_2fa SET version=version+1 WHERE id_usuario=$1', [b.id]);
    await complete(v, b.codes[0], 401);
});
test('Cinco fallos bloquean la cuenta aunque se generen otros desafíos; desafío tiene cinco intentos', async () => {
    const a = await enabled(), d = await challenge(a), d2 = await challenge(a);
    for (let i = 0; i < 5; i++) await complete(d, wrongCode(a.secret), 401);
    await complete(d2, a.codes[0], 429);
    await ctx.request('login', { numero_suministro: a.numero_suministro, password: a.password }, 429);
    const r = (await ctx.db.query('SELECT fallos,bloqueado_hasta FROM usuario_2fa WHERE id_usuario=$1', [a.id])).rows[0];assert.equal(r.fallos, 5);assert.ok(r.bloqueado_hasta);
    await ctx.db.query("UPDATE usuario_2fa SET bloqueado_hasta=clock_timestamp()-INTERVAL '1 second' WHERE id_usuario=$1", [a.id]);
    await complete(d, a.codes[0], 401);await complete(d2, a.codes[0], 200);
});
test('No más de diez desafíos pendientes por cuenta', async () => {
    const a = await enabled();for (let i = 0; i < 10; i++) await challenge(a);
    await ctx.request('login', { numero_suministro: a.numero_suministro, password: a.password }, 429);
});
test('Cambiar recuperación/desactivar exige contraseña y factor; revoca códigos y sesiones previas', async () => {
    const a = await enabled();
    await request('/api/auth/2fa/disable', { password: a.password }, a.token, 401);
    await request('/api/auth/2fa/recovery', { password: 'bad-fixture', codigo: a.codes[0] }, a.token, 401);
    const regen = (await request('/api/auth/2fa/recovery', { password: a.password, codigo: a.codes[0] }, a.token, 200)).data;
    await request('/api/auth/session', undefined, a.token, 401);
    await complete(await challenge(a), a.codes[1], 401);
    const disabled = (await request('/api/auth/2fa/disable', { password: a.password, codigo: regen.codigos_recuperacion[0] }, regen.token, 200)).data;
    await request('/api/auth/session', undefined, regen.token, 401);await request('/api/auth/session', undefined, disabled.token, 200);
    await ctx.request('login', { numero_suministro: a.numero_suministro, password: a.password }, 200);
    const m = (await ctx.db.query('SELECT activo,secreto FROM usuario_2fa WHERE id_usuario=$1', [a.id])).rows[0];assert.equal(m.activo, false);assert.equal(m.secreto, null);
    assert.equal((await ctx.db.query('SELECT count(*)::int n FROM usuario_2fa_recuperacion WHERE id_usuario=$1 AND usado_en IS NULL', [a.id])).rows[0].n, 0);
});
test('Clave ausente o cifrado alterado falla cerrado sin deshabilitar 2FA', async () => {
    const a = await enabled(), d = await challenge(a);
    delete process.env.TOTP_ENCRYPTION_KEY;
    await complete(d, a.codes[0], 503);await request('/api/auth/2fa/disable', { password: a.password, codigo: a.codes[1] }, a.token, 503);
    process.env.TOTP_ENCRYPTION_KEY = key.toString('base64');
    await ctx.db.query("UPDATE usuario_2fa SET secreto=secreto||'corrupt' WHERE id_usuario=$1", [a.id]);
    await complete(d, code(a.secret, 30000), 503);
});
test('Cerrar nuevas activaciones no deshabilita ni permite omitir factores existentes', async () => {
    const a = await enabled(), b = await account();
    process.env.TOTP_ENROLLMENT_ENABLED='0';
    try {
        await request('/api/auth/2fa/setup', { password: b.password }, b.token, 503);
        assert.equal((await request('/api/auth/2fa', undefined, b.token, 200)).data.disponible, false);
        await complete(await challenge(a), a.codes[0], 200);
    } finally { process.env.TOTP_ENROLLMENT_ENABLED='1'; }
});
