'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {nuevaBase,sql}=require('./email-schema.cjs');
const migration=()=>sql('migrations/014_compatibilidad_operaciones_produccion.sql');
test('014 requiere008 y rechaza esquema piloto sin cambiarlo',async()=>{
 const {pool}=await nuevaBase('compat_guard');
 try{
  await assert.rejects(pool.query(migration()),/Aplicar 008 antes de 014/);await pool.query('ROLLBACK');
  assert.equal((await pool.query("SELECT to_regclass('public.operaciones_pago') AS t")).rows[0].t,null);
  await pool.query(sql('init.sql'));
  const previous=(await pool.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
  await assert.rejects(pool.query(migration()),/exclusiva de la ruta productiva/);await pool.query('ROLLBACK');
  assert.deepEqual((await pool.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows,previous);
 }finally{await pool.end();}
});
test('014 aditiva/repetible conserva operaciones008 y las restricciones financieras',async()=>{
 const {pool}=await nuevaBase('compat_008');
 try{
  await pool.query(sql('init.sql').split('-- Manual, aditiva e idempotente. No activa 2FA ni modifica cuentas existentes.')[0]);
  await pool.query(sql('migrations/007_usuario_2fa.sql'));await pool.query(sql('migrations/008_operaciones_pago.sql'));
  await pool.query("INSERT INTO usuarios(correo,clave_hash) VALUES('compat@example.invalid','synthetic-not-a-login');INSERT INTO suministros(numero_suministro,id_usuario) VALUES('998877661',1);INSERT INTO recibos(id_suministro,periodo,fecha_emision,fecha_vencimiento,monto,consumo_m3,estado) VALUES(1,'Compatibilidad008',CURRENT_DATE,CURRENT_DATE+10,21.50,2,'Pendiente')");
  const id=crypto.randomUUID();await pool.query("INSERT INTO operaciones_pago(id,solicitud_id,id_usuario,id_recibo,monto,metodo,estado,payload_hash,entorno) VALUES($1,$2,1,1,21.50,'demostrativo','demostrativa',$3,'simulado')",[id,crypto.randomUUID(),'a'.repeat(64)]);
  await pool.query("INSERT INTO operaciones_pago_historial(operacion_id,estado,actor_id,motivo) VALUES($1,'demostrativa',1,'Demostración anterior sin fondos')",[id]);
  const previous=(await pool.query('SELECT to_jsonb(o) data FROM operaciones_pago o')).rows[0].data;
  await pool.query(migration());await pool.query(migration());
  const current=(await pool.query('SELECT to_jsonb(o) data FROM operaciones_pago o')).rows[0].data;
  const fields=['piloto_id','piloto_ensayo','receptor_huella','recibido_en','monto_recibido','receptor_comprobado'];
  for(const field of fields){assert.equal(current[field],null);delete current[field];}
  assert.deepEqual(current,previous);
  assert.equal((await pool.query("SELECT to_regclass('public.control_piloto_yape') t")).rows[0].t,null);
  for(const [field,value]of [['piloto_id',crypto.randomUUID()],['piloto_ensayo',true],['receptor_huella','f'.repeat(64)],['recibido_en',new Date()],['monto_recibido','21.50'],['receptor_comprobado',true]])await assert.rejects(pool.query('UPDATE operaciones_pago SET '+field+'=$1 WHERE id=$2',[value,id]),{code:'23514',constraint:'chk_operacion_produccion_sin_piloto'});
  await assert.rejects(pool.query('DELETE FROM operaciones_pago WHERE id=$1',[id]),/conservan su historial/);
  await assert.rejects(pool.query('DELETE FROM operaciones_pago_historial WHERE operacion_id=$1',[id]),/inmutable/);
  assert.equal((await pool.query('SELECT count(*)::int n FROM pagos')).rows[0].n,0);assert.equal((await pool.query('SELECT estado FROM recibos WHERE id_recibo=1')).rows[0].estado,'Pendiente');
 }finally{await pool.end();}
});
