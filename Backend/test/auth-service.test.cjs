'use strict';
// MS-03: pruebas seguras del servicio Auth (sin PostgreSQL ni red externa).
// Cubre: aislamiento de rutas, paridad de requiereAuth/JWT, contrato interno de
// introspección (HMAC, replay, fail-closed), hooks de revocación, salud y
// configuración fail-closed. Los flujos 2FA/OTP con SQL real se prueban en
// auth-service-postgres.cjs sobre base sintética aislada.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { createService, fromEnvironment } = require('../services/auth/server.cjs');
const { PATH, key, signature, configuration, identidad, createIntrospector } = require('../services/auth/internal-transport.cjs');

const AUTH_SECRET = crypto.randomBytes(32).toString('hex');
const INTROSPECT_SECRET = crypto.randomBytes(32).toString('hex');
const OUTBOX_KEY = crypto.randomBytes(32).toString('base64');
const OTP_SECRET = crypto.randomBytes(32).toString('hex');
const ENV = { AUTH_TOKEN_SECRET: AUTH_SECRET, AUTH_INTERNAL_SECRET: INTROSPECT_SECRET, EMAIL_OUTBOX_KEY: OUTBOX_KEY,
    EMAIL_OTP_SECRET: OTP_SECRET, RESEND_FROM: 'correo@example.invalid', EMAIL_REGISTRATION_ENABLED: '0',
    NODE_ENV: 'test' };

const hashFixture = password => {
    const salt = crypto.randomBytes(16).toString('hex');
    return 'scrypt$' + salt + '$' + crypto.scryptSync(password, salt, 64).toString('hex');
};
const CLAVE = 'FixtureAuth123';

// Pool de fixture: responde por patrón SQL; rechaza consultas no previstas.
function fakePool(routes) {
    const calls = [];
    return { calls, query: async (sql, params) => {
        calls.push([sql, params]);
        for (const [match, response] of routes) {
            if ((typeof match === 'string' ? sql.includes(match) : match.test(sql))) {
                return typeof response === 'function' ? response(sql, params) : response;
            }
        }
        throw Error('SQL no prevista por el fixture: ' + sql.slice(0, 70));
    }, connect: async () => { throw Error('connect no esperado en esta prueba'); } };
}
const filaIdentidad = over => ({ rows: [{ id_usuario: 7, rol: 'usuario', activo: true, mfa_version: 0, mfa_activo: false,
    id_suministro: 3, numero_suministro: '900000007', ...over }], rowCount: 1 });
const POOL_IDENTIDAD = [[/FROM usuarios u\s+LEFT JOIN suministros s/, () => filaIdentidad()],
    [/SELECT correo FROM usuarios WHERE id_usuario/, () => ({ rows: [{ correo: 'u@example.invalid' }], rowCount: 1 })]];

async function start(t, { pool, env, hooks } = {}) {
    const service = createService({ pool: pool || fakePool(POOL_IDENTIDAD), env: { ...ENV, ...env }, hooks: hooks || {} });
    const server = http.createServer(service.app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const url = 'http://127.0.0.1:' + server.address().port;
    return { ...service, url, fetch: (ruta, opciones = {}) => fetch(url + ruta, opciones) };
}
const tokenDe = (claims = { id_usuario: 7, rol: 'usuario', token_use: 'access', mfa_version: 0, amr: ['pwd'] }) =>
    jwt.sign(claims, AUTH_SECRET, { expiresIn: '8h' });
const bearer = token => ({ headers: { Authorization: 'Bearer ' + token } });
const introspectRequest = (body, secret = INTROSPECT_SECRET, changes = {}) => {
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const timestamp = String(Date.now()), nonce = crypto.randomUUID();
    return { method: 'POST', body: payload,
        headers: { 'Content-Type': 'application/json', 'X-Hidro-Time': timestamp, 'X-Hidro-Nonce': nonce,
            'X-Hidro-Signature': signature(secret, timestamp, nonce, payload), ...changes } };
};

test('El servicio expone exactamente las rutas del dominio Auth y ninguna ajena', t => {
    const service = createService({ pool: fakePool(POOL_IDENTIDAD), env: ENV });
    const rutas = service.app.router.stack
        .filter(layer => layer.route)
        .flatMap(layer => Object.entries(layer.route.methods)
            .filter(([, activo]) => activo).map(([metodo]) => metodo.toUpperCase() + ' ' + layer.route.path))
        .sort();
    const esperadas = ['GET /api/auth/2fa', 'GET /api/auth/capabilities', 'GET /api/auth/password-recovery/capabilities',
        'GET /api/auth/session', 'GET /api/me/perfil', 'GET /api/perfil/:suministro', 'GET /live', 'GET /ready',
        'POST ' + PATH, 'POST /api/auth/2fa/confirm', 'POST /api/auth/2fa/disable', 'POST /api/auth/2fa/login',
        'POST /api/auth/2fa/recovery', 'POST /api/auth/2fa/setup', 'POST /api/auth/change-password',
        'POST /api/auth/login', 'POST /api/auth/otp/register', 'POST /api/auth/otp/resend-verification',
        'POST /api/auth/password-recovery/complete', 'POST /api/auth/password-recovery/request',
        'POST /api/auth/password-recovery/verify', 'POST /api/auth/register', 'POST /api/auth/resend-verification',
        'POST /api/auth/verification-status', 'POST /api/auth/verify-email',
        'PATCH /api/admin/suministros/:id/ubicacion', 'PATCH /api/admin/usuarios/:id/estado'].sort();
    assert.deepEqual(rutas, esperadas);
    for (const ajena of ['recibos', 'incidencias', 'pagos', 'cortes', 'atencion', 'notificaciones', 'push', 'resumen', 'socket.io']) {
        assert.equal(rutas.some(r => r.includes(ajena)), false, 'Ruta ajena filtrada: ' + ajena);
    }
});

test('requiereAuth replica el monolito: 401/403 fail-closed y 200 solo con estado vigente', async t => {
    const s = await start(t, { pool: fakePool(POOL_IDENTIDAD) });
    const sesion = { status: await (await s.fetch('/api/auth/session')).status,
        data: await (await s.fetch('/api/auth/session')).json() };
    assert.equal(sesion.status, 401);
    assert.equal(sesion.data.codigo, 'SESSION_REAUTH_REQUIRED');
    assert.equal((await s.fetch('/api/auth/session', bearer('no-es-un-jwt'))).status, 401);
    // JWT con id inválido
    assert.equal((await s.fetch('/api/auth/session', bearer(jwt.sign({ id_usuario: 'x' }, AUTH_SECRET, { expiresIn: '8h' })))).status, 401);
    // Cuenta desconocida y cuenta desactivada: 403 (como el monolito)
    const vacio = fakePool([[/FROM usuarios u\s+LEFT JOIN suministros s/, () => ({ rows: [], rowCount: 0 })]]);
    const s2 = await start(t, { pool: vacio });
    assert.equal((await s2.fetch('/api/auth/session', bearer(tokenDe()))).status, 403);
    const inactiva = fakePool([[/FROM usuarios u\s+LEFT JOIN suministros s/, () => filaIdentidad({ activo: false })]]);
    const s3 = await start(t, { pool: inactiva });
    assert.equal((await s3.fetch('/api/auth/session', bearer(tokenDe()))).status, 403);
    // Versión MFA obsoleta y rol cambiado: 401 (permiteSesion)
    const s4 = await start(t, { pool: fakePool([[/FROM usuarios u\s+LEFT JOIN suministros s/, () => filaIdentidad({ mfa_version: 4, mfa_activo: true })]]) });
    const vencida = await s4.fetch('/api/auth/session', bearer(tokenDe()));
    assert.equal(vencida.status, 401);
    assert.equal((await vencida.json()).codigo, 'SESSION_REAUTH_REQUIRED');
    const s5 = await start(t, { pool: fakePool([[/FROM usuarios u\s+LEFT JOIN suministros s/, () => filaIdentidad({ rol: 'admin' })]]) });
    assert.equal((await s5.fetch('/api/auth/session', bearer(tokenDe()))).status, 401);
    // Sesión vigente: usuario con suministro obtiene sus datos; admin no pasa por session
    assert.equal((await s.fetch('/api/auth/session', bearer(tokenDe()))).status, 200);
    const s6 = await start(t, { pool: fakePool([[/FROM usuarios u\s+LEFT JOIN suministros s/, () => filaIdentidad({ rol: 'admin', id_suministro: null, numero_suministro: null })]]) });
    assert.equal((await s6.fetch('/api/auth/session', bearer(tokenDe({ id_usuario: 7, rol: 'admin', token_use: 'access', mfa_version: 0, amr: ['pwd'] })))).status, 403);
});

test('Login conserva validaciones, scrypt y claims del monolito', async t => {
    const pool = fakePool([
        [/FROM suministros s\s+JOIN usuarios u/, () => ({ rows: [{ id_usuario: 7, correo: 'u@example.invalid', clave_hash: hashFixture(CLAVE),
            rol: 'usuario', activo: true, mfa_version: 0, mfa_activo: false, id_suministro: 3, numero_suministro: '900000007' }], rowCount: 1 })],
        [/FROM usuarios u\s+LEFT JOIN suministros s/, () => filaIdentidad()]
    ]);
    const s = await start(t, { pool });
    assert.equal((await s.fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero_suministro: '90000000', password: CLAVE }) })).status, 400);
    assert.equal((await s.fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero_suministro: '900000007', password: 'Incorrecta1' }) })).status, 401);
    const respuesta = await s.fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero_suministro: '900000007', password: CLAVE }) });
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    const datos = await respuesta.json();
    assert.equal(datos.estado, 'ok');
    assert.equal(datos.usuario.id_usuario, 7);
    assert.equal(datos.suministro.numero_suministro, '900000007');
    const claims = jwt.verify(datos.token, AUTH_SECRET);
    assert.equal(claims.exp - claims.iat, 28800);
    assert.equal(claims.token_use, 'access');
    assert.equal(claims.mfa_version, 0);
    assert.deepEqual(claims.amr, ['pwd']);
    assert.equal(claims.numero_suministro, '900000007');
    // Cuenta desactivada: 403 antes de validar clave (paridad con monolito)
    const s2 = await start(t, { pool: fakePool([[/FROM suministros s\s+JOIN usuarios u/, () => ({ rows: [{ id_usuario: 7, correo: 'u@example.invalid',
        clave_hash: hashFixture(CLAVE), rol: 'usuario', activo: false, mfa_version: 0, mfa_activo: false,
        id_suministro: 3, numero_suministro: '900000007' }], rowCount: 1 })]]) });
    assert.equal((await s2.fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero_suministro: '900000007', password: CLAVE }) })).status, 403);
});

test('Contrato interno de introspección: identidad vigente sin secretos', async t => {
    const s = await start(t, { pool: fakePool(POOL_IDENTIDAD) });
    const introspector = createIntrospector(configuration({ AUTH_INTROSPECTION_URL: s.url, AUTH_INTERNAL_SECRET: INTROSPECT_SECRET }));
    const identidadObtenida = await introspector(tokenDe());
    assert.deepEqual(identidadObtenida, { id_usuario: 7, id_suministro: 3, numero_suministro: '900000007',
        rol: 'usuario', mfa_version: 0, mfa_activo: false });
    const sinFirma = await s.fetch(PATH, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(sinFirma.status, 401);
    const firmado = await s.fetch(PATH, introspectRequest({ version: 1, token: tokenDe() }));
    const cuerpo = await firmado.json();
    assert.equal(firmado.status, 200);
    assert.equal(cuerpo.vigente, true);
    assert.equal(JSON.stringify(cuerpo).includes('clave_hash'), false);
    assert.equal(JSON.stringify(cuerpo).includes('correo'), false);
    // Identidad para rol admin: suministro nulo, no errores
    const s2 = await start(t, { pool: fakePool([[/FROM usuarios u\s+LEFT JOIN suministros s/,
        () => filaIdentidad({ rol: 'admin', id_suministro: null, numero_suministro: null })]]) });
    const admin = await createIntrospector(configuration({ AUTH_INTROSPECTION_URL: s2.url, AUTH_INTERNAL_SECRET: INTROSPECT_SECRET }))(tokenDe({ id_usuario: 7, rol: 'admin', token_use: 'access', mfa_version: 0, amr: ['pwd'] }));
    assert.equal(admin.rol, 'admin');
    assert.equal(admin.id_suministro, null);
});

test('Introspección fail-closed: firma, replay, vencimiento, token inválido y estados de cuenta', async t => {
    const token = tokenDe();
    const s = await start(t, { pool: fakePool(POOL_IDENTIDAD) });
    const introspector = createIntrospector(configuration({ AUTH_INTROSPECTION_URL: s.url, AUTH_INTERNAL_SECRET: INTROSPECT_SECRET }));
    // Clave equivocada
    assert.equal(await createIntrospector(configuration({ AUTH_INTROSPECTION_URL: s.url, AUTH_INTERNAL_SECRET: crypto.randomBytes(32).toString('hex') }))(token), null);
    // Cuerpo alterado después de firmar
    const alterada = introspectRequest({ version: 1, token });
    alterada.body = JSON.stringify({ version: 1, token: 'manipulado' });
    assert.equal(await introspector(alterada.body), null);
    // Replay: mismo nonce/timestamp/firma
    const repetida = introspectRequest({ version: 1, token });
    const primera = await s.fetch(PATH, repetida); assert.equal(primera.status, 200);
    assert.equal((await s.fetch(PATH, repetida)).status, 409);
    // Timestamp vencido
    const vieja = { method: 'POST', body: JSON.stringify({ version: 1, token }), headers: (() => {
        const timestamp = String(Date.now() - 60000), nonce = crypto.randomUUID();
        return { 'Content-Type': 'application/json', 'X-Hidro-Time': timestamp, 'X-Hidro-Nonce': nonce,
            'X-Hidro-Signature': signature(INTROSPECT_SECRET, timestamp, nonce, JSON.stringify({ version: 1, token })) };
    })() };
    assert.equal((await s.fetch(PATH, vieja)).status, 401);
    // Token firmado pero inválido: 200 vigente:false motivo sesion; cliente -> null
    const invalido = await s.fetch(PATH, introspectRequest({ version: 1, token: 'basura' }));
    assert.equal(invalido.status, 200);
    assert.equal((await invalido.json()).motivo, 'sesion');
    assert.equal(await introspector('basura'), null);
    // Estados de cuenta tras releer PostgreSQL
    const estados = [['desconocido', () => ({ rows: [], rowCount: 0 })], ['inactivo', () => filaIdentidad({ activo: false })],
        ['sesion', () => filaIdentidad({ mfa_version: 9, mfa_activo: true })]];
    for (const [motivo, respuesta] of estados) {
        const sEstado = await start(t, { pool: fakePool([[/FROM usuarios u\s+LEFT JOIN suministros s/, respuesta]]) });
        const r = await sEstado.fetch(PATH, introspectRequest({ version: 1, token }));
        assert.equal(r.status, 200);
        assert.equal((await r.json()).motivo, motivo);
        assert.equal(await createIntrospector(configuration({ AUTH_INTROSPECTION_URL: sEstado.url, AUTH_INTERNAL_SECRET: INTROSPECT_SECRET }))(token), null);
    }
    // Fallo de base de datos: 503 y fail-closed
    const roto = fakePool([[/FROM usuarios u\s+LEFT JOIN suministros s/, () => { throw Error('db-fixture'); }]]);
    const sRoto = await start(t, { pool: roto });
    assert.equal((await sRoto.fetch(PATH, introspectRequest({ version: 1, token }))).status, 503);
    // Cuerpos inválidos firmados: 400 y 413
    assert.equal((await s.fetch(PATH, introspectRequest({ version: 2, token }))).status, 400);
    assert.equal((await s.fetch(PATH, introspectRequest({ version: 1, token: 'x'.repeat(5000) }))).status, 413);
});

test('Revocación administrativa conserva respuestas y activa hooks tras el UPDATE', async t => {
    const hooks = { eventos: [], cerrarSocketsSuministro: id => hooks.eventos.push(['suministro', id]),
        cerrarSocketsUsuario: (id, motivo) => hooks.eventos.push(['usuario', id, motivo]), emitirPerfil: id => hooks.eventos.push(['perfil', id]) };
    // id 99 = administrador; el resto de identidades sigue siendo usuario corriente
    const pool = fakePool([
        [/FROM usuarios u\s+LEFT JOIN suministros s/, (sql, params) => filaIdentidad(params[0] === 99 ? { id_usuario: 99, rol: 'admin', id_suministro: null, numero_suministro: null } : {})],
        [/UPDATE usuarios SET activo/, () => ({ rows: [{ id_usuario: 8, correo: 'otro@example.invalid', rol: 'usuario', fecha_registro: new Date(), activo: false }], rowCount: 1 })],
        [/SELECT id_suministro FROM suministros WHERE id_usuario/, () => ({ rows: [{ id_suministro: 4 }], rowCount: 1 })]
    ]);
    const s = await start(t, { pool, hooks });
    const admin = tokenDe({ id_usuario: 99, rol: 'admin', token_use: 'access', mfa_version: 0, amr: ['pwd'] });
    const r = await s.fetch('/api/admin/usuarios/8/estado', { ...bearer(admin), method: 'PATCH',
        headers: { ...bearer(admin).headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: false }) });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).usuario.activo, false);
    assert.deepEqual(hooks.eventos, [['suministro', 4], ['usuario', 8, 'desactivada']]);
    // Autodesactivación prohibida; activo inválido; id inválido
    assert.equal((await s.fetch('/api/admin/usuarios/99/estado', { method: 'PATCH', headers: { ...bearer(admin).headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: false }) })).status, 409);
    assert.equal((await s.fetch('/api/admin/usuarios/8/estado', { method: 'PATCH', headers: { ...bearer(admin).headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: 'si' }) })).status, 400);
    assert.equal((await s.fetch('/api/admin/usuarios/abc/estado', { method: 'PATCH', headers: { ...bearer(admin).headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: false }) })).status, 404);
    // Usuario sin rol admin: 403
    assert.equal((await s.fetch('/api/admin/usuarios/8/estado', { ...bearer(tokenDe()), method: 'PATCH',
        headers: { ...bearer(tokenDe()).headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: false }) })).status, 403);
    // Ubicación de suministro (propietario Auth de la ubicación)
    const poolUbicacion = fakePool([
        [/FROM usuarios u\s+LEFT JOIN suministros s/, (sql, params) => filaIdentidad(params[0] === 99 ? { id_usuario: 99, rol: 'admin', id_suministro: null, numero_suministro: null } : {})],
        [/UPDATE suministros SET distrito/, () => ({ rows: [{ id_suministro: 3, numero_suministro: '900000007', distrito: 'Comas', zona: 'Zona A' }], rowCount: 1 })]
    ]);
    const s2 = await start(t, { pool: poolUbicacion, hooks });
    const ok = await s2.fetch('/api/admin/suministros/3/ubicacion', { method: 'PATCH',
        headers: { ...bearer(admin).headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ distrito: 'Comas', zona: 'Zona A' }) });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).suministro.zona, 'Zona A');
    assert.deepEqual(hooks.eventos.filter(e => e[0] === 'perfil'), [['perfil', 3]]);
    assert.equal((await s2.fetch('/api/admin/suministros/3/ubicacion', { method: 'PATCH',
        headers: { ...bearer(admin).headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ distrito: 'x'.repeat(101) }) })).status, 400);
});

test('Salud del proceso: /live y /ready comprueban esquema y permisos', async t => {
    const s = await start(t, { pool: fakePool([[/SELECT 1 FROM/, () => ({ rows: [], rowCount: 0 })]]) });
    assert.equal((await s.fetch('/live')).status, 200);
    const ready = await s.fetch('/ready');
    assert.equal(ready.status, 200);
    assert.equal((await ready.json()).auth_contract, 'hidro-auth-2fa-v2');
    const s2 = await start(t, { pool: fakePool([[/SELECT 1 FROM usuarios/, () => { throw Error('permiso denegado'); }]]) });
    assert.equal((await s2.fetch('/ready')).status, 503);
    assert.equal((await s2.fetch('/live')).status, 200);
});

test('Configuración fail-closed del proceso y del cliente interno', () => {
    assert.throws(() => fromEnvironment({ DATABASE_URL: 'postgres://127.0.0.1/x' }), /AUTH_TOKEN_SECRET/);
    assert.throws(() => fromEnvironment({ DATABASE_URL: 'postgres://127.0.0.1/x', AUTH_TOKEN_SECRET: 'corta' }), /AUTH_TOKEN_SECRET/);
    assert.throws(() => fromEnvironment({ AUTH_TOKEN_SECRET: AUTH_SECRET, PORT: 'no-numero' }), /PORT/);
    // Contrato del cliente interno
    for (const env of [
        { AUTH_INTROSPECTION_URL: 'http://external.invalid', NODE_ENV: 'production' },
        { AUTH_INTROSPECTION_URL: 'https://usuario:clave@example.invalid' },
        { AUTH_INTROSPECTION_URL: 'https://example.invalid/ruta' },
        { AUTH_INTROSPECTION_URL: 'https://example.invalid', AUTH_TOKEN_SECRET: INTROSPECT_SECRET }
    ]) assert.throws(() => configuration({ AUTH_INTERNAL_SECRET: INTROSPECT_SECRET, ...env }));
    const local = configuration({ AUTH_INTROSPECTION_URL: 'http://127.0.0.1:3100', AUTH_INTERNAL_SECRET: INTROSPECT_SECRET, NODE_ENV: 'test' });
    assert.equal(local.url, 'http://127.0.0.1:3100');
    assert.equal(key('a'.repeat(32)), 'a'.repeat(32));
    assert.throws(() => key('corta'));
});

test('Sin AUTH_TOKEN_SECRET: rutas protegidas 401 sin derribar el proceso', async t => {
    const service = createService({ pool: fakePool(POOL_IDENTIDAD), env: { NODE_ENV: 'test' } });
    const server = http.createServer(service.app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const url = 'http://127.0.0.1:' + server.address().port;
    assert.equal((await fetch(url + '/api/auth/session')).status, 401);
    assert.equal((await fetch(url + '/api/auth/session', bearer(tokenDe()))).status, 401);
    assert.equal((await fetch(url + '/live')).status, 200);
    // Capacidades siguen respondiendo (el secreto solo afecta rutas firmadas/JWT)
    assert.equal((await fetch(url + '/api/auth/capabilities')).status, 200);
});

test('Cliente de introspección: un intento, sin redirecciones y respuesta acotada', async t => {
    let llamadas = 0;
    const introspector = createIntrospector({ url: 'http://127.0.0.1', secret: INTROSPECT_SECRET }, {
        fetchImpl: async () => { llamadas++; throw Error('caida-fixture'); } });
    assert.equal(await introspector(tokenDe()), null);
    assert.equal(llamadas, 1);
    // 302 no se sigue; respuesta excesiva se descarta
    for (const respuesta of [new Response(null, { status: 302 }), new Response('x'.repeat(2048), { status: 200 }),
        new Response('no-json', { status: 200 }), new Response(JSON.stringify({ version: 1, vigente: true, identidad: { id_usuario: 'x', rol: 'usuario' } }), { status: 200 })]) {
        const i2 = createIntrospector({ url: 'http://127.0.0.1', secret: INTROSPECT_SECRET }, { fetchImpl: async () => respuesta });
        assert.equal(await i2(tokenDe()), null);
    }
    // Cuerpos válidos pero identidad sin rol permitido
    assert.equal(await createIntrospector({ url: 'http://127.0.0.1', secret: INTROSPECT_SECRET },
        { fetchImpl: async () => new Response(JSON.stringify({ version: 1, vigente: true, identidad: identidad({ id_usuario: 7, rol: 'invitado' }) }), { status: 200 }) })(tokenDe()), null);
    assert.deepEqual(identidad({ id_usuario: 7, rol: 'usuario', mfa_version: '3', mfa_activo: true, id_suministro: undefined, numero_suministro: undefined }),
        { id_usuario: 7, id_suministro: null, numero_suministro: null, rol: 'usuario', mfa_version: 3, mfa_activo: true });
});

test('Capacidades y rutas degradadas: registro cerrado y recuperación deshabilitada', async t => {
    const s = await start(t, { pool: fakePool(POOL_IDENTIDAD) });
    const cap = await s.fetch('/api/auth/capabilities');
    assert.equal(cap.status, 200);
    const datosCap = await cap.json();
    assert.equal(datosCap.auth_contract, 'hidro-auth-2fa-v2');
    assert.equal(datosCap.verificacion_correo_obligatoria, true);
    // Registro deshabilitado en este entorno de prueba: 503 sin crear datos
    assert.equal((await s.fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json',
        'X-Hidro-Auth-Contract': 'otp-outbox-v1' }, body: JSON.stringify({ solicitud_id: crypto.randomUUID() }) })).status, 503);
    // Recuperación sin configuración: capabilities disponible:false
    const pwr = await s.fetch('/api/auth/password-recovery/capabilities');
    assert.equal((await pwr.json()).disponible, false);
    // 2FA sin material TOTP: 503 conservando el mensaje del monolito
    const setup = await s.fetch('/api/auth/2fa/setup', { ...bearer(tokenDe()), method: 'POST',
        headers: { ...bearer(tokenDe()).headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: CLAVE }) });
    assert.equal(setup.status, 503);
});
