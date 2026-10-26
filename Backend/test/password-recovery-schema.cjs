'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {nuevaBase,sql}=require('./email-schema.cjs');
const {config}=require('../password-recovery-crypto');
test('011 conserva cuentas, recibos, pagos, fotografías, claves y secuencias; repetible',async()=>{
 const {pool}=await nuevaBase('reset_preservation');
 try{
  await pool.query(sql('init.sql'));
  await pool.query(`INSERT INTO usuarios(correo,clave_hash,correo_verificado_en) VALUES('historico@example.invalid','fixture-hash',clock_timestamp());
   INSERT INTO suministros(numero_suministro,id_usuario) VALUES('987654321',1);
   INSERT INTO recibos(id_suministro,periodo,fecha_emision,fecha_vencimiento,monto,consumo_m3,estado) VALUES(1,'fixture',CURRENT_DATE,CURRENT_DATE,20,3,'Pagado');
   INSERT INTO pagos(id_recibo,monto,metodo) VALUES(1,20,'Histórico');
   INSERT INTO incidencias(id_suministro,tipo,descripcion,foto,foto_mime) VALUES(1,'fixture','Laboratorio',decode('89504e470d0a1a0a','hex'),'image/png');`);
  const snapshot=async()=>{const data={};for(const table of['usuarios','suministros','recibos','pagos','incidencias'])data[table]=(await pool.query('SELECT * FROM '+table+' ORDER BY 1')).rows;data.sequences=(await pool.query("SELECT sequencename,last_value FROM pg_sequences WHERE schemaname='public' ORDER BY 1")).rows;return data;};
  const before=await snapshot();await pool.query(sql('migrations/011_recuperacion_clave.sql'));await pool.query(sql('migrations/011_recuperacion_clave.sql'));assert.deepEqual(await snapshot(),before);
  assert.equal((await pool.query('SELECT count(*)::int n FROM recuperaciones_clave')).rows[0].n,0);
  await pool.query("BEGIN; UPDATE usuarios SET clave_hash='rollback-fixture' WHERE id_usuario=1; ROLLBACK;");assert.deepEqual(await snapshot(),before);assert.equal((await pool.query('SELECT count(*)::int n FROM usuario_2fa')).rows[0].n,0);
  const fk=(await pool.query("SELECT count(*)::int n FROM pg_constraint WHERE conrelid='recuperaciones_clave'::regclass AND contype='f'")).rows[0].n;assert.equal(fk,2);
 }finally{await pool.end();}
});
test('rechaza reutilización de claves en otra codificación y worker cerrado por defecto',async()=>{
 const key=crypto.randomBytes(32),env={PASSWORD_RECOVERY_ENABLED:'1',PASSWORD_RECOVERY_SECRET:crypto.randomBytes(32).toString('hex'),PASSWORD_RECOVERY_OUTBOX_KEY:key.toString('base64'),EMAIL_PROVIDER:'resend',RESEND_FROM:'fixture@example.invalid'};
 assert.throws(()=>config({...env,AUTH_TOKEN_SECRET:key.toString('hex')}));assert.throws(()=>config({...env,AUTH_TOKEN_SECRET:Buffer.from(env.PASSWORD_RECOVERY_SECRET,'hex').toString('base64')}));assert.throws(()=>config({...env,PASSWORD_RECOVERY_SECRET:key.toString('hex')}));assert.ok(config(env));
 const {spawnSync}=require('node:child_process');const r=spawnSync(process.execPath,['Backend/workers/password-recovery.cjs','--once'],{env:{PATH:process.env.PATH},encoding:'utf8'});assert.equal(r.status,1);assert.match(r.stderr,/detenido/);assert.equal(r.stdout,'');
});
