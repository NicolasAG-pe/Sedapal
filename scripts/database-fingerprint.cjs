// Ejecutar dentro del backend: solo SELECT, con transacción de solo lectura.
const { Pool } = require('pg');
const crypto = require('node:crypto');

(async () => {
    const pool = new Pool({ host: process.env.DB_HOST || 'db', port: Number(process.env.DB_PORT || 5432), database: process.env.POSTGRES_DB, user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD });
    const client = await pool.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
        const fingerprints = {};
        for (const { tablename } of tables.rows) {
            const quoted = '"' + tablename.replaceAll('"', '""') + '"';
            const result = await client.query(`SELECT count(*)::int AS count, md5(coalesce(string_agg(hash, '' ORDER BY hash), '')) AS fingerprint FROM (SELECT md5(row_to_json(t)::text) AS hash FROM public.${quoted} t) rows`);
            fingerprints[tablename] = result.rows[0];
        }
        const columns = await client.query("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position");
        const constraints = await client.query("SELECT conrelid::regclass::text AS table_name,conname,convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conrelid::regclass::text,conname");
        const sequences = await client.query("SELECT sequencename,last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename");
        const indexes = await client.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname");
        const schema = crypto.createHash('sha256').update(JSON.stringify([columns.rows, constraints.rows, indexes.rows])).digest('hex');
        await client.query('COMMIT');
        console.log(JSON.stringify({ tables: fingerprints, schema, sequences: sequences.rows }, null, 2));
    } finally {
        client.release();
        await pool.end();
    }
})().catch(() => { console.error('No se pudo obtener la huella de solo lectura de la base.'); process.exitCode = 1; });
