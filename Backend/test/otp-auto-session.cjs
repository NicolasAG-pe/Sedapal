'use strict';
// PostgreSQL aislado y correo simulado; nunca usa Neon ni credenciales reales.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { iniciar } = require('./email-api.cjs');
const { crearRegistroCorreo } = require('../email-registration');
let ctx, sequence = 810;
before(async () => { ctx = await iniciar(); });
after(async () => { if (ctx) await ctx.close(); });
async function pending() {
    const account = ctx.registro(++sequence);
    const { data } = await ctx.request('register', account, 202);
    return { account, id: data.registro_id, code: ctx.codigo(account.correo) };
}
async function get(route, token) {
    return fetch(ctx.base + route, { headers: { Authorization: 'Bearer ' + token } });
}
function service(pool, emitirSesion) {
    return crearRegistroCorreo({ pool, key: Buffer.from(process.env.EMAIL_OUTBOX_KEY, 'base64'),
        from: 'fixture@example.invalid', secreto: process.env.EMAIL_OTP_SECRET, emitirSesion });
}
test('OTP confirmado entrega JWT de ocho horas, sesión, aislamiento y contrato anterior', async () => {
    const p = await pending();
    const { data, res } = await ctx.request('verify-email', ctx.verificar(p.id, p.code), 201);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const claims = jwt.verify(data.token, process.env.AUTH_TOKEN_SECRET);
    assert.equal(claims.exp - claims.iat, 8 * 3600);
    assert.equal(claims.rol, 'usuario');
    assert.equal(claims.numero_suministro, p.account.numero_suministro);
    assert.equal(data.usuario.numero_suministro, p.account.numero_suministro, 'Campo consumido por APK anteriores');
    assert.equal(data.suministro.id_suministro, claims.id_suministro);
    const session = await get('/api/auth/session', data.token);
    assert.equal(session.status, 200);
    assert.equal((await session.json()).usuario.correo, p.account.correo);
    assert.equal((await get('/api/me/perfil', data.token)).status, 200);
    assert.equal((await get('/api/perfil/999999999', data.token)).status, 403);
    assert.equal((await get('/api/admin/usuarios', data.token)).status, 403);
    const repeated = await ctx.request('verify-email', ctx.verificar(p.id, p.code), 400);
    assert.ok(!repeated.data.token);
    const status = await ctx.request('verification-status', { registro_id: p.id }, 200);
    assert.deepEqual(status.data, { estado: 'verificado', registro_id: p.id });
    await ctx.request('login', { numero_suministro: p.account.numero_suministro, password: p.account.password }, 200);
    await ctx.db.query('UPDATE usuarios SET activo=FALSE WHERE id_usuario=$1', [claims.id_usuario]);
    assert.equal((await get('/api/auth/session', data.token)).status, 403);
});
test('OTP incorrecto, vencido y sin intentos nunca devuelve JWT ni crea cuenta', async () => {
    const p = await pending();
    const wrong = p.code === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++) assert.ok(!(await ctx.request('verify-email', ctx.verificar(p.id, wrong), 400)).data.token);
    assert.ok(!(await ctx.request('verify-email', ctx.verificar(p.id, p.code), 400)).data.token);
    const expired = await pending();
    await ctx.db.query("UPDATE registros_correo_pendientes SET codigo_vence_en=NOW()-INTERVAL '1 second' WHERE id=$1", [expired.id]);
    assert.ok(!(await ctx.request('verify-email', ctx.verificar(expired.id, expired.code), 400)).data.token);
    assert.equal((await ctx.db.query('SELECT count(*)::int n FROM usuarios WHERE correo=ANY($1)', [[p.account.correo, expired.account.correo]])).rows[0].n, 0);
});
test('Confirmaciones concurrentes emiten una sola sesión y una sola cuenta', async () => {
    const p = await pending();
    const results = await Promise.all([1, 2].map(() => ctx.request('verify-email', ctx.verificar(p.id, p.code))));
    assert.deepEqual(results.map(r => r.res.status).sort(), [201, 400]);
    assert.equal(results.filter(r => typeof r.data.token === 'string').length, 1);
    assert.equal((await ctx.db.query('SELECT count(*)::int n FROM suministros WHERE numero_suministro=$1', [p.account.numero_suministro])).rows[0].n, 1);
});
test('Emisión posterior al COMMIT; fallo al emitir conserva cuenta y recuperación pública sin token', async () => {
    const p = await pending(); let emitted = false;
    const s = service(ctx.db, async identity => {
        emitted = true;
        // Otra conexión ya puede ver la cuenta: no se emite dentro de la transacción.
        const r = await ctx.pool.query('SELECT id_usuario FROM usuarios WHERE id_usuario=$1', [identity.id_usuario]);
        assert.equal(r.rowCount, 1);
        throw new Error('Fallo sintético de firma después de confirmar');
    });
    await assert.rejects(s.verificar(ctx.verificar(p.id, p.code)), /Fallo sintético/);
    assert.ok(emitted);
    assert.deepEqual((await ctx.request('verification-status', { registro_id: p.id }, 200)).data, { estado: 'verificado', registro_id: p.id });
    await ctx.request('login', { numero_suministro: p.account.numero_suministro, password: p.account.password }, 200);
});
test('COMMIT fallido revierte la cuenta y nunca invoca al emisor', async () => {
    const p = await pending(); let emitted = false;
    const pool = { async connect() {
        const client = await ctx.db.connect();
        return { query(text, params) {
            if (text === 'COMMIT') throw new Error('COMMIT sintético fallido');
            return client.query(text, params);
        }, release: () => client.release() };
    } };
    await assert.rejects(service(pool, () => { emitted = true; }).verificar(ctx.verificar(p.id, p.code)), /COMMIT sintético/);
    assert.equal(emitted, false);
    assert.equal((await ctx.db.query('SELECT count(*)::int n FROM usuarios WHERE correo=$1', [p.account.correo])).rows[0].n, 0);
    await ctx.request('verify-email', ctx.verificar(p.id, p.code), 201);
});
test('Relectura posterior a confirmar rechaza cuenta deshabilitada o rol cambiado', async () => {
    for (const change of ['activo=FALSE', "rol='admin'"]) {
        const p = await pending(), original = ctx.pool.query;
        ctx.pool.query = async function(text, params) {
            if (typeof text === 'string' && text.includes('WHERE u.id_usuario=$1 AND s.numero_suministro=$2')) {
                await ctx.db.query('UPDATE usuarios SET ' + change + ' WHERE id_usuario=$1', [params[0]]);
            }
            return original.call(this, text, params);
        };
        try { assert.ok(!(await ctx.request('verify-email', ctx.verificar(p.id, p.code), 403)).data.token); }
        finally { ctx.pool.query = original; }
    }
});
test('Servicio sin emisor conserva respuesta anterior sin JWT', async () => {
    const p = await pending();
    assert.deepEqual(await service(ctx.db).verificar(ctx.verificar(p.id, p.code)), {
        estado: 'ok', mensaje: 'Correo verificado. Ya puedes iniciar sesión.', usuario: { numero_suministro: p.account.numero_suministro }
    });
});
