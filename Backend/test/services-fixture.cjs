'use strict';
// Se ejecuta dentro de un contenedor del laboratorio mediante services-smoke.cjs.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { descifrarMensaje } = require('../outbox-crypto');
const recovery = require('../password-recovery-crypto');

async function fixture(env = process.env, args = process.argv.slice(2)) {
    const url = new URL(env.DATABASE_URL || env.NOTIFICATIONS_DATABASE_URL);
    assert.equal(env.NODE_ENV, 'test');
    assert.equal(url.hostname, 'db');
    assert.equal(url.pathname, '/hm_micro_lab');
    const db = new Pool({ connectionString: url.toString() });
    const [name, input] = args;
    const data = JSON.parse(input || '{}');
    try {
        const { rows: [target] } = await db.query('SELECT current_database() AS db,current_user AS role');
        assert.equal(target.db, 'hm_micro_lab');
        if (name === 'admin') {
            assert.equal(target.role, 'hm_auth');
            assert.match(data.supply, /^8\d{8}$/);
            const salt = crypto.randomBytes(16).toString('hex');
            const hash = ['scrypt', salt, crypto.scryptSync(data.password, salt, 64).toString('hex')].join('$');
            await db.query(`WITH admin AS (INSERT INTO usuarios(correo,clave_hash,rol,correo_verificado_en)
                VALUES($1,$2,'admin',clock_timestamp()) RETURNING id_usuario)
                INSERT INTO suministros(id_usuario,numero_suministro) SELECT id_usuario,$3 FROM admin`,
                ['admin' + data.supply + '@example.invalid', hash, data.supply]);
            return true;
        }
        if (name === 'otp' || name === 'recovery') {
            assert.equal(target.role, 'hm_auth');
            const { rows: [job] } = name === 'otp' ?
                await db.query(`SELECT o.*,e.registro_id AS request_id FROM correo_outbox o JOIN registros_correo_envios e USING(id)
                    WHERE e.registro_id=$1 ORDER BY o.disponible_en DESC LIMIT 1`, [data.id]) :
                await db.query('SELECT o.*,solicitud_id AS request_id FROM recuperacion_clave_outbox o WHERE solicitud_id=$1', [data.id]);
            if (data.status) return job ? { status: job.estado, stub: /^stub-/.test(job.proveedor_id || ''), cleared: job.payload === null } : null;
            assert.equal(job.estado, 'pendiente');
            const message = name === 'otp' ?
                descifrarMensaje(job.payload, Buffer.from(env.EMAIL_OUTBOX_KEY, 'base64'), job.id, job.request_id) :
                recovery.open(job.payload, Buffer.from(env.PASSWORD_RECOVERY_OUTBOX_KEY, 'base64'), job.id, job.request_id);
            return JSON.parse(message).text.match(/: (\d{6,8})/)[1];
        }
        if (name === 'grants') {
            const { rows: [grant] } = await db.query(`SELECT current_user AS role,
                has_column_privilege(current_user, 'public.usuarios', 'clave_hash', 'SELECT') AS credentials,
                has_column_privilege(current_user, 'public.incidencias', 'foto', 'SELECT') AS photos,
                has_table_privilege(current_user, 'public.recibos', 'UPDATE') AS billing,
                has_table_privilege(current_user, 'public.notificaciones', 'INSERT') AS notices,
                has_table_privilege(current_user, (SELECT oid FROM pg_class WHERE relname='events' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='hm_contract')), 'INSERT') AS publish,
                has_column_privilege(current_user, (SELECT oid FROM pg_class WHERE relname='events' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='hm_contract')), 'delivered_at', 'UPDATE') AS consume`);
            return grant;
        }
        if (name === 'push') {
            assert.equal(target.role, 'hm_notifications');
            const { rows: [result] } = await db.query(`SELECT q.estado, n.push_evento
                FROM push_entregas q JOIN notificaciones n USING(id_notificacion)
                WHERE q.id_dispositivo=$1 AND n.push_recibo=$2 AND q.categoria='recibos'`, [data.installation, data.receipt]);
            return result || null;
        }
        if (name === 'event') {
            assert.equal(target.role, 'hm_realtime');
            const { rows: [result] } = await db.query(`SELECT delivered_at IS NOT NULL AS delivered
                FROM hm_contract.events WHERE kind='recibo:nuevo' AND payload->>'id'=$1`, [String(data.receipt)]);
            return result || null;
        }
        throw Error('Fixture desconocido');
    } finally { await db.end(); }
}
module.exports = { fixture };
