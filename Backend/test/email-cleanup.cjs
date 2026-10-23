'use strict';
// Solo bases nuevas con datos sintéticos; no lee .env ni toca bases anteriores.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { nuevaBase, sql } = require('./email-schema.cjs');
const { limpiarRegistrosCorreo, CLEANUP_LOCK } = require('../email-cleanup');
const { crearRegistroCorreo } = require('../email-registration');
let fase = 'preparacion';
const ok = text => { console.log('OK: ' + text); fase = text; };

async function main() {
    const { pool } = await nuevaBase('cleanup');
    let sequence = 0;
    async function fixture(label, { seconds = -90000, codeSeconds = seconds,
        sends = [seconds], invalidado = false, consumido = false } = {}) {
        const id = crypto.randomUUID(), correo = label + '@example.invalid';
        const supply = String(910000000 + ++sequence);
        await pool.query(`INSERT INTO registros_correo_pendientes
            (id,correo,numero_suministro,clave_hash,codigo_hash,vence_en,codigo_vence_en,invalidado,consumido_en)
            VALUES ($1,$2,$3,'fixture-hash',$4,clock_timestamp()+make_interval(secs=>$5),
                clock_timestamp()+make_interval(secs=>$6),$7,CASE WHEN $8 THEN clock_timestamp() ELSE NULL END)`,
        [id, correo, supply, 'a'.repeat(64), seconds, codeSeconds, invalidado, consumido]);
        for (const age of sends) await pool.query(`INSERT INTO registros_correo_envios(id,registro_id,enviado_en)
            VALUES ($1,$2,clock_timestamp()+make_interval(secs=>$3))`, [crypto.randomUUID(), id, age]);
        return { id, correo, numero_suministro: supply };
    }
    async function snapshot(excludeEmail = false) {
        const { rows: tables } = await pool.query(`SELECT tablename FROM pg_tables
            WHERE schemaname='public' ORDER BY tablename`);
        const state = {};
        for (const { tablename } of tables) {
            if (excludeEmail && ['registros_correo_pendientes', 'registros_correo_envios', 'correo_outbox'].includes(tablename)) continue;
            assert.match(tablename, /^[a-z_]+$/);
            state[tablename] = (await pool.query(`SELECT to_jsonb(t) AS dato FROM public."${tablename}" t ORDER BY to_jsonb(t)::text`)).rows;
        }
        return state;
    }
    const apply = options => limpiarRegistrosCorreo(pool, { ...options, dryRun: false });
    try {
        await pool.query(sql('init.sql'));
        await pool.query(sql('migrations/004_retencion_correo.sql'));
        await pool.query(sql('migrations/004_retencion_correo.sql'));
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='public' AND indexname='idx_registro_vencimiento'")).rows[0].n, 1);
        const { rows: [u] } = await pool.query("INSERT INTO usuarios(correo,clave_hash) VALUES ('negocio@example.invalid','fixture-hash') RETURNING id_usuario");
        const { rows: [s] } = await pool.query("INSERT INTO suministros(numero_suministro,id_usuario) VALUES ('920000001',$1) RETURNING id_suministro", [u.id_usuario]);
        const { rows: [r] } = await pool.query(`INSERT INTO recibos(id_suministro,periodo,fecha_emision,fecha_vencimiento,monto,consumo_m3,estado)
            VALUES ($1,'fixture',CURRENT_DATE,CURRENT_DATE,10,1,'Pagado') RETURNING id_recibo`, [s.id_suministro]);
        await pool.query("INSERT INTO pagos(id_recibo,monto,metodo) VALUES ($1,10,'fixture')", [r.id_recibo]);
        const business = await snapshot(true);
        ok('Base nueva, índice y migración repetible; fixtures de usuario, suministro, recibo y pago');

        const protectedRows = [
            await fixture('vigente', { seconds: 3600, codeSeconds: 300, sends: [0] }),
            await fixture('solo-otp-vencido', { seconds: 1800, codeSeconds: -60, sends: [-600] }),
            await fixture('vencida-reciente', { seconds: -3600 }),
            await fixture('dentro-24h', { seconds: -86400 + 60 }),
            await fixture('otp-anomalo-vigente', { seconds: -172800, codeSeconds: 3600 }),
            await fixture('envio-futuro', { seconds: -172800, sends: [3600] })
        ];
        const rateLimited = await fixture('envios-recientes', { seconds: -172800, sends: [-1800, -1200, -600] });
        protectedRows.push(rateLimited);
        await fixture('fuera-24h', { seconds: -86400 - 60 });
        await fixture('invalidada-antigua', { seconds: -172800, invalidado: true });
        await fixture('consumida-antigua', { seconds: -172800, consumido: true });
        await fixture('sin-envios-antigua', { seconds: -176400, sends: [] });
        const before = await snapshot();
        const preview = await limpiarRegistrosCorreo(pool);
        assert.equal(preview.estado, 'simulacion');
        assert.equal(preview.candidatos, 4); assert.equal(preview.envios_asociados, 3);
        assert.equal(preview.eliminados, 0);
        assert.deepEqual(await snapshot(), before);
        const first = await apply({ batchSize: 2 }), second = await apply({ batchSize: 2 });
        assert.equal(first.eliminados, 2); assert.equal(second.eliminados, 2);
        assert.equal(first.envios_eliminados + second.envios_eliminados, 3);
        assert.equal((await apply()).eliminados, 0);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM registros_correo_pendientes WHERE id=ANY($1::uuid[])', [protectedRows.map(row => row.id)])).rows[0].n, protectedRows.length);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM registros_correo_envios e LEFT JOIN registros_correo_pendientes p ON p.id=e.registro_id WHERE p.id IS NULL')).rows[0].n, 0);
        ok('Simulación sin cambios; frontera 24h, estados, cascada, lotes e idempotencia aprobados');

        await fixture('retencion-ampliada', { seconds: -108000 });
        assert.equal((await apply({ retentionHours: 48 })).eliminados, 0);
        assert.equal((await apply()).eliminados, 1);
        const betweenSnapshots = await fixture('envio-entre-snapshots');
        let changed = false;
        const concurrentPool = { async connect() {
            const client = await pool.connect();
            return { release: () => client.release(), async query(text, values) {
                const result = await client.query(text, values);
                if (!changed && text.includes('FOR UPDATE OF p SKIP LOCKED')) {
                    changed = true;
                    await pool.query('UPDATE registros_correo_envios SET enviado_en=clock_timestamp() WHERE registro_id=$1', [betweenSnapshots.id]);
                }
                return result;
            } };
        } };
        assert.equal((await limpiarRegistrosCorreo(concurrentPool, { dryRun: false })).eliminados, 0);
        assert.ok(changed);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM registros_correo_pendientes WHERE id=$1', [betweenSnapshots.id])).rows[0].n, 1);
        const blocked = await fixture('fila-bloqueada');
        const locker = await pool.connect();
        try {
            await locker.query('BEGIN');
            await locker.query('SELECT id FROM registros_correo_pendientes WHERE id=$1 FOR UPDATE', [blocked.id]);
            assert.equal((await apply()).eliminados, 0);
            await locker.query('COMMIT');
            assert.equal((await apply()).eliminados, 1);
            await locker.query('BEGIN');
            await locker.query('SELECT pg_advisory_xact_lock($1::int,$2::int)', CLEANUP_LOCK);
            assert.equal((await apply()).estado, 'ocupado');
            await locker.query('COMMIT');
        } finally { await locker.query('ROLLBACK'); locker.release(); }
        ok('Retención ampliada, revalidación de envíos, filas bloqueadas y exclusión entre mantenimientos aprobadas');

        for (let n = 0; n < 20; n++) await fixture('concurrente-' + n);
        const concurrent = await Promise.all(Array.from({ length: 6 }, () => apply({ batchSize: 3 })));
        let deleted = concurrent.reduce((n, r) => n + r.eliminados, 0);
        let history = concurrent.reduce((n, r) => n + r.envios_eliminados, 0);
        for (let n = 0; n < 8; n++) {
            const batch = await apply({ batchSize: 3 });
            assert.ok(batch.eliminados <= 3);
            deleted += batch.eliminados; history += batch.envios_eliminados;
        }
        assert.equal(deleted, 20); assert.equal(history, 20);
        assert.equal((await apply()).eliminados, 0);
        assert.deepEqual(await snapshot(true), business);
        ok('Seis ejecuciones simultáneas, conteos exactos y todas las tablas de negocio intactas');

        let releaseSend, enteredSend, receivedCode;
        const entered = new Promise(resolve => { enteredSend = resolve; });
        const gate = new Promise(resolve => { releaseSend = resolve; });
        const key = crypto.randomBytes(32);
        const service = crearRegistroCorreo({ pool, key, from: 'fixture@example.invalid', secreto: crypto.randomBytes(32).toString('hex'),
            generarClaveHash: () => 'fixture-hash' });
        const worker = require('../email-outbox').crearProcesadorOutbox({pool,key,enviarCodigo: async ({mensaje}) => {
            receivedCode = JSON.parse(mensaje).text.match(/: (\d{6})/)[1]; enteredSend(); await gate;
            return {id:'fixture-accepted'};
        }});
        const password = crypto.randomBytes(24).toString('hex');
        await assert.rejects(service.registrar({ ...rateLimited, password }), { status: 429 });
        await fixture('antigua-durante-registro');
        const pending = await service.registrar({ correo: 'en-curso@example.invalid', numero_suministro: '930000001', password });
        const processing=worker.procesarUno();
        try {
            await entered;
            assert.equal((await apply()).eliminados, 1);
        } finally { releaseSend(); }
        assert.equal((await processing).estado,'aceptado');
        const [verified, cleanup] = await Promise.all([
            service.verificar({ registro_id: pending.registro_id, codigo: receivedCode }), apply()
        ]);
        assert.equal(verified.estado, 'ok'); assert.equal(cleanup.eliminados, 0);
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM usuarios WHERE correo='en-curso@example.invalid' AND correo_verificado_en IS NOT NULL")).rows[0].n, 1);
        ok('Límite de tres envíos conservado y registro/confirmación en curso compatibles con limpieza');

        const rollbackRow = await fixture('rollback');
        const state = await snapshot();
        await pool.query(`CREATE FUNCTION public.fixture_impedir_borrado() RETURNS trigger LANGUAGE plpgsql
            AS $$ BEGIN RAISE EXCEPTION 'fixture rollback'; END $$;
            CREATE TRIGGER fixture_impedir_borrado AFTER DELETE ON registros_correo_pendientes
            FOR EACH ROW EXECUTE FUNCTION public.fixture_impedir_borrado()`);
        await assert.rejects(apply());
        assert.deepEqual(await snapshot(), state);
        // Dependencia inesperada creada solo en esta base nueva: debe cancelar todo.
        await pool.query('CREATE TABLE fixture_dependencia(id UUID REFERENCES registros_correo_pendientes(id) ON DELETE CASCADE)');
        await pool.query('INSERT INTO fixture_dependencia VALUES ($1)', [rollbackRow.id]);
        await assert.rejects(apply(), { message: 'Dependencias de verificación inesperadas; limpieza cancelada.' });
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM fixture_dependencia')).rows[0].n, 1);
        ok('Errores revierten el lote; dependencias inesperadas cancelan sin borrar datos');
    } finally { await pool.end(); }
}

if (require.main === module) main().catch(() => {
    console.error('Falló la prueba aislada de retención después de: ' + fase); process.exitCode = 1;
});
module.exports = { main };
