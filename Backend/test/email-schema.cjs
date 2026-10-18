'use strict';
// Base sintética nueva por ejecución; no lee .env ni elimina bases existentes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Pool } = require('pg');

async function nuevaBase(prefijo = 'schema') {
    const port = Number(process.env.HIDRO_EMAIL_TEST_DB_PORT);
    assert.ok(Number.isInteger(port) && port > 0, 'HIDRO_EMAIL_TEST_DB_PORT es obligatorio.');
    const connection = { host: '127.0.0.1', port, database: 'hm_email_test',
        user: 'hm_fixture', password: 'fixture-only-not-production' };
    const parent = new Pool(connection);
    const database = `hm_email_${prefijo}_${crypto.randomBytes(8).toString('hex')}`;
    try {
        assert.equal((await parent.query('SELECT current_database() AS db')).rows[0].db, 'hm_email_test');
        await parent.query(`CREATE DATABASE "${database}"`);
    } finally { await parent.end(); }
    return { pool: new Pool({ ...connection, database }), connection: { ...connection, database } };
}

const sql = file => fs.readFileSync(path.join(__dirname, '../../Base-de-Datos', file), 'utf8');

async function main() {
    const { pool } = await nuevaBase();
    try {
        await pool.query(sql('init.sql'));
        await pool.query(sql('migrations/003_verificacion_correo.sql'));
        await pool.query(sql('migrations/003_verificacion_correo.sql'));
        const id = crypto.randomUUID();
        const insert = `INSERT INTO registros_correo_pendientes
            (id,correo,numero_suministro,clave_hash,codigo_hash,codigo_vence_en)
            VALUES ($1,'schema@example.invalid',$2,'fixture-hash',$3,NOW()+INTERVAL '10 minutes')`;
        await pool.query(insert, [id, '900000001', 'a'.repeat(64)]);
        await assert.rejects(pool.query(insert, [crypto.randomUUID(), 'abc', 'a'.repeat(64)]), { code: '23514' });
        await assert.rejects(pool.query(insert, [crypto.randomUUID(), '900000002', 'hash-invalido']), { code: '23514' });
        await assert.rejects(pool.query('UPDATE registros_correo_pendientes SET intentos=6 WHERE id=$1', [id]), { code: '23514' });
        await assert.rejects(pool.query('INSERT INTO registros_correo_envios(id,registro_id) VALUES ($1,$2)',
            [crypto.randomUUID(), crypto.randomUUID()]), { code: '23503' });
        console.log('OK: esquema inicial, migración repetible, restricciones OTP y referencia de envíos.');
    } finally { await pool.end(); }
    const { pool: legacy } = await nuevaBase('legacy');
    try {
        await legacy.query(`CREATE TABLE usuarios (id_usuario BIGSERIAL PRIMARY KEY, correo VARCHAR(120));
            INSERT INTO usuarios(correo) VALUES ('legacy@example.invalid')`);
        await legacy.query(sql('migrations/003_verificacion_correo.sql'));
        await legacy.query(sql('migrations/003_verificacion_correo.sql'));
        const result = await legacy.query('SELECT correo,correo_verificado_en FROM usuarios');
        assert.deepEqual(result.rows, [{ correo: 'legacy@example.invalid', correo_verificado_en: null }]);
        console.log('OK: migración aditiva conserva cuenta previa sin atribuirle verificación.');
    } finally { await legacy.end(); }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { nuevaBase, sql };
