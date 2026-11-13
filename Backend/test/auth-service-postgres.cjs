'use strict';
// MS-03: integración del servicio Auth sobre PostgreSQL 18 sintético aislado.
// Arranca el proceso del servicio (otro PID) y ejecuta: salud, registro OTP con
// outbox, entrega simulada por el worker en el proceso de prueba, verificación,
// login, sesión, perfil, 2FA, introspección interna, cambio de contraseña,
// revocación administrativa y reinicio conservando la revocación.
// Sin proveedores externos: la entrega de correo es un fixture en el proceso padre.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { fork } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');
const jwt = require('jsonwebtoken');
const OTPAuth = require('otpauth');
const { nuevaBase, sql } = require('./email-schema.cjs');
const { crearProcesadorOutbox } = require('../email-outbox');
const { crearRemitente } = require('../resend-mail');
const { crearCifradoTotp } = require('../totp-crypto');
const { PATH: INTROSPECT_PATH, configuration, createIntrospector } = require('../services/auth/internal-transport.cjs');

const hashFixture = password => {
    const salt = crypto.randomBytes(16).toString('hex');
    return 'scrypt$' + salt + '$' + crypto.scryptSync(password, salt, 64).toString('hex');
};

test('Servicio Auth independiente: OTP, sesión, 2FA, introspección y revocación en otro PID', async t => {
    const db = await (async () => {
        const { pool: base, connection } = await nuevaBase('ms_auth');
        await base.query(sql('init.sql'));
        for (const migracion of ['003_verificacion_correo.sql', '006_correo_outbox.sql', '007_usuario_2fa.sql', '011_recuperacion_clave.sql']) {
            await base.query(sql('migrations/' + migracion));
            await base.query(sql('migrations/' + migracion)); // repetible
        }
        return { pool: base, connection };
    })();
    t.after(async () => { await db.pool.end(); });
    const secretos = { AUTH_TOKEN_SECRET: crypto.randomBytes(32).toString('hex'),
        EMAIL_OTP_SECRET: crypto.randomBytes(32).toString('hex'),
        EMAIL_OUTBOX_KEY: crypto.randomBytes(32).toString('base64'),
        TOTP_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
        AUTH_INTERNAL_SECRET: crypto.randomBytes(32).toString('hex') };
    const reservation = net.createServer();
    await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const puerto = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    const ambiente = () => ({ PATH: process.env.PATH, NODE_ENV: 'test', PORT: String(puerto),
        DATABASE_URL: `postgresql://hm_fixture:fixture-only-not-production@127.0.0.1:${db.connection.port}/${db.connection.database}`,
        EMAIL_REGISTRATION_ENABLED: '1', RESEND_FROM: 'correo@example.invalid', TOTP_ENROLLMENT_ENABLED: '1', ...secretos });
    let child, parada, logs = '', ip = 1;
    async function arrancar() {
        child = fork(path.resolve(__dirname, '../services/auth/server.cjs'), [], { silent: true, env: ambiente() });
        child.stdout.on('data', b => { logs += b; });
        child.stderr.on('data', b => { logs += b; });
        parada = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
        await Promise.race([new Promise(resolve => child.once('message', resolve)), parada.then(() => { throw Error('Auth no arrancó'); }),
            new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('Arranque vencido')), 10000); timer.unref(); })]);
        assert.notEqual(child.pid, process.pid);
    }
    t.after(async () => { if (child?.exitCode === null && child?.signalCode === null) child.kill('SIGTERM'); await parada; });
    await arrancar();
    const base = 'http://127.0.0.1:' + puerto;
    async function request(ruta, { metodo = 'GET', cuerpo, token, contrato, ipFija } = {}) {
        const res = await fetch(base + ruta, { method: metodo, headers: {
            ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(contrato ? { 'X-Hidro-Auth-Contract': contrato } : {}),
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
            'X-Forwarded-For': ipFija || '192.0.2.' + (ip++) }, ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }) });
        let data; try { data = await res.json(); } catch (_) { data = {}; }
        return { res, data };
    }
    // Salud del proceso
    assert.equal((await (await fetch(base + '/live')).json()).service, 'auth');
    assert.equal((await (await fetch(base + '/ready')).json()).status, 'ok');
    assert.equal((await (await fetch(base + '/ready')).json()).auth_contract, 'hidro-auth-2fa-v2');

    // Registro OTP: el servicio solo encola; nadie envía desde el proceso del servicio
    const cuenta = { correo: 'cliente800@example.invalid', numero_suministro: '900800800', password: 'FixtureAuth123' };
    const alta = await request('/api/auth/register', { metodo: 'POST', contrato: 'otp-outbox-v1',
        cuerpo: { ...cuenta, solicitud_id: crypto.randomUUID() } });
    assert.equal(alta.res.status, 202, JSON.stringify(alta.data));
    const { rows: [trabajo] } = await db.pool.query(`SELECT o.*,e.registro_id FROM correo_outbox o
        JOIN registros_correo_envios e USING(id) WHERE e.registro_id=$1`, [alta.data.registro_id]);
    assert.equal(trabajo.estado, 'pendiente');
    // Entrega simulada por el worker (proceso de prueba) y verificación
    const mensajes = [];
    const fixtureFetch = async (url, opciones) => {
        assert.equal(url, 'https://api.resend.com/emails');
        const body = JSON.parse(opciones.body);
        mensajes.push({ correo: body.to[0], codigo: body.text.match(/: (\d{6})/)[1] });
        return Response.json({ id: crypto.randomUUID() });
    };
    const worker = crearProcesadorOutbox({ pool: db.pool, key: Buffer.from(secretos.EMAIL_OUTBOX_KEY, 'base64'),
        enviarCodigo: crearRemitente({ apiKey: 'fixture-provider-key' }, { fetchImpl: fixtureFetch, maxAttempts: 1 }) });
    assert.equal((await worker.procesarUno()).estado, 'aceptado');
    assert.equal(mensajes.length, 1);
    const codigo = mensajes[0].codigo;
    const verificado = await request('/api/auth/verify-email', { metodo: 'POST', cuerpo: { registro_id: alta.data.registro_id, codigo } });
    assert.equal(verificado.res.status, 201, JSON.stringify(verificado.data));
    const idUsuario = verificado.data.usuario.id_usuario;
    const token = verificado.data.token;
    assert.equal(jwt.verify(token, secretos.AUTH_TOKEN_SECRET).id_usuario, idUsuario);
    assert.equal(jwt.verify(token, secretos.AUTH_TOKEN_SECRET).exp - jwt.verify(token, secretos.AUTH_TOKEN_SECRET).iat, 28800);

    // Login y sesión con el token emitido por el servicio
    const sesion = await request('/api/auth/session', { token });
    assert.equal(sesion.res.status, 200, JSON.stringify(sesion.data));
    assert.equal(sesion.data.usuario.correo, cuenta.correo);
    const perfil = await request('/api/me/perfil', { token });
    assert.equal(perfil.res.status, 200);
    assert.equal(perfil.data.numero_suministro, cuenta.numero_suministro);
    const login = await request('/api/auth/login', { metodo: 'POST', cuerpo: { numero_suministro: cuenta.numero_suministro, password: cuenta.password } });
    assert.equal(login.res.status, 200);

    // Contrato interno: introspección del Bearer original
    const introspector = createIntrospector(configuration({ AUTH_INTROSPECTION_URL: base, AUTH_INTERNAL_SECRET: secretos.AUTH_INTERNAL_SECRET }));
    const identidad = await introspector(token);
    assert.equal(identidad.id_usuario, Number(idUsuario));
    assert.equal(identidad.numero_suministro, cuenta.numero_suministro);
    assert.equal(identidad.rol, 'usuario');
    assert.equal(identidad.mfa_version, 0);
    assert.equal(identidad.mfa_activo, false);
    assert.ok(Number.isInteger(identidad.id_suministro));
    assert.equal(await introspector('token-manipulado'), null);
    assert.equal(identidad.numero_suministro, cuenta.numero_suministro);
    assert.equal(identidad.rol, 'usuario');
    assert.equal(identidad.mfa_version, 0);
    assert.equal(identidad.mfa_activo, false);
    assert.ok(Number.isInteger(identidad.id_suministro));
    assert.equal(await introspector('token-manipulado'), null);

    // Cambio de contraseña transaccional; el trigger revocar_credenciales (011)
    // eleva la versión de seguridad y el JWT anterior pasa a SESSION_REAUTH_REQUIRED.
    const cambio = await request('/api/auth/change-password', { metodo: 'POST', token,
        cuerpo: { password_actual: cuenta.password, password_nueva: 'NuevaClave456', password_confirmacion: 'NuevaClave456' } });
    assert.equal(cambio.res.status, 200, JSON.stringify(cambio.data));
    assert.equal((await request('/api/auth/session', { token })).res.status, 401);
    const relanzamiento = await request('/api/auth/login', { metodo: 'POST', cuerpo: { numero_suministro: cuenta.numero_suministro, password: 'NuevaClave456' } });
    assert.equal(relanzamiento.res.status, 200);
    const tokenRenovado = relanzamiento.data.token;
    const fallido = await request('/api/auth/change-password', { metodo: 'POST', token: tokenRenovado,
        cuerpo: { password_actual: 'Incorrecta123', password_nueva: 'OtraClave789', password_confirmacion: 'OtraClave789' } });
    assert.equal(fallido.res.status, 401);
    assert.equal((await request('/api/auth/session', { token: tokenRenovado })).res.status, 200);

    // 2FA completa sobre el servicio: setup, confirm, sesión anterior invalidada, login con factor
    const setup = await request('/api/auth/2fa/setup', { metodo: 'POST', token: tokenRenovado, cuerpo: { password: 'NuevaClave456' } });
    assert.equal(setup.res.status, 200, JSON.stringify(setup.data));
    const { rows: [mfa] } = await db.pool.query('SELECT * FROM usuario_2fa WHERE id_usuario=$1', [idUsuario]);
    const secretoTotp = crearCifradoTotp(secretos).decrypt(mfa.pendiente_secreto, idUsuario);
    const codigoTotp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secretoTotp) }).generate({ timestamp: Date.now() });
    const confirmado = await request('/api/auth/2fa/confirm', { metodo: 'POST', token: tokenRenovado, cuerpo: { codigo: codigoTotp } });
    assert.equal(confirmado.res.status, 200, JSON.stringify(confirmado.data));
    assert.equal(confirmado.data.codigos_recuperacion.length, 10);
    const tokenTras2fa = confirmado.data.token;
    assert.equal((await request('/api/auth/session', { token: tokenRenovado })).res.status, 401); // versión MFA cambió
    assert.equal((await request('/api/auth/session', { token: tokenTras2fa })).res.status, 200);
    const desafio = await request('/api/auth/login', { metodo: 'POST', cuerpo: { numero_suministro: cuenta.numero_suministro, password: 'NuevaClave456' } });
    assert.equal(desafio.res.status, 202);
    // Código del paso siguiente: el paso usado en confirm no puede repetirse
    const codigoSegundo = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secretoTotp) }).generate({ timestamp: Date.now() + 30000 });
    const segundo = await request('/api/auth/2fa/login', { metodo: 'POST', cuerpo: { desafio: desafio.data.desafio, codigo: codigoSegundo } });
    assert.equal(segundo.res.status, 200, JSON.stringify(segundo.data));
    assert.deepEqual(jwt.verify(segundo.data.token, secretos.AUTH_TOKEN_SECRET).amr, ['pwd', 'otp']);
    const identidadMfa = await introspector(tokenTras2fa);
    assert.equal(identidadMfa.mfa_activo, true);
    assert.equal(identidadMfa.mfa_version, jwt.verify(tokenTras2fa, secretos.AUTH_TOKEN_SECRET).mfa_version);

    // Revocación administrativa y persistencia tras reinicio
    const adminCorreo = 'admin800@example.invalid';
    const { rows: [admin] } = await db.pool.query(
        `INSERT INTO usuarios(correo,clave_hash,rol,activo) VALUES ($1,$2,'admin',true) RETURNING id_usuario`,
        [adminCorreo, hashFixture('AdminFixture123')]);
    await db.pool.query('INSERT INTO suministros(numero_suministro,id_usuario) VALUES ($1,$2)', ['900800999', admin.id_usuario]);
    const loginAdmin = await request('/api/auth/login', { metodo: 'POST', cuerpo: { numero_suministro: '900800999', password: 'AdminFixture123' }, ipFija: '198.51.100.7' });
    assert.equal(loginAdmin.res.status, 200);
    const adminToken = loginAdmin.data.token;
    const metodoIncorrecto = await request('/api/admin/usuarios/' + idUsuario + '/estado', { metodo: 'POST', token: adminToken, cuerpo: { activo: false } });
    assert.equal(metodoIncorrecto.res.status, 404);
    const desactivacion = await request('/api/admin/usuarios/' + idUsuario + '/estado', { metodo: 'PATCH', token: adminToken, cuerpo: { activo: false } });
    assert.equal(desactivacion.res.status, 200, JSON.stringify(desactivacion.data));
    assert.equal((await request('/api/auth/session', { token: tokenTras2fa })).res.status, 403);
    const sinFirma = await fetch(base + INTROSPECT_PATH, { method: 'POST' }); // sin HMAC: 401
    assert.equal(sinFirma.status, 401);
    assert.equal(await introspector(tokenTras2fa), null);
    assert.equal((await request('/api/admin/usuarios/' + admin.id_usuario + '/estado', { metodo: 'PATCH', token: adminToken, cuerpo: { activo: false } })).res.status, 409);

    // Reinicio del servicio: la revocación persiste en PostgreSQL, no en memoria
    child.kill('SIGTERM');
    assert.equal((await parada).code, 0);
    await arrancar();
    assert.equal((await (await fetch(base + '/ready')).json()).status, 'ok');
    assert.equal((await request('/api/auth/session', { token: tokenTras2fa, ipFija: '198.51.100.9' })).res.status, 403);
    assert.equal(await introspector(tokenTras2fa), null);
    assert.equal((await request('/api/auth/login', { metodo: 'POST', cuerpo: { numero_suministro: cuenta.numero_suministro, password: 'NuevaClave456' }, ipFija: '198.51.100.11' })).res.status, 403);
    for (const valor of [token, tokenRenovado, tokenTras2fa, codigo, codigoTotp, codigoSegundo, cuenta.password, 'NuevaClave456', cuenta.correo,
        secretos.AUTH_TOKEN_SECRET, secretos.EMAIL_OUTBOX_KEY, secretos.EMAIL_OTP_SECRET, secretos.AUTH_INTERNAL_SECRET, secretos.TOTP_ENCRYPTION_KEY]) {
        assert.equal(logs.includes(valor), false, 'Los logs no deben contener secretos ni credenciales.');
    }
});
