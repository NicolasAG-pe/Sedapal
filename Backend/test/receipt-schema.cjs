'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { nuevaBase, sql } = require('./email-schema.cjs');
async function fixture() {
    const { pool } = await nuevaBase('receipt_schema');
    await pool.query(sql('init.sql'));
    // Emula el esquema previo solo en esta base recién creada, sin borrar datos.
    await pool.query(`ALTER TABLE recibos DROP CONSTRAINT uq_recibos_suministro_periodo;
        ALTER TABLE pagos DROP CONSTRAINT uq_pagos_recibo`);
    const { rows: [u] } = await pool.query("INSERT INTO usuarios(correo,clave_hash) VALUES ('receipt-schema@example.invalid','fixture-hash') RETURNING id_usuario");
    const { rows: [s] } = await pool.query("INSERT INTO suministros(numero_suministro,id_usuario) VALUES ('960000001',$1) RETURNING id_suministro", [u.id_usuario]);
    const add = async (period = 'fixture', state = 'Emitido') => (await pool.query(`INSERT INTO recibos
        (id_suministro,periodo,fecha_emision,fecha_vencimiento,monto,consumo_m3,estado)
        VALUES ($1,$2,CURRENT_DATE,CURRENT_DATE,10,1,$3) RETURNING id_recibo`, [s.id_suministro, period, state])).rows[0].id_recibo;
    const pay = (id, amount = 10) => pool.query("INSERT INTO pagos(id_recibo,monto,metodo) VALUES ($1,$2,'fixture')", [id, amount]);
    async function apply() {
        const client = await pool.connect();
        try { await client.query(sql('migrations/005_integridad_recibos.sql')); }
        catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
    }
    async function snapshot() {
        const state = {};
        const { rows } = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
        for (const { tablename } of rows) {
            assert.match(tablename, /^[a-z_][a-z0-9_]*$/);
            state[tablename] = (await pool.query(`SELECT to_jsonb(t) AS row FROM public.${tablename} t ORDER BY to_jsonb(t)::text`)).rows;
        }
        return state;
    }
    const constraints = async () => (await pool.query(`SELECT conname FROM pg_constraint WHERE
        conrelid IN ('public.recibos'::regclass,'public.pagos'::regclass)
        AND conname IN ('uq_recibos_suministro_periodo','uq_pagos_recibo') ORDER BY conname`)).rows;
    return { pool, add, pay, apply, snapshot, constraints };
}

test('005 conserva todas las tablas y FKs; repetición y UNIQUE directas', async () => {
    const f = await fixture();
    try {
        const receipt = await f.add('pagado', 'Pagado'); await f.pay(receipt);
        const before = await f.snapshot();
        const fks = async () => (await f.pool.query(`SELECT conname,pg_get_constraintdef(oid) AS def
            FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace ORDER BY conname`)).rows;
        const previousFKs = await fks();
        const sequences = async () => (await f.pool.query(`SELECT sequencename,last_value FROM pg_sequences
            WHERE schemaname='public' ORDER BY sequencename`)).rows;
        const previousSequences = await sequences();
        await f.apply(); await f.apply();
        assert.deepEqual(await f.snapshot(), before); assert.deepEqual(await fks(), previousFKs);
        assert.deepEqual(await sequences(), previousSequences);
        assert.equal((await f.constraints()).length, 2);
        await assert.rejects(f.add('pagado'), { code: '23505', constraint: 'uq_recibos_suministro_periodo' });
        await assert.rejects(f.pay(receipt), { code: '23505', constraint: 'uq_pagos_recibo' });
        assert.deepEqual(await f.snapshot(), before);
    } finally { await f.pool.end(); }
});

for (const kind of ['recibos duplicados', 'pagos duplicados', 'monto inconsistente', 'anulado con pago', 'pagado sin pago']) {
    test('005 cancela sin cambiar datos ni constraints: ' + kind, async () => {
        const f = await fixture();
        try {
            const id = await f.add('fixture', ['recibos duplicados', 'anulado con pago'].includes(kind) ? 'Anulado' : 'Pagado');
            if (kind === 'recibos duplicados') await f.add();
            else if (kind !== 'pagado sin pago') await f.pay(id, kind === 'monto inconsistente' ? 5 : 10);
            if (kind === 'pagos duplicados') await f.pay(id);
            const before = await f.snapshot();
            await assert.rejects(f.apply(), { code: '23514' });
            assert.deepEqual(await f.snapshot(), before); assert.deepEqual(await f.constraints(), []);
            const checks = await f.pool.query(fs.readFileSync(path.join(__dirname, '../../Base-de-Datos/checks/005_integridad_recibos.sql'), 'utf8'));
            assert.ok(checks.rows.some(r => Number(r.grupos) > 0));
            assert.deepEqual(await f.snapshot(), before);
        } finally { await f.pool.end(); }
    });
}

test('005 cancela por drift de constraint o nombre de índice ocupado', async () => {
    const f = await fixture();
    try {
        await f.pool.query('ALTER TABLE recibos ADD CONSTRAINT uq_recibos_suministro_periodo UNIQUE (id_recibo)');
        await assert.rejects(f.apply(), { code: '23514' });
        // Solo la constraint de prueba, sin filas borradas.
        await f.pool.query('ALTER TABLE recibos DROP CONSTRAINT uq_recibos_suministro_periodo');
        await f.pool.query('CREATE INDEX uq_recibos_suministro_periodo ON recibos(periodo)');
        await assert.rejects(f.apply(), { code: '23514' });
        assert.deepEqual(await f.constraints(), []);
    } finally { await f.pool.end(); }
});

test('005 lock_timeout aborta y permite aplicar después de liberar escritor', async () => {
    const f = await fixture(), locker = await f.pool.connect();
    try {
        await locker.query('BEGIN');
        await locker.query("UPDATE suministros SET zona='fixture' WHERE numero_suministro='960000001'");
        await assert.rejects(f.apply(), { code: '55P03' });
        assert.deepEqual(await f.constraints(), []);
        await locker.query('ROLLBACK');
        await f.apply(); assert.equal((await f.constraints()).length, 2);
    } finally { await locker.query('ROLLBACK'); locker.release(); await f.pool.end(); }
});

test('005 exige las tres FKs de negocio validadas, sin recrearlas ni cambiar datos', async () => {
    const f = await fixture();
    try {
        await f.add(); const before = await f.snapshot();
        await f.pool.query('ALTER TABLE pagos DROP CONSTRAINT fk_pago_recibo');
        await assert.rejects(f.apply(), { code: '23514' });
        assert.deepEqual(await f.constraints(), []); assert.deepEqual(await f.snapshot(), before);
        await f.pool.query(`ALTER TABLE pagos ADD CONSTRAINT fk_pago_recibo
            FOREIGN KEY(id_recibo) REFERENCES recibos(id_recibo) NOT VALID`);
        await assert.rejects(f.apply(), { code: '23514' });
        assert.deepEqual(await f.constraints(), []); assert.deepEqual(await f.snapshot(), before);
    } finally { await f.pool.end(); }
});
