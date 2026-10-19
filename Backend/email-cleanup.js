'use strict';

const MIN_RETENTION_HOURS = 24;
const MAX_BATCH_SIZE = 1000;
// Espacio independiente de los advisory locks (7401) del registro.
const CLEANUP_LOCK = [7402, 1];

function validarOpciones({ retentionHours = MIN_RETENTION_HOURS, batchSize = 500, dryRun = true } = {}) {
    if (!Number.isInteger(retentionHours) || retentionHours < MIN_RETENTION_HOURS || retentionHours > 8760 ||
        !Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE || typeof dryRun !== 'boolean') {
        throw new Error('Opciones de retención inválidas.');
    }
    return { retentionHours, batchSize, dryRun };
}

// Nunca usar creado_en ni codigo_vence_en como sustituto de vence_en.
// Los guardas adicionales conservan datos anómalos que aún podrían limitar envíos.
const elegible = `p.vence_en < $1::timestamptz
    AND p.codigo_vence_en <= $2::timestamptz
    AND NOT EXISTS (SELECT 1 FROM public.registros_correo_envios e
        WHERE e.registro_id=p.id AND e.enviado_en >= $2::timestamptz-INTERVAL '1 hour')`;

async function comprobarDependencias(client) {
    const { rows } = await client.query(`SELECT
        conrelid='public.registros_correo_envios'::regclass AS es_historial,
        confrelid='public.registros_correo_pendientes'::regclass AS es_pendiente,
        conkey=ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
            WHERE attrelid=c.conrelid AND attname='registro_id' AND NOT attisdropped)] AS origen_correcto,
        confkey=ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
            WHERE attrelid=c.confrelid AND attname='id' AND NOT attisdropped)] AS destino_correcto,
        confdeltype, convalidated
        FROM pg_catalog.pg_constraint c WHERE contype='f'
        AND confrelid IN ('public.registros_correo_pendientes'::regclass,
            'public.registros_correo_envios'::regclass)`);
    if (rows.length !== 1 || !rows[0].es_historial || !rows[0].es_pendiente ||
        !rows[0].origen_correcto || !rows[0].destino_correcto || rows[0].confdeltype !== 'c' || !rows[0].convalidated) {
        throw new Error('Dependencias de verificación inesperadas; limpieza cancelada.');
    }
}

async function limpiarRegistrosCorreo(pool, options) {
    const { retentionHours, batchSize, dryRun } = validarOpciones(options);
    const result = { estado: dryRun ? 'simulacion' : 'completado', retencion_horas: retentionHours,
        lote_maximo: batchSize, candidatos: 0, envios_asociados: 0, eliminados: 0, envios_eliminados: 0 };
    const client = await pool.connect();
    try {
        await client.query(dryRun ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' :
            'BEGIN ISOLATION LEVEL READ COMMITTED');
        await client.query("SET LOCAL statement_timeout = '10s'");
        await client.query("SET LOCAL lock_timeout = '1s'");
        await client.query('SET LOCAL search_path = pg_catalog');
        if (!dryRun) {
            const { rows: [lock] } = await client.query(
                'SELECT pg_try_advisory_xact_lock($1::int,$2::int) AS adquirido', CLEANUP_LOCK);
            if (!lock.adquirido) {
                await client.query('COMMIT');
                return { ...result, estado: 'ocupado' };
            }
            // Compatible con DML normal; impide cambiar FKs durante la comprobación/borrado.
            await client.query(`LOCK TABLE public.registros_correo_pendientes,
                public.registros_correo_envios IN ROW EXCLUSIVE MODE`);
        }
        await comprobarDependencias(client);
        const { rows: [time] } = await client.query(`SELECT t AS referencia,
            t-make_interval(hours=>$1) AS corte FROM (SELECT clock_timestamp() AS t) reloj`, [retentionHours]);
        const params = [time.corte, time.referencia];
        const { rows } = await client.query(`SELECT p.id FROM public.registros_correo_pendientes p
            WHERE ${elegible} ORDER BY p.vence_en,p.id LIMIT $3
            ${dryRun ? '' : 'FOR UPDATE OF p SKIP LOCKED'}`, [...params, batchSize]);
        // Nueva sentencia READ COMMITTED después de tomar los locks: ve envíos que
        // se confirmaron entre el snapshot de selección y la adquisición del lock.
        // FOR UPDATE impide insertar nuevas referencias al padre mientras se borra.
        const { rows: eligible } = await client.query(`SELECT p.id,
            (SELECT count(*)::int FROM public.registros_correo_envios e WHERE e.registro_id=p.id) AS envios
            FROM public.registros_correo_pendientes p WHERE p.id=ANY($3::uuid[]) AND ${elegible}`,
        [...params, rows.map(row => row.id)]);
        result.candidatos = eligible.length;
        result.envios_asociados = eligible.reduce((total, row) => total + row.envios, 0);
        if (!dryRun && eligible.length) {
            const deleted = await client.query(`DELETE FROM public.registros_correo_pendientes
                WHERE id=ANY($1::uuid[])`, [eligible.map(row => row.id)]);
            if (deleted.rowCount !== eligible.length) throw new Error('Lote de limpieza inconsistente.');
            result.eliminados = deleted.rowCount;
            result.envios_eliminados = result.envios_asociados;
        }
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally { client.release(); }
}

module.exports = { limpiarRegistrosCorreo, validarOpciones, MIN_RETENTION_HOURS, MAX_BATCH_SIZE, CLEANUP_LOCK };
