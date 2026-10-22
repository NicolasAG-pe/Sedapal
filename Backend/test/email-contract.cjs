'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {iniciar}=require('./email-api.cjs');
test('Contrato OTP, idempotencia de registro y cuentas previas',async t=>{
 const c=await iniciar({autoDrain:false});
 const send=async(body,header)=>{const r=await fetch(c.base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json',
  ...(header?{'X-Hidro-Auth-Contract':header}: {})},body:JSON.stringify(body)});return{status:r.status,data:await r.json()};};
 try{
  await t.test('Capacidades y rechazo temprano de clientes sin contrato/UUID sin escribir',async()=>{
   const r=await fetch(c.base+'/api/auth/capabilities');assert.equal(r.status,200);
   assert.deepEqual((await r.json()).contratos_registro,['otp-outbox-v1']);
   for(const header of [undefined,'legacy','otp-outbox-v0']){
    const r=await send({...c.registro(601),solicitud_id:crypto.randomUUID()},header);
    assert.equal(r.status,426);assert.match(r.data.mensaje,/Actualiza Hidro-Mejora/);assert.match(r.data.mensaje,/iniciar sesión/);
   }
   assert.equal((await send(c.registro(601),'otp-outbox-v1')).status,400);
   assert.equal((await c.db.query('SELECT count(*)::int AS n FROM registros_correo_pendientes')).rows[0].n,0);
   assert.equal(c.mensajes.length,0);
  });
  const body={...c.registro(602),solicitud_id:crypto.randomUUID()};
  await t.test('Cinco solicitudes concurrentes con igual ID reservan exactamente un evento',async()=>{
   const results=await Promise.all(Array.from({length:5},()=>c.request('register',body,202)));
   assert.ok(results.every(r=>r.data.registro_id===body.solicitud_id));
   assert.equal((await c.db.query('SELECT count(*)::int AS n FROM registros_correo_envios WHERE registro_id=$1',[body.solicitud_id])).rows[0].n,1);
   const before=(await c.db.query('SELECT to_jsonb(p) AS dato FROM registros_correo_pendientes p WHERE id=$1',[body.solicitud_id])).rows[0];
   await c.request('register',{...body,password:'DifferentFixture123'},409);
   await c.request('register',{...body,numero_suministro:'900000603'},409);
   assert.deepEqual((await c.db.query('SELECT to_jsonb(p) AS dato FROM registros_correo_pendientes p WHERE id=$1',[body.solicitud_id])).rows[0],before);
   assert.equal(c.mensajes.length,0);
  });
  await t.test('Confirmación única, estado recuperable y login sin cabecera para cuenta previa',async()=>{
   await c.drain();await c.request('verify-email',c.verificar(body.solicitud_id,c.codigo(body.correo)),201);
   assert.equal((await c.request('verification-status',{registro_id:body.solicitud_id},200)).data.estado,'verificado');
   await c.db.query('UPDATE usuarios SET correo_verificado_en=NULL WHERE correo=$1',[body.correo]);
   const r=await fetch(c.base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({numero_suministro:body.numero_suministro,password:body.password})});
   assert.equal(r.status,200);const data=await r.json();assert.ok(data.token);
   assert.equal((await fetch(c.base+'/api/me/perfil',{headers:{Authorization:'Bearer '+data.token}})).status,200);
   assert.equal((await c.db.query('SELECT count(*)::int AS n FROM usuarios')).rows[0].n,1);
   assert.equal((await c.db.query('SELECT count(*)::int AS n FROM suministros')).rows[0].n,1);
  });
  await t.test('Consulta distingue ausencia, vencimiento, sustitución e intentos agotados sin PII',async()=>{
   await c.request('verification-status',{registro_id:crypto.randomUUID()},404);
   for(const [field,value,motivo]of [['invalidado',true,'sustituido'],['intentos',5,'sin_intentos'],['vence_en',new Date(Date.now()-1000),'solicitud_vencida']]){
    const a=c.registro(610+['invalidado','intentos','vence_en'].indexOf(field));
    const p=(await c.request('register',a,202)).data;
    await c.db.query(`UPDATE registros_correo_pendientes SET ${field}=$2 WHERE id=$1`,[p.registro_id,value]);
    const status=(await c.request('verification-status',{registro_id:p.registro_id},200)).data;
    assert.equal(status.estado,'cerrado');assert.equal(status.motivo,motivo);
    assert.equal(JSON.stringify(status).includes(a.correo),false);assert.equal(JSON.stringify(status).includes('codigo_hash'),false);
   }
  });
 }finally{await c.close();}
});
