'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { nuevaBase, sql } = require('./email-schema.cjs');
const { ERROR } = require('../maintenance/email-cleanup.cjs');
const exec = promisify(execFile);

async function main() {
    const { pool, connection: c } = await nuevaBase('cleanup_cli');
    const url = new URL('postgres://127.0.0.1');
    url.port = String(c.port); url.username = c.user; url.password = c.password; url.pathname = c.database;
    const env = { EMAIL_MAINTENANCE_DATABASE_URL: url.toString(), EMAIL_MAINTENANCE_EXPECTED_DATABASE: c.database };
    const cli = path.resolve(__dirname, '../maintenance/email-cleanup.cjs');
    async function run(args, variables = env, status = 0) {
        let result;
        try { result = { ...await exec(process.execPath, [cli, ...args], { env: variables, timeout: 20000 }), status: 0 }; }
        catch (error) { result = { status: error.code, stdout: error.stdout || '', stderr: error.stderr || '' }; }
        assert.equal(result.status, status);
        for (const secret of [url.toString(), c.password, c.database, 'cli@example.invalid']) {
            assert.equal((result.stdout + result.stderr).includes(secret), false);
        }
        if (status !== 0) { assert.equal(result.stdout, ''); assert.equal(result.stderr, ERROR + '\n'); return; }
        assert.equal(result.stderr, '');
        const data = JSON.parse(result.stdout);
        assert.deepEqual(Object.keys(data).sort(), ['estado','retencion_horas','lote_maximo','candidatos',
            'envios_asociados','eliminados','envios_eliminados'].sort());
        return data;
    }
    async function count(table) {
        assert.ok(['registros_correo_pendientes', 'registros_correo_envios'].includes(table));
        return (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
    }
    try {
        await pool.query(sql('init.sql'));
        for (const seconds of [-90000, 3600]) {
            const id = crypto.randomUUID();
            await pool.query(`INSERT INTO registros_correo_pendientes
                (id,correo,numero_suministro,clave_hash,codigo_hash,vence_en,codigo_vence_en)
                VALUES ($1,'cli@example.invalid','940000001','fixture-hash',$2,
                    clock_timestamp()+make_interval(secs=>$3),clock_timestamp()+make_interval(secs=>$3))`, [id, 'a'.repeat(64), seconds]);
            await pool.query(`INSERT INTO registros_correo_envios(id,registro_id,enviado_en)
                VALUES ($1,$2,clock_timestamp()+make_interval(secs=>$3))`, [crypto.randomUUID(), id, seconds]);
        }
        const preview = await run([]);
        assert.equal(preview.estado, 'simulacion'); assert.equal(preview.candidatos, 1);
        assert.equal(preview.eliminados, 0);
        assert.equal((await run(['--dry-run'])).eliminados, 0);
        assert.equal(await count('registros_correo_pendientes'), 2);
        assert.equal(await count('registros_correo_envios'), 2);
        await run(['--apply'], { DATABASE_URL: url.toString() }, 1);
        await run(['--apply'], { ...env, EMAIL_MAINTENANCE_EXPECTED_DATABASE: 'destino_incorrecto' }, 1);
        assert.equal(await count('registros_correo_pendientes'), 2);
        const applied = await run(['--apply', '--batch-size', '1']);
        assert.equal(applied.eliminados, 1); assert.equal(applied.envios_eliminados, 1);
        assert.equal(await count('registros_correo_pendientes'), 1);
        assert.equal(await count('registros_correo_envios'), 1);
        assert.equal((await run(['--apply'])).eliminados, 0);
        console.log('OK: CLI real, simulación predeterminada, destino obligatorio, lote único, cascada e idempotencia.');

        for (let n = 0; n < 4; n++) {
            const id = crypto.randomUUID();
            await pool.query(`INSERT INTO registros_correo_pendientes
                (id,correo,numero_suministro,clave_hash,codigo_hash,vence_en,codigo_vence_en)
                VALUES ($1,'cli@example.invalid','940000001','fixture-hash',$2,
                    clock_timestamp()-INTERVAL '25 hours',clock_timestamp()-INTERVAL '25 hours')`, [id, 'a'.repeat(64)]);
            await pool.query(`INSERT INTO registros_correo_envios(id,registro_id,enviado_en)
                VALUES ($1,$2,clock_timestamp()-INTERVAL '25 hours')`, [crypto.randomUUID(), id]);
        }
        const together = await Promise.all([run(['--apply', '--batch-size', '2']), run(['--apply', '--batch-size', '2'])]);
        const drain = await run(['--apply', '--batch-size', '2']);
        assert.equal(together.reduce((n, r) => n + r.eliminados, drain.eliminados), 4);
        assert.equal(together.reduce((n, r) => n + r.envios_eliminados, drain.envios_eliminados), 4);
        assert.equal(await count('registros_correo_pendientes'), 1);
        assert.equal(await count('registros_correo_envios'), 1);
        console.log('OK: dos procesos CLI simultáneos, lotes acotados y conteos exactos sin duplicados.');

        await pool.query('CREATE TABLE fixture_dependencia_cli(id UUID REFERENCES registros_correo_pendientes(id) ON DELETE CASCADE)');
        await run(['--apply'], env, 1);
        assert.equal(await count('registros_correo_pendientes'), 1);
        assert.equal(await count('registros_correo_envios'), 1);
        console.log('OK: fallo SQL/esquema sin datos privados en stdout/stderr; cancelación sin efectos.');
    } finally { await pool.end(); }
}

if (require.main === module) main().catch(() => {
    console.error('Falló la prueba CLI aislada; no se imprimen conexiones ni datos de fixtures.'); process.exitCode = 1;
});
module.exports = { main };
