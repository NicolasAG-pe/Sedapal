'use strict';
// Cada ejecución crea una base nueva local; todos los destinatarios/proveedores son sintéticos.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { nuevaBase, sql } = require('./email-schema.cjs');
const { crearCodigo } = require('../email-otp');
const { encolarCorreo, cancelarEventos, crearProcesadorOutbox } = require('../email-outbox');
const { descifrarMensaje } = require('../outbox-crypto');

test('Outbox PostgreSQL: atomicidad, recuperación, concurrencia, privacidad y límites', async t => {
    const { pool } = await nuevaBase('outbox');
    const key = crypto.randomBytes(32), secret = crypto.randomBytes(32).toString('hex');
    let sequence = 0, calls = [], failure;
    const send = async request => {
        calls.push(request);
        if (failure) throw Object.assign(new Error('fixture proveedor privado'), failure);
        return { id: 'synthetic-provider-id' };
    };
    const worker = (proveedor = 'resend') => crearProcesadorOutbox({ pool, key, enviarCodigo: send, proveedor });
    async function fixture({ commit = true, proveedor = 'resend' } = {}) {
        const client = await pool.connect(), id = crypto.randomUUID();
        const otp = crearCodigo(id,secret), correo = `outbox${++sequence}@example.invalid`;
        try {
            await client.query('BEGIN');
            await client.query(`INSERT INTO registros_correo_pendientes(id,correo,numero_suministro,clave_hash,codigo_hash,codigo_vence_en)
                VALUES ($1,$2,$3,'fixture-hash',$4,clock_timestamp())`, [id,correo,String(940000000+sequence),otp.hash]);
            const event = await encolarCorreo(client, { registroId:id,correo,codigo:otp.codigo,hash:otp.hash,from:'fixture@example.invalid',key,proveedor });
            if (commit) await client.query('COMMIT');
            else {
                assert.equal((await worker().procesarUno()).estado,'vacio');
                await client.query('ROLLBACK');
            }
            return { id,event,otp };
        } finally { await client.query('ROLLBACK'); client.release(); }
    }
    const row = async id => (await pool.query('SELECT * FROM correo_outbox WHERE id=$1',[id])).rows[0];
    const ready = id => pool.query("UPDATE correo_outbox SET disponible_en=clock_timestamp()-INTERVAL '1 second' WHERE id=$1",[id]);
    try {
        await pool.query(sql('init.sql'));
        const before = (await pool.query('SELECT count(*) FROM usuarios')).rows;
        await pool.query(sql('migrations/006_correo_outbox.sql'));
        await pool.query(sql('migrations/006_correo_outbox.sql'));
        assert.deepEqual((await pool.query('SELECT count(*) FROM usuarios')).rows,before);
        await t.test('Rollback y transacción abierta invisibles; commit habilita evento', async () => {
            const rolled = await fixture({commit:false});
            assert.equal(await row(rolled.event),undefined); assert.equal(calls.length,0);
            const f = await fixture(); assert.equal((await row(f.event)).estado,'pendiente');
            assert.equal((await worker().procesarUno()).estado,'aceptado');
            assert.equal(calls.length,1); assert.equal((await row(f.event)).payload,null);
            const p = (await pool.query('SELECT codigo_vence_en FROM registros_correo_pendientes WHERE id=$1',[f.id])).rows[0];
            assert.ok(p.codigo_vence_en.getTime() > Date.now()+290000);
        });
        await t.test('Fallo transitorio persiste, backoff y nuevo trabajador recupera mismo mensaje', async () => {
            const f = await fixture(); failure={tipo:'transitorio',retryAfter:20};
            assert.equal((await worker().procesarUno()).estado,'reintento');
            const r = await row(f.event); assert.ok(r.disponible_en.getTime()>Date.now()+19000);
            assert.equal((await worker().procesarUno()).estado,'vacio');
            await ready(f.event); failure=undefined;
            assert.equal((await worker().procesarUno()).estado,'aceptado');
            assert.equal(calls.at(-1).mensaje,calls.at(-2).mensaje);
            assert.equal(calls.at(-1).envioId,calls.at(-2).envioId);
            assert.equal((await row(f.event)).codigo_vence_en.getTime(),r.codigo_vence_en.getTime());
        });
        await t.test('Dos trabajadores coordinan una sola llamada para cada evento', async () => {
            const f = await fixture(), n = calls.length;
            const results = await Promise.all([worker().procesarUno(),worker().procesarUno()]);
            assert.equal(results.filter(r=>r.estado==='aceptado').length,1);
            assert.equal(calls.length,n+1); assert.equal((await row(f.event)).intentos,1);
        });
        await t.test('Crash tras aceptación, lease recuperable y finalización obsoleta rechazada', async () => {
            const f = await fixture(), oldWorker=worker(), old=await oldWorker.tomar();
            await send({mensaje:descifrarMensaje(old.payload,key,old.id,old.registro_id),envioId:old.id});
            await pool.query("UPDATE correo_outbox SET bloqueado_hasta=clock_timestamp()-INTERVAL '1 second' WHERE id=$1",[f.event]);
            assert.equal((await worker().procesarUno()).estado,'aceptado');
            assert.equal(await oldWorker.finalizar(old,{id:'late-worker'}),'sin_lease');
            assert.equal(calls.at(-1).mensaje,calls.at(-2).mensaje);
            assert.equal(calls.at(-1).envioId,calls.at(-2).envioId);
            assert.equal((await row(f.event)).hubo_ambiguedad,true);
        });
        await t.test('Ambigüedad limitada a cinco intentos con el mismo OTP y retirada del payload', async () => {
            const f = await fixture(); failure={tipo:'ambiguo'};
            const start=calls.length;
            for(let n=0;n<5;n++) { await ready(f.event); assert.equal((await worker().procesarUno()).estado,n===4?'ambiguo':'reintento'); }
            failure=undefined;
            assert.equal(new Set(calls.slice(start).map(c=>c.mensaje)).size,1);
            assert.equal(new Set(calls.slice(start).map(c=>c.envioId)).size,1);
            const r=await row(f.event); assert.equal(r.payload,null); assert.equal(r.intentos,5);
            assert.equal((await worker().procesarUno()).estado,'vacio');
        });
        await t.test('Clave incorrecta conserva trabajo; corrupción autenticada termina sin enviar', async () => {
            const f=await fixture(), n=calls.length;
            const wrong=crearProcesadorOutbox({pool,key:crypto.randomBytes(32),enviarCodigo:send});
            assert.equal((await wrong.procesarUno()).estado,'clave_incompatible');
            assert.equal((await row(f.event)).intentos,0);
            await pool.query("UPDATE correo_outbox SET payload=set_byte(payload,30,get_byte(payload,30)#1) WHERE id=$1",[f.event]);
            assert.equal((await worker().procesarUno()).estado,'fallido'); assert.equal(calls.length,n);
        });
        await t.test('Cola demorada no envía OTP vencido; cancelación y errores permanentes purgan payload', async () => {
            const f=await fixture(), n=calls.length;
            await pool.query("UPDATE registros_correo_pendientes SET vence_en=clock_timestamp()+INTERVAL '4 minutes' WHERE id=$1",[f.id]);
            assert.equal((await worker().procesarUno()).estado,'caducado'); assert.equal(calls.length,n);
            const c=await fixture(); await cancelarEventos(pool,c.id);
            assert.equal((await row(c.event)).payload,null); assert.equal((await worker().procesarUno()).estado,'vacio');
            const p=await fixture(); failure={tipo:'permanente'};
            assert.equal((await worker().procesarUno()).estado,'fallido'); failure=undefined;
            assert.equal((await row(p.event)).payload,null);
        });
        await t.test('Diez minutos en cola no consumen los cinco minutos del primer intento',async()=>{
            const f=await fixture();
            await pool.query("UPDATE registros_correo_pendientes SET codigo_vence_en=clock_timestamp()-INTERVAL '10 minutes' WHERE id=$1",[f.id]);
            await pool.query("UPDATE correo_outbox SET creado_en=clock_timestamp()-INTERVAL '10 minutes' WHERE id=$1",[f.event]);
            assert.equal((await worker().procesarUno()).estado,'aceptado');
            const r=await row(f.event);assert.ok(r.codigo_vence_en.getTime()>Date.now()+290000);
            assert.equal(r.codigo_hash,f.otp.hash);assert.match(calls.at(-1).mensaje,new RegExp(f.otp.codigo));
        });
        await t.test('Gmail congela proveedor cifrado; Resend no consume ni modifica su evento', async () => {
            const f = await fixture({ proveedor: 'gmail' }), n = calls.length;
            assert.equal((await worker().procesarUno()).estado, 'proveedor_incompatible');
            assert.equal(calls.length, n); assert.equal((await row(f.event)).intentos, 0);
            assert.equal((await worker('gmail').procesarUno()).estado, 'aceptado');
            assert.equal(calls.length, n + 1); assert.equal(JSON.parse(calls.at(-1).mensaje).hidro_mail_v, undefined);
        });
        await t.test('Gmail: timeout ambiguo terminal, payload purgado y nunca reenviado', async () => {
            const f = await fixture({ proveedor: 'gmail' }), n = calls.length; failure = { tipo: 'ambiguo' };
            assert.equal((await worker('gmail').procesarUno()).estado, 'ambiguo'); failure = undefined;
            assert.equal((await row(f.event)).intentos, 1); assert.equal((await row(f.event)).payload, null);
            assert.equal((await row(f.event)).hubo_ambiguedad, true);
            assert.equal((await worker('gmail').procesarUno()).estado, 'vacio'); assert.equal(calls.length, n + 1);
        });
        await t.test('Gmail: crash tras envío y lease vencido no causan una segunda llamada', async () => {
            const f = await fixture({ proveedor: 'gmail' }), w = worker('gmail'), old = await w.tomar();
            await send({ mensaje: 'fixture accepted before crash', envioId: old.id }); const n = calls.length;
            await pool.query("UPDATE correo_outbox SET bloqueado_hasta=clock_timestamp()-INTERVAL '1 second' WHERE id=$1", [f.event]);
            assert.equal((await worker().procesarUno()).estado, 'proveedor_incompatible');
            assert.equal((await worker('gmail').procesarUno()).estado, 'ambiguo');
            assert.equal(calls.length, n); assert.equal((await row(f.event)).payload, null);
            assert.equal(await w.finalizar(old, { id: 'late' }), 'sin_lease');
        });
        await t.test('Gmail reintenta únicamente rechazo transitorio explícito, conserva UUID/OTP', async () => {
            const f = await fixture({ proveedor: 'gmail' }), n = calls.length; failure = { tipo: 'transitorio', retryAfter: 60 };
            assert.equal((await worker('gmail').procesarUno()).estado, 'reintento'); failure = undefined;
            await ready(f.event); assert.equal((await worker('gmail').procesarUno()).estado, 'aceptado');
            assert.equal(calls.length, n + 2); assert.equal(calls.at(-1).mensaje, calls.at(-2).mensaje);
            assert.equal(calls.at(-1).envioId, calls.at(-2).envioId);
        });
        await t.test('Integridad de estados, FK e índices; sin transacciones/conexiones abandonadas', async () => {
            const f=await fixture();
            await assert.rejects(pool.query("UPDATE correo_outbox SET estado='aceptado' WHERE id=$1",[f.event]),{code:'23514'});
            await assert.rejects(pool.query("UPDATE correo_outbox SET lease_token=$2 WHERE id=$1",[f.event,crypto.randomUUID()]),{code:'23514'});
            await assert.rejects(pool.query("INSERT INTO correo_outbox(id,codigo_hash,payload,clave_id) VALUES ($1,$2,$3,$4)",
                [crypto.randomUUID(),'a'.repeat(64),Buffer.alloc(50),'b'.repeat(16)]),{code:'23503'});
            const r=await row(f.event); assert.equal(r.payload.includes(Buffer.from(f.otp.codigo)),false);
            assert.equal((await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND state LIKE 'idle in transaction%'")).rows[0].n,0);
            assert.equal((await pool.query("SELECT count(*)::int AS n FROM pg_indexes WHERE indexname IN ('idx_correo_outbox_disponible','idx_correo_outbox_lease')")).rows[0].n,2);
            assert.equal(pool.waitingCount,0);
        });
    } finally { await pool.end(); }
});
