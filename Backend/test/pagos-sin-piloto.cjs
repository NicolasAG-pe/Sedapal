'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {nuevaBase,sql}=require('./email-schema.cjs');
const {crearOperacionesPago}=require('../payment-operations');
const {crearServicioRecibos}=require('../receipt-transactions');

test('008 permite pagos simulados y edición de recibos sin tablas de piloto', async()=>{
 const {pool}=await nuevaBase('pagos_sin_piloto');
 try {
  await pool.query(sql('init.sql').split('-- 008:')[0]);
  await pool.query(sql('migrations/008_operaciones_pago.sql'));
  assert.equal((await pool.query("SELECT to_regclass('public.control_piloto_yape') AS t")).rows[0].t,null);
  const u=(await pool.query("INSERT INTO usuarios(correo,clave_hash) VALUES ('fixture@example.invalid','fixture') RETURNING id_usuario")).rows[0];
  const s=(await pool.query("INSERT INTO suministros(numero_suministro,id_usuario) VALUES ('960000001',$1) RETURNING id_suministro",[u.id_usuario])).rows[0];
  const make=async period=>(await pool.query("INSERT INTO recibos(id_suministro,periodo,fecha_emision,fecha_vencimiento,monto,consumo_m3,estado) VALUES ($1,$2,'2026-01-01','2026-02-01',10,1,'Pendiente') RETURNING id_recibo",[s.id_suministro,period])).rows[0].id_recibo;
  const user={id_usuario:u.id_usuario,id_suministro:s.id_suministro};
  const service=crearOperacionesPago({pool,env:{NODE_ENV:'test'}});
  const id=await make('pago');
  const r=await service.create({id_recibo:id,metodo:'demostrativo',solicitud_id:crypto.randomUUID()},user);
  assert.equal(r.operacion.estado,'demostrativa');
  assert.equal(r.operacion.piloto_ensayo,null);
  assert.equal((await service.list(user)).length,1);
  assert.equal((await service.page(user,{tab:'simulaciones'})).total,1);
  assert.equal((await pool.query('SELECT estado FROM recibos WHERE id_recibo=$1',[id])).rows[0].estado,'Pendiente');
  assert.equal((await pool.query('SELECT count(*)::int n FROM pagos')).rows[0].n,0);
  const receipt=await make('editable');
  const rs=crearServicioRecibos({pool,validarRecibo:()=>({periodo:'editado',emision:'2026-01-01',vencimiento:'2026-02-01',monto:10,consumo:1})});
  assert.equal((await rs.editar(Number(receipt),{})).recibo.periodo,'editado');
  assert.equal((await rs.anular(Number(receipt))).recibo.estado,'Anulado');
  const guarded=await make('protegido');
  await pool.query('CREATE TABLE control_piloto_yape (id_recibo bigint, habilitado boolean, vence_en timestamptz)');
  await pool.query("INSERT INTO control_piloto_yape VALUES ($1,true,clock_timestamp()+interval '1 hour')",[guarded]);
  await assert.rejects(rs.anular(Number(guarded)),{status:409});
  const closed=crearOperacionesPago({pool,env:{NODE_ENV:'test',YAPE_PILOT_ENABLED:'1'}});
  await assert.rejects(closed.list(user),/Esquema de piloto incompleto/);
  await pool.query('ALTER TABLE operaciones_pago ADD COLUMN piloto_id UUID');
  await assert.rejects(service.list(user),/Esquema de piloto incompleto/);
 } finally {await pool.end();}
});
