'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Pool } = require('pg');
const { iniciar } = require('./email-api.cjs');
const { nuevaBase, sql } = require('./email-schema.cjs');
const { crearProcesadorOutbox } = require('../email-outbox');
const { crearCodigo } = require('../email-otp');
const { limpiarRegistrosCorreo } = require('../email-cleanup');

const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn) { const end=Date.now()+10000; while(!await fn()){assert.ok(Date.now()<end,'Espera de fixture excedida');await sleep(10);} }

test('HTTP, trabajador independiente y migración: contrato OTP íntegro', async t => {
    const ctx=await iniciar({autoDrain:false});
    const {db,connection,request,registro,codigo,verificar,mensajes,worker,adelantarEnvios}=ctx;
    const key=Buffer.from(process.env.EMAIL_OUTBOX_KEY,'base64');
    const events=async id=>(await db.query(`SELECT o.* FROM correo_outbox o JOIN registros_correo_envios e ON e.id=o.id
        WHERE e.registro_id=$1 ORDER BY o.creado_en,o.id`,[id])).rows;
    const output=fs.mkdtempSync(path.join(os.tmpdir(),'hidro-outbox-'));
    let childSequence=0;
    function child(mode='--once',delay=0){
        const mailbox=path.join(output,`mail-${++childSequence}.jsonl`);
        const proc=spawn(process.execPath,['--require',path.join(__dirname,'resend-fixture.cjs'),
            path.join(__dirname,'../workers/email-outbox.cjs'),mode],{env:{...process.env,
            EMAIL_WORKER_ENABLED:'1',EMAIL_WORKER_DATABASE_URL:`postgres://hm_fixture:fixture-only-not-production@127.0.0.1:${connection.port}/${connection.database}`,
            EMAIL_WORKER_EXPECTED_DATABASE:connection.database,HIDRO_TEST_MAILBOX:mailbox,HIDRO_TEST_PROVIDER_DELAY_MS:String(delay)},stdio:['ignore','pipe','pipe']});
        let stdout='',stderr='';proc.stdout.on('data',s=>{stdout+=s;});proc.stderr.on('data',s=>{stderr+=s;});
        const stopped=new Promise(resolve=>proc.on('exit',(code,signal)=>resolve({code,signal,stdout,stderr})));
        return {proc,mailbox,stopped};
    }
    function privateOutput(r){assert.equal(r.stderr,'');for(const secret of [process.env.EMAIL_OUTBOX_KEY,process.env.EMAIL_OTP_SECRET,
        process.env.AUTH_TOKEN_SECRET,process.env.RESEND_API_KEY,'@example.invalid','codigo_hash','fixture-sensitive'])assert.equal(r.stdout.includes(secret),false);}
    try {
        await t.test('Fallo diferido en COMMIT no deja solicitud/evento ni permite envío',async()=>{
            await db.query(`CREATE FUNCTION fixture_revertir_outbox() RETURNS trigger LANGUAGE plpgsql AS
                $$ BEGIN RAISE EXCEPTION 'fixture-sensitive-commit'; END $$;
                CREATE CONSTRAINT TRIGGER fixture_revertir_outbox AFTER INSERT ON correo_outbox DEFERRABLE INITIALLY DEFERRED
                FOR EACH ROW EXECUTE FUNCTION fixture_revertir_outbox()`);
            const failed=await request('register',registro(101),500);
            assert.equal(JSON.stringify(failed.data).includes('fixture-sensitive'),false);
            assert.equal((await db.query('SELECT count(*)::int AS n FROM correo_outbox')).rows[0].n,0);
            assert.equal((await db.query('SELECT count(*)::int AS n FROM registros_correo_pendientes')).rows[0].n,0);
            assert.equal((await worker.procesarUno()).estado,'vacio');assert.equal(mensajes.length,0);
            await db.query('DROP TRIGGER fixture_revertir_outbox ON correo_outbox');
        });
        await t.test('202 confirma cola sin enviar; estado sin PII; código correcto y login anterior',async()=>{
            const account=registro(102),{data:p}=await request('register',account,202);
            assert.equal(p.estado_envio,'en_cola');assert.equal(p.vence_en,null);assert.equal(mensajes.length,0);
            const status=(await request('verification-status',{registro_id:p.registro_id},200)).data;
            assert.equal(status.estado_envio,'en_cola');assert.equal(status.vence_en,null);
            for(const secret of [account.correo,account.password,'codigo_hash','clave_hash','payload'])assert.equal(JSON.stringify(status).includes(secret),false);
            assert.equal((await worker.procesarUno()).estado,'aceptado');
            assert.equal((await request('verification-status',{registro_id:p.registro_id},200)).data.estado_envio,'aceptado');
            const valid=codigo(account.correo);
            const responses=await Promise.all([1,2].map(()=>request('verify-email',verificar(p.registro_id,valid))));
            assert.deepEqual(responses.map(r=>r.res.status).sort(),[201,400]);
            await db.query('UPDATE usuarios SET correo_verificado_en=NULL WHERE correo=$1',[account.correo]);
            await request('login',{numero_suministro:account.numero_suministro,password:account.password},200);
            assert.equal((await db.query('SELECT count(*)::int AS n FROM usuarios')).rows[0].n,1);
            assert.equal((await db.query('SELECT count(*)::int AS n FROM suministros')).rows[0].n,1);
        });
        await t.test('Reenvío cancela evento anterior; no reinicia intentos ni amplía solicitud',async()=>{
            const account=registro(103),{data:p}=await request('register',account,202);
            const [first]=await events(p.registro_id);
            await request('resend-verification',{registro_id:p.registro_id},429);
            await db.query('UPDATE registros_correo_pendientes SET intentos=2 WHERE id=$1',[p.registro_id]);
            await adelantarEnvios();
            const {data:second}=await request('resend-verification',{registro_id:p.registro_id},202);
            assert.equal(second.solicitud_vence_en,p.solicitud_vence_en);
            const rows=await events(p.registro_id);assert.equal(rows[0].estado,'cancelado');assert.equal(rows[0].payload,null);
            assert.notEqual(rows[1].codigo_hash,first.codigo_hash);
            await worker.procesarUno();const valid=codigo(account.correo);
            await db.query("UPDATE registros_correo_pendientes SET codigo_vence_en=clock_timestamp()-INTERVAL '1 second' WHERE id=$1",[p.registro_id]);
            await request('verify-email',verificar(p.registro_id,valid),400);
            assert.equal((await db.query('SELECT intentos FROM registros_correo_pendientes WHERE id=$1',[p.registro_id])).rows[0].intentos,2);
        });
        await t.test('Proveedor temporal fuera de SQL; intento incorrecto persiste y recuperación permite confirmar',async()=>{
            const account=registro(104),{data:p}=await request('register',account,202);
            let first=true,code;
            const simulated=crearProcesadorOutbox({pool:db,key,enviarCodigo:async({mensaje})=>{
                code=JSON.parse(mensaje).text.match(/: (\d{6})/)[1];
                assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction'")).rows[0].n,0);
                if(first){first=false;throw Object.assign(new Error('secret-private'),{tipo:'transitorio'});}return{id:'synthetic-id'};
            }});
            assert.equal((await simulated.procesarUno()).estado,'reintento');
            const incorrect=((Number(code)+1)%1000000).toString().padStart(6,'0');
            await request('verify-email',verificar(p.registro_id,incorrect),400);
            const [e]=await events(p.registro_id);
            await db.query('UPDATE correo_outbox SET disponible_en=clock_timestamp() WHERE id=$1',[e.id]);
            assert.equal((await simulated.procesarUno()).estado,'aceptado');
            await request('verify-email',verificar(p.registro_id,code),201);
        });
        await t.test('Reenvío concurrente con HTTP cancela lease anterior y rechaza su OTP',async()=>{
            const account=registro(110),{data:p}=await request('register',account,202);
            let entered,release,oldCode;
            const ready=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
            const inFlight=crearProcesadorOutbox({pool:db,key,enviarCodigo:async({mensaje})=>{
                oldCode=JSON.parse(mensaje).text.match(/: (\d{6})/)[1];entered();await gate;return{id:'old-in-flight'};
            }}).procesarUno();
            try{
                await ready;await adelantarEnvios();
                await request('resend-verification',{registro_id:p.registro_id},202);
                await request('verify-email',verificar(p.registro_id,oldCode),400);
            }finally{release();}
            assert.equal((await inFlight).estado,'sin_lease');
            assert.equal((await worker.procesarUno()).estado,'aceptado');
            await request('verify-email',verificar(p.registro_id,oldCode),400);
            await request('verify-email',verificar(p.registro_id,codigo(account.correo)),201);
        });
        await t.test('Dos procesos independientes, privacidad y apagado ordenado durante llamada',async()=>{
            const {data:p}=await request('register',registro(105),202);
            const children=[child(),child()];const results=await Promise.all(children.map(c=>c.stopped));
            for(const r of results){assert.equal(r.code,0);privateOutput(r);}
            assert.equal(children.filter(c=>fs.existsSync(c.mailbox)).length,1);
            assert.equal((await events(p.registro_id))[0].intentos,1);
            const {data:q}=await request('register',registro(106),202);
            const graceful=child('--run',400);
            await until(()=>fs.existsSync(graceful.mailbox) && fs.readFileSync(graceful.mailbox,'utf8').endsWith('\n'));graceful.proc.kill('SIGTERM');
            const r=await graceful.stopped;assert.equal(r.code,0);privateOutput(r);
            assert.equal((await events(q.registro_id))[0].estado,'aceptado');
        });
        await t.test('SIGKILL y reinicio recuperan lease con idéntico mensaje y clave',async()=>{
            const {data:p}=await request('register',registro(107),202);
            const interrupted=child('--run',2000);await until(()=>fs.existsSync(interrupted.mailbox) && fs.readFileSync(interrupted.mailbox,'utf8').endsWith('\n'));
            // Esperar el registro completo; existencia del archivo no prueba que terminó write().
            interrupted.proc.kill('SIGKILL');await interrupted.stopped;
            const [e]=await events(p.registro_id);assert.equal(e.estado,'procesando');
            await db.query("UPDATE correo_outbox SET bloqueado_hasta=clock_timestamp()-INTERVAL '1 second' WHERE id=$1",[e.id]);
            const restarted=child();const r=await restarted.stopped;assert.equal(r.code,0);privateOutput(r);
            const a=JSON.parse(fs.readFileSync(interrupted.mailbox,'utf8')),b=JSON.parse(fs.readFileSync(restarted.mailbox,'utf8'));
            assert.equal(a.envio,b.envio);assert.equal(a.cuerpo,b.cuerpo);
            assert.equal((await events(p.registro_id))[0].estado,'aceptado');
        });
        await t.test('Rol limitado procesa correo sin leer contraseñas ni escribir negocio',async()=>{
            const role='hm_outbox_'+crypto.randomBytes(6).toString('hex');
            await db.query(`CREATE ROLE "${role}" LOGIN PASSWORD 'fixture-only-not-production';
                GRANT CONNECT ON DATABASE "${connection.database}" TO "${role}";
                GRANT USAGE ON SCHEMA public TO "${role}";
                GRANT SELECT,UPDATE ON correo_outbox TO "${role}";
                GRANT SELECT(id,registro_id) ON registros_correo_envios TO "${role}";
                GRANT SELECT(id,correo,numero_suministro,invalidado,consumido_en,codigo_hash,intentos,vence_en)
                    ON registros_correo_pendientes TO "${role}";
                GRANT UPDATE(codigo_vence_en) ON registros_correo_pendientes TO "${role}"`);
            const limited=new Pool({...connection,user:role});
            try{
                await assert.rejects(limited.query('SELECT clave_hash FROM registros_correo_pendientes'),{code:'42501'});
                await assert.rejects(limited.query('SELECT * FROM usuarios'),{code:'42501'});
                await assert.rejects(limited.query('DELETE FROM correo_outbox'),{code:'42501'});
                const {data:p}=await request('register',registro(109),202);
                const limitedWorker=crearProcesadorOutbox({pool:limited,key,enviarCodigo:async()=>({id:'limited-fixture'})});
                assert.equal((await limitedWorker.procesarUno()).estado,'aceptado');
                assert.equal((await events(p.registro_id))[0].estado,'aceptado');
            }finally{await limited.end();}
        });
        await t.test('Retención no borra trabajos activos; terminal conserva mínimo 24h y negocio',async()=>{
            const {data:p}=await request('register',registro(108),202);
            const before=(await db.query('SELECT count(*)::int AS n FROM usuarios')).rows[0].n;
            await db.query("UPDATE registros_correo_pendientes SET vence_en=clock_timestamp()-INTERVAL '25 hours',codigo_vence_en=clock_timestamp()-INTERVAL '25 hours' WHERE id=$1",[p.registro_id]);
            await db.query("UPDATE registros_correo_envios SET enviado_en=clock_timestamp()-INTERVAL '25 hours' WHERE registro_id=$1",[p.registro_id]);
            assert.equal((await limpiarRegistrosCorreo(db,{dryRun:false})).eliminados,0);
            assert.equal((await worker.procesarUno()).estado,'caducado');
            assert.equal((await limpiarRegistrosCorreo(db,{dryRun:false})).eliminados,1);
            assert.equal((await db.query('SELECT count(*)::int AS n FROM usuarios')).rows[0].n,before);
            assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND state LIKE 'idle in transaction%'")).rows[0].n,0);
            assert.equal(db.waitingCount,0);
        });
    } finally { await ctx.close(); }
    await t.test('006 aditiva/repetible conserva negocios y solicitudes del esquema anterior',async()=>{
        const {pool}=await nuevaBase('outbox_legacy');
        try{
            const initial=sql('init.sql');
            // Mismo esquema previo, sin tabla outbox; no modifica una base existente.
            await pool.query(initial.slice(0,initial.indexOf('CREATE TABLE public.correo_outbox'))+initial.slice(initial.indexOf('-- RECIBOS')));
            const pending=crypto.randomUUID(),legacySecret=crypto.randomBytes(32).toString('hex'),otp=crearCodigo(pending,legacySecret);
            await pool.query(`INSERT INTO usuarios(correo,clave_hash) VALUES ('legacy@example.invalid','fixture-hash');
                INSERT INTO suministros(numero_suministro,id_usuario) SELECT '950000001',id_usuario FROM usuarios;
                INSERT INTO recibos(id_suministro,periodo,fecha_emision,fecha_vencimiento,monto,consumo_m3,estado)
                    SELECT id_suministro,'fixture',CURRENT_DATE,CURRENT_DATE,10,1,'Pagado' FROM suministros;
                INSERT INTO pagos(id_recibo,monto,metodo) SELECT id_recibo,10,'fixture' FROM recibos`);
            await pool.query(`INSERT INTO registros_correo_pendientes(id,correo,numero_suministro,clave_hash,codigo_hash,codigo_vence_en)
                VALUES ($1,'pending@example.invalid','950000002','fixture-hash',$2,clock_timestamp()+INTERVAL '5 minutes')`,[pending,otp.hash]);
            const snapshot=async()=>{const out={};for(const table of ['usuarios','suministros','recibos','pagos','registros_correo_pendientes','registros_correo_envios'])
                out[table]=(await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows;return out;};
            const before=await snapshot();
            const locker=await pool.connect(),migration=await pool.connect();
            try{
                await locker.query('BEGIN');await locker.query('LOCK TABLE registros_correo_envios IN ACCESS EXCLUSIVE MODE');
                await assert.rejects(migration.query(sql('migrations/006_correo_outbox.sql')),{code:'55P03'});
                await migration.query('ROLLBACK');
                assert.equal((await migration.query("SELECT to_regclass('public.correo_outbox') AS tabla")).rows[0].tabla,null);
                await locker.query('COMMIT');
            }finally{await locker.query('ROLLBACK');await migration.query('ROLLBACK');locker.release();migration.release();}
            await pool.query(sql('migrations/006_correo_outbox.sql'));await pool.query(sql('migrations/006_correo_outbox.sql'));
            assert.deepEqual(await snapshot(),before);
            const legacyService=require('../email-registration').crearRegistroCorreo({pool,key,from:'fixture@example.invalid',
                secreto:legacySecret,generarClaveHash:()=>{throw new Error('No se genera contraseña al confirmar');}});
            assert.equal((await legacyService.consultar({registro_id:pending})).estado_envio,'anterior');
            assert.equal((await legacyService.verificar({registro_id:pending,codigo:otp.codigo})).estado,'ok');
            assert.equal((await pool.query("SELECT count(*)::int AS n FROM suministros WHERE numero_suministro='950000002'")).rows[0].n,1);
        }finally{await pool.end();}
    });
});
