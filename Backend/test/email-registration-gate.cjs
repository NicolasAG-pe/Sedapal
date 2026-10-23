'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {iniciar}=require('./email-api.cjs');
test('sin activación explícita, secretos válidos no abren altas ni encolan correo',async()=>{
 const c=await iniciar({autoDrain:false,registrationEnabled:null});
 try{
  assert.equal(process.env.EMAIL_REGISTRATION_ENABLED,undefined);
  const caps=await fetch(c.base+'/api/auth/capabilities');assert.equal(caps.status,200);
  assert.deepEqual((await caps.json()).contratos_registro,['otp-outbox-v1']);
  await c.request('register',c.registro(823),503);
  for(const table of ['usuarios','suministros','registros_correo_pendientes','correo_outbox'])assert.equal(Number((await c.db.query('SELECT count(*) n FROM '+table)).rows[0].n),0);
  assert.equal(c.mensajes.length,0);
  assert.equal((await fetch(c.base+'/api/health')).status,200);
  assert.equal((await fetch(c.base+'/api/auth/session')).status,401);
 }finally{await c.close();}
});
