'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { nuevaBase, sql } = require('./email-schema.cjs');
const { crearRegistroCorreo } = require('../email-registration');
const { crearProcesadorOutbox } = require('../email-outbox');
const { crearRemitente } = require('../resend-mail');

async function iniciar({ autoDrain = true } = {}) {
    const { pool: db, connection } = await nuevaBase('api');
    await db.query(sql('init.sql'));
    const authSecret = crypto.randomBytes(32).toString('hex');
    Object.assign(process.env, { DATABASE_URL: '', DB_HOST: connection.host, DB_PORT: String(connection.port),
        POSTGRES_DB: connection.database, POSTGRES_USER: connection.user, POSTGRES_PASSWORD: connection.password,
        AUTH_TOKEN_SECRET: authSecret, EMAIL_OTP_SECRET: crypto.randomBytes(32).toString('hex'),
        EMAIL_OUTBOX_KEY: crypto.randomBytes(32).toString('base64'), RESEND_API_KEY: 'fixture-provider-key', RESEND_FROM: 'correo@example.invalid', NODE_ENV: 'test' });
    const originalFetch = global.fetch;
    const mensajes = [];
    let proveedorFalla = false;
    const fixtureFetch = async (url, opciones) => {
        if (url !== 'https://api.resend.com/emails') throw new Error('Destino inesperado en el adaptador de pruebas.');
        if (proveedorFalla) return Response.json({ message: 'fixture-sensitive-provider-error' }, { status: 403 });
        const body = JSON.parse(opciones.body);
        mensajes.push({ correo: body.to[0], codigo: body.text.match(/: (\d{6})/)[1] });
        return Response.json({ id: crypto.randomUUID() });
    };
    // Barrera del harness: incluso una regresión de envío desde la API queda simulada.
    global.fetch=(url,options)=>url==='https://api.resend.com/emails' ? fixtureFetch(url,options) : originalFetch(url,options);
    const backend = require('../server');
    const worker = crearProcesadorOutbox({pool:db,key:Buffer.from(process.env.EMAIL_OUTBOX_KEY,'base64'),
        enviarCodigo:crearRemitente({apiKey:'fixture-provider-key'},{fetchImpl:fixtureFetch,maxAttempts:1})});
    async function drain() {
        for(let i=0;i<50;i++) { const r=await worker.procesarUno(); if(r.estado==='vacio')return; }
        throw new Error('Demasiados trabajos en fixture.');
    }
    await new Promise(resolve => backend.httpServer.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${backend.httpServer.address().port}`;
    let ip = 1;
    async function request(ruta, body, status, fixedIP) {
        const res = await originalFetch(base + '/api/auth/' + (['register','resend-verification'].includes(ruta)?'otp/':'') + ruta, { method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Hidro-Auth-Contract':'otp-outbox-v1', 'X-Forwarded-For': fixedIP || `192.0.2.${ip++}` },
            body: JSON.stringify(ruta==='register' && body && body.solicitud_id===undefined ? {...body,solicitud_id:crypto.randomUUID()} : body) });
        const data = await res.json();
        if(autoDrain && res.status===202) await drain();
        if (status !== undefined) assert.equal(res.status, status, `${ruta}: ${JSON.stringify(data)}`);
        assert.equal(JSON.stringify(data).includes('codigo_hash'), false);
        return { data, res };
    }
    const password = 'FixtureEmail123';
    const registro = (n, correo = `cliente${n}@example.invalid`) => ({ correo, numero_suministro: String(900000000+n), password });
    const codigo = correo => mensajes.filter(m => m.correo === correo).at(-1).codigo;
    const verificar = (id, codigo) => ({ registro_id: id, codigo });
    async function adelantarEnvios() {
        await db.query("UPDATE registros_correo_envios SET enviado_en=enviado_en-INTERVAL '61 seconds'");
    }
    return { ...backend, db, connection, base, request, worker, drain, registro, codigo, verificar, mensajes, adelantarEnvios,
        setProveedorFalla: value => { proveedorFalla = value; },
        async close() {
            global.fetch=originalFetch;
            await new Promise(resolve => backend.io.close(resolve));
            await backend.pool.end(); await db.end();
        } };
}

async function main() {
    const ctx = await iniciar();
    const { db, request, registro, codigo, verificar, mensajes, adelantarEnvios } = ctx;
    try {
        await assert.rejects(crearRegistroCorreo({ pool: db }).registrar(registro(1)), { status: 503 });
        for (const body of [{}, { ...registro(1), correo: 'incorrecto' }, { ...registro(1), password: 'corta' },
            { ...registro(1), password: '12345678' }, { ...registro(1), numero_suministro: 'abc' }]) {
            await request('register', body, 400);
        }
        const cuenta = registro(1, 'normalizado@example.invalid');
        const { data: p, res } = await request('register', { ...cuenta, correo: ' Normalizado@Example.Invalid ' }, 202);
        assert.equal(res.headers.get('cache-control'), 'no-store');
        assert.equal(mensajes.length, 1);
        assert.equal((await db.query('SELECT count(*)::int AS n FROM usuarios')).rows[0].n, 0);
        const pendiente = (await db.query('SELECT * FROM registros_correo_pendientes WHERE id=$1', [p.registro_id])).rows[0];
        assert.notEqual(pendiente.codigo_hash, codigo(cuenta.correo));
        assert.match(pendiente.clave_hash, /^scrypt\$/);
        assert.equal(JSON.stringify(p).includes(codigo(cuenta.correo)), false);
        await request('login', { numero_suministro: cuenta.numero_suministro, password: cuenta.password }, 401);
        await request('verify-email', verificar(crypto.randomUUID(), codigo(cuenta.correo)), 400);
        await request('verify-email', verificar(p.registro_id, 'abc'), 400);
        const duplicados = await Promise.all([201,400].map(() => request('verify-email', verificar(p.registro_id, codigo(cuenta.correo)), undefined)));
        assert.deepEqual(duplicados.map(r => r.res.status).sort(), [201,400]);
        assert.equal((await db.query('SELECT count(*)::int AS n FROM usuarios WHERE correo_verificado_en IS NOT NULL')).rows[0].n, 1);
        const consumido = (await db.query('SELECT * FROM registros_correo_pendientes WHERE id=$1', [p.registro_id])).rows[0];
        assert.ok(consumido.consumido_en); assert.equal(consumido.clave_hash, '');
        await request('login', { numero_suministro: cuenta.numero_suministro, password: cuenta.password }, 200);
        await adelantarEnvios();
        await request('register', cuenta, 409);
        console.log('OK: validación, normalización, no hay cuenta/JWT antes de verificar, confirmación atómica y login.');

        const c2 = registro(2);
        const { data: p2 } = await request('register', c2, 202);
        const anterior = codigo(c2.correo);
        const limite = await request('resend-verification', { registro_id: p2.registro_id }, 429);
        assert.ok(Number(limite.res.headers.get('retry-after')) > 0);
        await db.query("UPDATE registros_correo_pendientes SET codigo_vence_en=NOW()-INTERVAL '1 second' WHERE id=$1", [p2.registro_id]);
        await request('verify-email', verificar(p2.registro_id, anterior), 400);
        await adelantarEnvios();
        await request('resend-verification', { registro_id: p2.registro_id }, 202);
        assert.notEqual(codigo(c2.correo), anterior);
        // El reenvío nunca repite el código anterior.
        const { coincideCodigo } = require('../email-otp');
        const actual = (await db.query('SELECT * FROM registros_correo_pendientes WHERE id=$1', [p2.registro_id])).rows[0];
        assert.ok(coincideCodigo(p2.registro_id, codigo(c2.correo), actual.codigo_hash, process.env.EMAIL_OTP_SECRET));
        let erroneo = (Number(codigo(c2.correo)) === 0 ? '000001' : '000000');
        await request('verify-email', verificar(p2.registro_id, erroneo), 400);
        await adelantarEnvios();
        await request('resend-verification', { registro_id: p2.registro_id }, 202);
        assert.equal((await db.query('SELECT intentos FROM registros_correo_pendientes WHERE id=$1', [p2.registro_id])).rows[0].intentos, 1);
        erroneo = Number(codigo(c2.correo)) === 0 ? '000001' : '000000';
        await Promise.all(Array.from({ length: 4 }, () => request('verify-email', verificar(p2.registro_id, erroneo), 400)));
        await request('verify-email', verificar(p2.registro_id, codigo(c2.correo)), 400);
        await request('resend-verification', { registro_id: p2.registro_id }, 400);
        assert.equal((await db.query('SELECT intentos FROM registros_correo_pendientes WHERE id=$1', [p2.registro_id])).rows[0].intentos, 5);
        await adelantarEnvios();
        await request('register', c2, 429);
        await request('register', { ...c2, correo: 'otro@example.invalid' }, 429);
        console.log('OK: vencimiento, cooldown, reenvío sin reiniciar intentos, cinco fallos concurrentes y límite horario por correo/suministro.');

        ctx.setProveedorFalla(true);
        const {data: fallida} = await request('register', registro(3), 202);
        assert.equal((await db.query("SELECT count(*)::int AS n FROM registros_correo_pendientes WHERE correo=$1", [registro(3).correo])).rows[0].n, 1);
        assert.equal((await request('verification-status',{registro_id:fallida.registro_id},200)).data.estado_envio,'fallido');
        await adelantarEnvios();
        ctx.setProveedorFalla(false);
        const { data: p3 } = await request('register', registro(3), 202);
        await adelantarEnvios();
        const { data: nuevo } = await request('register', registro(3), 202);
        await request('verify-email', verificar(p3.registro_id, codigo(registro(3).correo)), 400);
        await db.query("UPDATE registros_correo_pendientes SET vence_en=NOW()-INTERVAL '1 second' WHERE id=$1", [nuevo.registro_id]);
        await request('resend-verification', { registro_id: nuevo.registro_id }, 400);
        await request('verify-email', verificar(nuevo.registro_id, codigo(registro(3).correo)), 400);
        console.log('OK: fallo permanente conserva solicitud y estado fallido; registro sustituido y registro vencido son rechazados.');

        const c4 = registro(4), c5 = { ...registro(5), numero_suministro: registro(4).numero_suministro };
        const { data: p4 } = await request('register', c4, 202);
        await adelantarEnvios();
        const { data: p5 } = await request('register', c5, 202);
        await request('verify-email', verificar(p4.registro_id, codigo(c4.correo)), 201);
        await request('verify-email', verificar(p5.registro_id, codigo(c5.correo)), 409);
        assert.equal((await db.query('SELECT count(*)::int AS n FROM usuarios WHERE correo=$1', [c5.correo])).rows[0].n, 0);
        await db.query('UPDATE usuarios SET correo_verificado_en=NULL WHERE correo=$1', [c4.correo]);
        await request('login', { numero_suministro: c4.numero_suministro, password: c4.password }, 200);
        await db.query('UPDATE usuarios SET activo=FALSE WHERE correo=$1', [c4.correo]);
        await request('login', { numero_suministro: c4.numero_suministro, password: c4.password }, 403);
        for (let n=0; n<30; n++) await request('verify-email', {}, 400, '198.51.100.1');
        await request('verify-email', {}, 429, '198.51.100.1');
        console.log('OK: conflicto de suministro no deja usuario huérfano; cuenta previa y bloqueo administrativo conservados; límite por IP.');
    } finally { await ctx.close(); }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { iniciar };
