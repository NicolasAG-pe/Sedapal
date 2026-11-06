'use strict';
// DB-01: PostgreSQL 18 NUEVO, fixtures sintéticos, ningún .env ni proveedor real.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { nuevaBase, sql } = require('./email-schema.cjs');
const { crearServicioRecibos } = require('../receipt-transactions');
const marker = '-- Manual, aditiva e idempotente. No activa 2FA ni modifica cuentas existentes.';
function productionSchema(full = false) {
    const init = sql('init.sql');
    assert.equal(init.split(marker).length, 2, 'Marcador del esquema base único obligatorio.');
    const migrations = ['007_usuario_2fa.sql', '008_operaciones_pago.sql',
        ...(full ? ['011_recuperacion_clave.sql', '012_notificaciones_push.sql', '013_seguimiento_incidencias.sql'] : []),
        '014_compatibilidad_operaciones_produccion.sql'];
    return init.split(marker)[0] + migrations.map(name => sql('migrations/' + name)).join('\n');
}
const body = periodo => ({ numero_suministro: '900001111', periodo, fecha_emision: '2026-10-01', fecha_vencimiento: '2026-11-01', monto: 11, consumo_m3: 2 });
const validar = b => ({ numero: b.numero_suministro, periodo: b.periodo, emision: b.fecha_emision, vencimiento: b.fecha_vencimiento, monto: b.monto, consumo: b.consumo_m3 });
async function seed(pool) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = 'scrypt$' + salt + '$' + crypto.scryptSync('FixtureReceipt42', salt, 64).toString('hex');
    await pool.query("INSERT INTO usuarios(correo,clave_hash,rol) VALUES('receipt-user@example.invalid',$1,'usuario'),('receipt-admin@example.invalid',$1,'admin');", [hash]);
    await pool.query("INSERT INTO suministros(numero_suministro,id_usuario) VALUES('900001111',1),('900001112',2)");
}
let serial = 0;
async function receipt(pool) {
    return Number((await pool.query("INSERT INTO recibos(id_suministro,periodo,fecha_emision,fecha_vencimiento,monto,consumo_m3,estado) VALUES(1,$1,'2026-10-01','2026-11-01',10,1,'Pendiente') RETURNING id_recibo", ['fixture-' + ++serial])).rows[0].id_recibo);
}
const snapshot = async (pool, id) => (await pool.query('SELECT to_jsonb(r) AS data FROM recibos r WHERE id_recibo=$1', [id])).rows[0].data;
async function fixture(profile) {
    const context = await nuevaBase(profile === 'lab' ? 'yape_pilot' : 'receipt_prod');
    try {
        await context.pool.query(profile === 'lab' ? sql('init.sql') : productionSchema());
        assert.equal((await context.pool.query("SELECT to_regclass('public.control_piloto_yape') IS NOT NULL AS present")).rows[0].present, profile === 'lab');
        assert.equal((await context.pool.query('SHOW server_version_num')).rows[0].server_version_num.slice(0, 2), '18');
        await seed(context.pool);
        return { ...context, service: crearServicioRecibos({ pool: context.pool, validarRecibo: validar }) };
    } catch (error) { await context.pool.end(); throw error; }
}
async function operation(pool, id, state) {
    const method = state === 'demostrativa' ? 'demostrativo' : state === 'acreditada_proveedor' ? 'proveedor_simulado' : 'yape_manual';
    await pool.query(`INSERT INTO operaciones_pago(id,solicitud_id,id_usuario,id_recibo,monto,metodo,estado,payload_hash,entorno,revisado_por,revisado_en,motivo,proveedor_id)
        VALUES($1,$2,1,$3,10,$4,$5,$6,'simulado',$7,$8,$9,$10)`,
    [crypto.randomUUID(), crypto.randomUUID(), id, method, state, 'a'.repeat(64),
        state === 'verificada_manual' ? 2 : null, state === 'verificada_manual' ? new Date() : null,
        state === 'verificada_manual' ? 'Revisión de fixture sintético' : null,
        state === 'acreditada_proveedor' ? 'fixture-' + crypto.randomUUID() : null]);
}
for (const profile of ['prod', 'lab']) {
    test('DB-T01/02/03/05: matriz de recibos ' + profile, async t => {
        const { pool, service } = await fixture(profile);
        try {
            for (const state of ['sin_operacion', 'legacy', 'Pagado', 'declarada', 'pendiente_verificacion', 'verificada_manual', 'acreditada_proveedor', 'demostrativa', 'rechazada', 'cancelada', 'reembolsada']) {
                await t.test(state, async () => {
                    for (const action of ['editar', 'anular']) {
                        const id = await receipt(pool);
                        if (state === 'legacy') await pool.query("INSERT INTO pagos(id_recibo,monto,metodo) VALUES($1,10,'fixture')", [id]);
                        else if (state === 'Pagado') await pool.query("UPDATE recibos SET estado='Pagado' WHERE id_recibo=$1", [id]);
                        else if (state !== 'sin_operacion') await operation(pool, id, state);
                        const previous = await snapshot(pool, id);
                        const invoke = () => service[action](id, body('edited-' + id));
                        if (['legacy', 'Pagado', 'declarada', 'pendiente_verificacion', 'verificada_manual', 'acreditada_proveedor'].includes(state)) {
                            await assert.rejects(invoke, { status: 409 }); assert.deepEqual(await snapshot(pool, id), previous);
                        } else {
                            await invoke(); const current = await snapshot(pool, id);
                            assert.equal(current.estado, action === 'anular' ? 'Anulado' : 'Pendiente');
                            assert.equal(Number(current.monto), action === 'editar' ? 11 : 10);
                        }
                    }
                });
            }
            if (profile === 'lab') for (const status of ['active', 'disabled', 'expired']) {
                await t.test('piloto ' + status, async () => {
                    for (const action of ['editar', 'anular']) {
                        const id = await receipt(pool);
                        await pool.query(`INSERT INTO control_piloto_yape(singleton,piloto_id,habilitado,ensayo_sintetico,id_recibo,id_usuario,id_admin,qr_hash,monto_maximo,inicio_en,vence_en)
                            VALUES(true,$1,$2,true,$3,1,2,$4,5,clock_timestamp()-interval '2 hours',clock_timestamp()+$5::interval)
                            ON CONFLICT(singleton) DO UPDATE SET piloto_id=EXCLUDED.piloto_id,habilitado=EXCLUDED.habilitado,id_recibo=EXCLUDED.id_recibo,inicio_en=EXCLUDED.inicio_en,vence_en=EXCLUDED.vence_en`,
                        [crypto.randomUUID(), status !== 'disabled', id, 'b'.repeat(64), status === 'expired' ? '-1 second' : '1 hour']);
                        const previous = await snapshot(pool, id);
                        if (status === 'active') { await assert.rejects(() => service[action](id, body('pilot-' + id)), { status: 409 }); assert.deepEqual(await snapshot(pool, id), previous); }
                        else await service[action](id, body('pilot-' + id));
                    }
                });
            }
            await t.test('rollback después de UPDATE exitoso', async () => {
                const id = await receipt(pool), previous = await snapshot(pool, id);
                const wrapped = { connect: async () => {
                    const client = await pool.connect();
                    return { release: error => client.release(error), query: async (...args) => {
                        const result = await client.query(...args);
                        if (/UPDATE public.recibos/.test(args[0])) throw Error('fixture-write-failure');
                        return result;
                    } };
                } };
                const failing = crearServicioRecibos({ pool: wrapped, validarRecibo: validar });
                for (const action of ['editar', 'anular']) {
                    await assert.rejects(() => failing[action](id, body('rollback-' + id)), /fixture-write-failure/);
                    assert.deepEqual(await snapshot(pool, id), previous);
                }
                await service.editar(id, body('recovered-' + id));
            });
            await t.test('error SQL de escritura revierte y no deja transacción abortada', async () => {
                const id = await receipt(pool), previous = await snapshot(pool, id);
                await pool.query(`CREATE FUNCTION hm_fixture_write_error() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic write failure'; END $$;
                    CREATE TRIGGER hm_fixture_write_error AFTER UPDATE ON recibos FOR EACH ROW EXECUTE FUNCTION hm_fixture_write_error()`);
                try {
                    for (const action of ['editar', 'anular']) {
                        await assert.rejects(() => service[action](id, body('sql-fail-' + id)), { code: 'P0001' });
                        assert.deepEqual(await snapshot(pool, id), previous);
                    }
                } finally { await pool.query('DROP TRIGGER hm_fixture_write_error ON recibos'); }
                await service.editar(id, body('sql-recovered-' + id));
            });
            await t.test('ediciones concurrentes comparten unicidad y liberan conexiones', async () => {
                const a = await receipt(pool), b = await receipt(pool);
                const period = 'race-' + a;
                const results = await Promise.allSettled([service.editar(a, body(period)), service.editar(b, body(period))]);
                assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
                assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
                assert.equal((await pool.query('SELECT count(*)::int n FROM recibos WHERE periodo=$1', [period])).rows[0].n, 1);
                assert.equal((await pool.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction'")).rows[0].n, 0);
            });
        } finally { await pool.end(); }
    });
}
for (const table of ['pagos', 'operaciones_pago']) {
    test('DB-T04: tabla obligatoria ausente falla explícitamente: ' + table, async () => {
        const { pool, service } = await fixture('prod');
        try {
            const id = await receipt(pool), previous = await snapshot(pool, id);
            // Solo la base sintética de este caso; conserva filas, no usa DROP/CASCADE.
            await pool.query('ALTER TABLE public.' + table + ' RENAME TO fixture_missing');
            for (const action of ['editar', 'anular']) await assert.rejects(() => service[action](id, body('missing-' + id)), { code: '42P01' });
            assert.deepEqual(await snapshot(pool, id), previous);
            assert.equal((await pool.query('SELECT 1 AS n')).rows[0].n, 1);
        } finally { await pool.end(); }
    });
}
test('DB-T04: permiso denegado sobre piloto presente no equivale a ausencia', async () => {
    const { pool, connection } = await fixture('lab');
    let restricted;
    try {
        const id = await receipt(pool), previous = await snapshot(pool, id);
        const role = 'hm_receipt_' + crypto.randomBytes(8).toString('hex');
        await pool.query('CREATE ROLE ' + role + ' NOLOGIN');
        await pool.query('GRANT USAGE ON SCHEMA public TO ' + role);
        await pool.query('GRANT SELECT,UPDATE ON public.suministros,public.recibos,public.pagos,public.operaciones_pago TO ' + role);
        restricted = new Pool({ ...connection, options: '-c role=' + role });
        const service = crearServicioRecibos({ pool: restricted, validarRecibo: validar });
        for (const action of ['editar', 'anular']) await assert.rejects(() => service[action](id, body('denied-' + id)), { code: '42501' });
        assert.deepEqual(await snapshot(pool, id), previous);
    } finally { if (restricted) await restricted.end(); await pool.end(); }
});
test('DB-T07: API real sin piloto conserva 200/409/400/401/403/404 y errores saneados', async () => {
    const { iniciar } = require('./email-api.cjs');
    const ctx = await iniciar({ schemaSql: productionSchema(true), databasePrefix: 'receipt_prod_http', registrationEnabled: '0', autoDrain: false });
    try {
        await seed(ctx.db);
        const admin = (await ctx.request('login', { numero_suministro: '900001112', password: 'FixtureReceipt42' }, 200)).data.token;
        const user = (await ctx.request('login', { numero_suministro: '900001111', password: 'FixtureReceipt42' }, 200)).data.token;
        let ip = 1;
        const request = async (id, action, token = admin, data = body('http-' + id)) => {
            const r = await fetch(ctx.base + '/api/admin/recibos/' + id + (action === 'anular' ? '/anular' : ''), { method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.' + ip++, ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(data) });
            const json = await r.json();
            assert.doesNotMatch(JSON.stringify(json), /SELECT |INSERT |relation |clave_hash|fixture-write|42P01/);
            return { status: r.status, json };
        };
        for (const action of ['editar', 'anular']) {
            const id = await receipt(ctx.db);
            assert.equal((await request(id, action, '')).status, 401);
            assert.equal((await request(id, action, user)).status, 403);
            assert.equal((await request(999999, action)).status, 404);
            assert.equal((await request(id, action)).status, 200);
            const paid = await receipt(ctx.db);
            await ctx.db.query("UPDATE recibos SET estado='Pagado' WHERE id_recibo=$1", [paid]);
            assert.equal((await request(paid, action)).status, 409);
        }
        const id = await receipt(ctx.db);
        assert.equal((await request(id, 'editar', admin, { ...body('invalid'), monto: -1 })).status, 400);
        const previous = await snapshot(ctx.db, id);
        await ctx.db.query('ALTER TABLE pagos RENAME TO fixture_missing_pagos');
        const failure = await request(id, 'anular');
        assert.equal(failure.status, 500); assert.equal(failure.json.mensaje, 'Error interno del servidor.');
        assert.deepEqual(await snapshot(ctx.db, id), previous);
    } finally { await ctx.close(); }
});

test('DB-T04: fallo de conexión se propaga sin ejecutar operaciones', async () => {
    const failure = Object.assign(new Error('Synthetic connection failure'), { code: '08006' });
    const service = crearServicioRecibos({ pool: { connect: async () => { throw failure; } }, validarRecibo: validar });
    for (const action of ['editar', 'anular']) await assert.rejects(() => service[action](1, body('connection')), error => error === failure);
});
