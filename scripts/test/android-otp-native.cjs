'use strict';
// Escenario importado por el harness del AVD; PostgreSQL nuevo y proveedor simulado.
const assert=require('node:assert/strict');
module.exports=async function({ctx,getPage,restart,until,ok,screenshot,android,dashboard,logout,noPlainToken}){
 const page=()=>getPage(),account=ctx.registro(721);
 async function check(){await page().locator('#btn-check-email').click();}
 async function status(text){await until(()=>page().evaluate(t=>document.getElementById('verify-status').textContent.includes(t),text),'estado OTP '+text);}
 async function saved(){return page().evaluate(()=>HMNativeState.readRegistration());}
 async function drainTo(expected){
  // El trabajador omite filas bloqueadas por consultas/reenvío (SKIP LOCKED).
  // Un ciclo vacío no prueba que ya se procesó el evento; repetir como su polling real.
  await until(async()=>{
   await ctx.drain();
   const {rows}=await ctx.db.query('SELECT estado FROM correo_outbox ORDER BY creado_en DESC,id DESC LIMIT 1');
   return rows[0]?.estado===expected;
  },'trabajador simulado confirma '+expected);
 }
 async function resend(){
  const before=(await ctx.db.query('SELECT count(*)::int n FROM correo_outbox')).rows[0].n;
  await ctx.adelantarEnvios();await check();await page().locator('#btn-resend-email').click();
  await until(async()=>(await ctx.db.query('SELECT count(*)::int n FROM correo_outbox')).rows[0].n===before+1,'reenvío confirmado en SQL');await status('cola');
 }
 await page().waitForFunction(()=>!document.getElementById('login-form').hidden,null,{polling:100});
 // La petición sí llega al servidor: solo se descarta su respuesta, en la WebView.
 await page().evaluate(()=>{const original=window.fetch;window.fetch=async function(input,options){const response=await original(input,options);if(String(input).endsWith('/api/auth/otp/register')){window.fetch=original;await response.arrayBuffer();throw new TypeError('Respuesta descartada por fixture');}return response;};});
 await page().locator('#show-register').click();
 for(const [selector,value]of [['#reg-correo',account.correo],['#reg-suministro',account.numero_suministro],['#reg-pass',account.password],['#reg-pass2',account.password]])await page().locator(selector).fill(value);
 await page().locator('#btn-register').click();
 await until(async()=>!!(await saved()).pending,'UUID durable antes de terminar proceso');
 const original=(await saved()).pending;assert.deepEqual(Object.keys(original).sort(),['id','suministro']);
 await until(async()=>(await ctx.db.query('SELECT count(*)::int n FROM registros_correo_pendientes WHERE id=$1',[original.id])).rows[0].n===1,'POST confirmado en SQL');
 await restart();await status('cola');assert.equal((await saved()).pending.id,original.id);
 assert.equal((await ctx.db.query('SELECT count(*)::int n FROM usuarios')).rows[0].n,0);assert.equal(await page().evaluate(()=>sessionStorage.getItem('hm_email_pending')),null);
 ok('OTP: respuesta POST perdida y force-stop recuperan UUID original sin repetir alta ni crear usuario');screenshot('otp-recovered');
 const replay=await page().evaluate(async body=>Promise.all([1,2].map(async()=>{const r=await fetch(HMShared.apiUrl('/api/auth/otp/register'),{method:'POST',headers:{'Content-Type':'application/json','X-Hidro-Auth-Contract':'otp-outbox-v1'},body:JSON.stringify(body)});return r.status;})),{...account,solicitud_id:original.id});
 assert.deepEqual(replay,[202,202]);assert.equal((await ctx.db.query('SELECT count(*)::int n FROM correo_outbox')).rows[0].n,1);ok('OTP: replay concurrente desde WebView conserva UUID y un solo evento outbox');
 let job;await until(async()=>!!(job=await ctx.worker.tomar()),'lease de trabajador');assert.equal(job.registro_id,original.id);await check();await status('Procesando');
 const encrypted=require('../../Backend/outbox-crypto').descifrarMensaje(job.payload,Buffer.from(process.env.EMAIL_OUTBOX_KEY,'base64'),job.id,job.registro_id),message=JSON.parse(encrypted);
 ctx.mensajes.push({correo:message.to[0],codigo:message.text.match(/: (\d{6})/)[1]});await ctx.worker.finalizar(job,{id:'synthetic-native-provider'});await check();await status('aceptó');
 ok('OTP: estados en cola, procesando y aceptado consultados desde PostgreSQL/outbox');
 const first=ctx.codigo(account.correo),wrong=first==='000000'?'000001':'000000';await page().locator('#verify-code').fill(wrong);await page().locator('#btn-verify-email').click();
 await until(async()=>(await ctx.db.query('SELECT intentos FROM registros_correo_pendientes WHERE id=$1',[original.id])).rows[0].intentos===1,'intento erróneo contabilizado');
 await ctx.db.query("UPDATE registros_correo_pendientes SET codigo_vence_en=NOW()-INTERVAL '1 second' WHERE id=$1",[original.id]);await check();
 await until(()=>page().evaluate(()=>document.getElementById('verify-code-hint').textContent.includes('venció')&&document.getElementById('btn-verify-email').disabled),'OTP vencido bloqueado');
 await resend();ctx.setProveedorFalla(true);await drainTo('fallido');await check();await status('No se pudo enviar');ctx.setProveedorFalla(false);
 ok('OTP: código incorrecto, vencimiento y fallo simulado de proveedor respetan límites sin crear cuenta');
 await resend();await drainTo('aceptado');await check();await status('aceptó');assert.notEqual(ctx.codigo(account.correo),first);
 await restart();await status('aceptó');assert.equal((await saved()).pending.id,original.id);assert.equal((await ctx.db.query('SELECT intentos FROM registros_correo_pendientes WHERE id=$1',[original.id])).rows[0].intentos,1);
 await page().evaluate(()=>{const original=window.fetch;window.fetch=async function(input,options){const response=await original(input,options);if(String(input).endsWith('/api/auth/verify-email')){window.fetch=original;await response.arrayBuffer();throw new TypeError('Respuesta descartada por fixture');}return response;};});
 await page().locator('#verify-code').fill(ctx.codigo(account.correo));await page().locator('#btn-verify-email').click();
 await until(async()=>(await ctx.db.query('SELECT count(*)::int n FROM usuarios WHERE correo=$1',[account.correo])).rows[0].n===1,'confirmación atómica');
 await restart();await until(()=>page().evaluate(()=>!document.getElementById('login-form').hidden&&document.getElementById('verify-email-form').hidden),'recuperación de confirmación');assert.ok(!(await saved()).pending);
 assert.equal((await ctx.db.query('SELECT count(*)::int n FROM suministros WHERE numero_suministro=$1',[account.numero_suministro])).rows[0].n,1);
 ok('OTP: reenvío, reinicio y respuesta de confirmación perdida dejan un usuario/suministro y limpian metadatos');
 // Solicitud cerrada real, encontrada al reiniciar, sin habilitar verificación.
 const other=ctx.registro(722),p=(await ctx.request('register',other,202)).data;
 await page().evaluate(v=>HMRegistrationState.save(v),{id:p.registro_id,suministro:other.numero_suministro});await ctx.db.query("UPDATE registros_correo_pendientes SET vence_en=NOW()-INTERVAL '1 second' WHERE id=$1",[p.registro_id]);
 await restart();await until(()=>page().evaluate(()=>document.getElementById('verify-code-hint').textContent.includes('solicitud venció')),'solicitud vencida confirmada');assert.ok(!(await saved()).pending);
 await page().locator('#btn-restart-register').click();await until(()=>page().evaluate(()=>!document.getElementById('register-form').hidden),'otros datos');assert.ok(!(await saved()).pending);
 ok('OTP: solicitud caducada se informa/retira y abandonar permite iniciar otra identidad');
 async function directRegistration(n){
  const a=ctx.registro(n);
  for(const [selector,value]of [['#reg-correo',a.correo],['#reg-suministro',a.numero_suministro],['#reg-pass',a.password],['#reg-pass2',a.password]])await page().locator(selector).fill(value);
  await page().locator('#btn-register').click();
  await until(async()=>!!(await saved()).pending,'solicitud nueva persistida');
  await drainTo('aceptado');await check();await status('aceptó');
  return a;
 }
 // El token correcto no puede abrir datos privados si falla el almacenamiento nativo.
 const failed=await directRegistration(723);
 await page().evaluate(()=>{window.originalSecureWrite=HMNativeState.writeSession;HMNativeState.writeSession=async()=>{throw Error('Fallo sintético Keystore');};});
 await page().locator('#verify-code').fill(ctx.codigo(failed.correo));await page().locator('#btn-verify-email').click();
 await until(()=>page().evaluate(()=>!document.getElementById('login-form').hidden&&document.getElementById('session-restore').hidden),'fallo seguro vuelve al login');
 assert.equal(await page().evaluate(()=>document.getElementById('view-dashboard').classList.contains('active')),false);
 assert.ok(!await page().evaluate(async()=>(await HMNativeState.readSession()).token));
 await page().evaluate(()=>{HMNativeState.writeSession=window.originalSecureWrite;delete window.originalSecureWrite;});
 ok('OTP: fallo de escritura segura impide dashboard y retira credencial incompleta');
 await page().locator('#show-register').click();
 const direct=await directRegistration(724);let loginCalls=0;
 const countLogin=req=>{if(req.url==='/api/auth/login')loginCalls++;};ctx.httpServer.on('request',countLogin);
 try{
  await page().locator('#verify-code').fill(ctx.codigo(direct.correo));await page().locator('#btn-verify-email').click();
  await dashboard(direct.numero_suministro);await noPlainToken();
  assert.equal(loginCalls,0,'No se utiliza contraseña ni segunda petición de login');
  assert.ok(!(await saved()).pending);
  assert.equal(await page().locator('#reg-pass').inputValue(),'');assert.equal(await page().locator('#verify-code').inputValue(),'');
  const token=await page().evaluate(async()=>(await HMNativeState.readSession()).token);assert.ok(token);
  const encrypted=android('shell','run-as','pe.edu.hidromejora.app','cat','no_backup/hm-secure-v1/session.bin');
  assert.equal(encrypted.includes(token),false,'JWT ausente del archivo cifrado');
  ok('OTP: confirmación abre dashboard sin login y conserva JWT cifrado, sin OTP ni contraseña');screenshot('otp-auto-dashboard');
  await restart();await dashboard(direct.numero_suministro);ok('OTP: sesión automática se restaura tras force-stop');
  await restart('kill');await dashboard(direct.numero_suministro);ok('OTP: sesión automática se restaura tras muerte del proceso');
  await logout();await restart();
  await until(()=>page().evaluate(()=>!document.getElementById('login-form').hidden),'logout no restaura');
  assert.ok(!await page().evaluate(async()=>(await HMNativeState.readSession()).token));
  ok('OTP: logout elimina sesión automática y sigue cerrado después de reiniciar');
 }finally{ctx.httpServer.off('request',countLogin);}
};
