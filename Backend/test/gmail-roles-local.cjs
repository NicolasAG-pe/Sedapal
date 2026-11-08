'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {Pool}=require('pg');
const {nuevaBase,sql}=require('./email-schema.cjs');
const {crearRegistroCorreo}=require('../email-registration');
const {crearProcesadorOutbox}=require('../email-outbox');
const {SCOPE,TOKEN_URL,crearRemitenteGmail}=require('../gmail-mail');

test('registro OTP Gmail con roles separados y sin acceso del worker a claves de usuarios',async()=>{
 const {pool,connection}=await nuevaBase('gmail_roles');
 const suffix=crypto.randomBytes(6).toString('hex'),rolePassword=crypto.randomBytes(24).toString('hex');
 const appGroup='hm_app_'+suffix,workerGroup='hm_worker_'+suffix,appLogin='hm_app_login_'+suffix,workerLogin='hm_worker_login_'+suffix;
 let app,worker;
 try{
  await pool.query(sql('init.sql').split('-- 008:')[0]);
  await pool.query(sql('migrations/008_operaciones_pago.sql'));
  await pool.query(sql('migrations/013_seguimiento_incidencias.sql'));
  const rename=s=>s.replaceAll('hidro_app_permisos_120',appGroup).replaceAll('hidro_correo_worker_permisos_120',workerGroup);
  await pool.query(rename(sql('roles/aplicacion-local.sql')));
  await pool.query(rename(sql('roles/correo-local.sql')));
  await pool.query(`CREATE ROLE "${appLogin}" LOGIN PASSWORD '${rolePassword}' IN ROLE "${appGroup}"; CREATE ROLE "${workerLogin}" LOGIN PASSWORD '${rolePassword}' IN ROLE "${workerGroup}"`);
  app=new Pool({...connection,user:appLogin,password:rolePassword});worker=new Pool({...connection,user:workerLogin,password:rolePassword});
  const key=crypto.randomBytes(32),sender='fixture.sender@gmail.com',secret=crypto.randomBytes(32).toString('hex');
  const service=crearRegistroCorreo({pool:app,key,from:sender,proveedor:'gmail',secreto:secret,altasHabilitadas:true,generarClaveHash:()=> 'synthetic-hash',verificarClave:()=>true});
  const account={solicitud_id:crypto.randomUUID(),correo:'worker@example.invalid',numero_suministro:'979000001',password:'FixtureOnly123!'};
  const pending=await service.registrar(account);
  assert.equal(pending.estado_envio,'en_cola');
  let capturedCode;
  const credentials={type:'authorized_user',client_type:'desktop',sender,scope:SCOPE,account_verified:true,account_check:'tokeninfo_email',client_id:'fixture.apps.googleusercontent.com',client_secret:'fixture',refresh_token:'fixture'};
  const send=crearRemitenteGmail({sender,credentials},{fetchImpl:async(url,options)=>{
   if(url===TOKEN_URL)return Response.json({access_token:'fixture',expires_in:3600,scope:SCOPE});
   const mime=Buffer.from(JSON.parse(options.body).raw,'base64url').toString();
   const plain=Buffer.from(mime.split('Content-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0].replaceAll('\r\n',''),'base64').toString();
   capturedCode=plain.match(/: (\d{6})/)[1];return Response.json({id:'fixture-message'});
  }});
  assert.equal((await crearProcesadorOutbox({pool:worker,key,enviarCodigo:send,proveedor:'gmail'}).procesarUno()).estado,'aceptado');
  assert.ok(capturedCode);
  await service.verificar({registro_id:pending.registro_id,codigo:capturedCode});
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM usuarios')).rows[0].n,1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM suministros')).rows[0].n,1);
  await assert.rejects(worker.query('SELECT clave_hash FROM registros_correo_pendientes'),{code:'42501'});
  await assert.rejects(worker.query('SELECT clave_hash FROM usuarios'),{code:'42501'});
  await assert.rejects(worker.query('INSERT INTO usuarios(correo,clave_hash) VALUES ($1,$2)',['x@example.invalid','x']),{code:'42501'});
 }finally{await app?.end();await worker?.end();await pool.end()}
});
