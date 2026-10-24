'use strict';
// Navegador emulado + API/SQL locales reales. Todas las salidas externas quedan interceptadas.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {buildWeb}=require('../build-web');
const root=path.resolve(__dirname,'../..');
const {chromium,devices}=require(process.env.HIDRO_PLAYWRIGHT_MODULE || path.join(root,'artifacts/vercel-validation/tools/node_modules/playwright'));
const {iniciar}=require('../../Backend/test/email-api.cjs');
const {cancelarEventos}=require('../../Backend/email-outbox');
const origin='https://localhost',api='https://api.compat.fixture.test';
let ctx,browser,runtime,sequence=300,ip=1;
before(async()=>{
 ctx=await iniciar({autoDrain:false});
 runtime=fs.mkdtempSync(path.join(os.tmpdir(),'hidro-transition-'));buildWeb('android',{API_BASE_URL:api},runtime);
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
});
after(async()=>{if(browser)await browser.close();if(ctx)await ctx.close();});
async function fixture(t,{legacy=false,legacyVerification=false,device='Pixel 5',viewport}={}){
 const context=await browser.newContext({...devices[device],...(viewport?{viewport}:{}),reducedMotion:'reduce'});
 const page=await context.newPage(),calls=[],errors=[];let offline=false,oldBackend=false,drop='',dropBefore='',mixedBackend=false;
 page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.abort());
 await page.route(origin+'/**',route=>{
  const name=new URL(route.request().url()).pathname;
  if(name.endsWith('/hm-api-config.js'))return route.fulfill({contentType:'application/javascript',body:`window.HM_API_BASE=${JSON.stringify(api)};`});
  if(name.endsWith('/socket.io.min.js'))return route.fulfill({contentType:'application/javascript',body:'window.io=()=>({on(){},removeAllListeners(){},disconnect(){}});'});
  let body;
  if(legacy){
   const file=name.startsWith('/shared/')?'Shared/'+name.slice(8):'Frontend/'+(name==='/'?'index.html':name.slice(1));
   try{body=execFileSync('git',['show',(legacy===true?'v1.0.0':legacy)+':'+file],{cwd:root,stdio:['ignore','pipe','ignore']});}catch(_){return route.fulfill({status:404});}
  }else{const file=path.resolve(runtime,'.'+(name==='/'?'/index.html':name));assert.ok(file.startsWith(runtime+path.sep));body=fs.existsSync(file)?fs.readFileSync(file):'';}
  const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
  return route.fulfill({contentType:mime[path.extname(name)]||'text/html',body});
 });
 await page.route(api+'/**',async route=>{
  const req=route.request(),pathname=new URL(req.url()).pathname;
  if(offline)return route.abort('internetdisconnected');
  if(oldBackend && pathname==='/api/auth/capabilities')return route.fulfill({status:404,contentType:'text/html',body:'<p>Not found</p>'});
  if(dropBefore===pathname){dropBefore='';return route.abort('internetdisconnected');}
  if(mixedBackend && pathname==='/api/auth/otp/register'){calls.push({path:pathname,status:404});return route.fulfill({status:404,contentType:'text/html',body:'Not found'});}
  const res=await fetch(ctx.base+pathname,{method:req.method(),headers:{'Content-Type':'application/json',Origin:origin,
   'X-Forwarded-For':`192.0.2.${1+(ip++%240)}`,...(req.headers()['x-hidro-auth-contract']?{'X-Hidro-Auth-Contract':req.headers()['x-hidro-auth-contract']}:{}),
   ...(req.headers().authorization?{Authorization:req.headers().authorization}:{})},...(req.postData()?{body:req.postData()}:{})});
  calls.push({path:pathname,status:res.status,body:req.postData()?JSON.parse(req.postData()):null});
  let body=await res.text();
  if(legacyVerification && pathname==='/api/auth/verify-email' && res.status===201){
   const data=JSON.parse(body);body=JSON.stringify({estado:data.estado,mensaje:data.mensaje,usuario:{numero_suministro:data.usuario.numero_suministro}});
  }
  if(drop===pathname){drop='';return route.abort('connectionreset');}
  try{return await route.fulfill({status:res.status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':origin,
   ...(res.headers.get('retry-after')?{'Retry-After':res.headers.get('retry-after')}: {})},body});}catch(error){if(!page.isClosed()&&!req.failure())throw error;}
 });
 t.after(async()=>{
  await context.close();assert.deepEqual(errors,[],'Sin errores JavaScript');
  const {rows}=await ctx.db.query('UPDATE registros_correo_pendientes SET invalidado=TRUE WHERE consumido_en IS NULL RETURNING id');
  for(const r of rows)await cancelarEventos(ctx.db,r.id);
 });
 await page.goto(origin);
 const account=ctx.registro(++sequence);
 async function register(){await page.locator('#show-register').click();await fillRegister();await page.locator('#btn-register').click();}
 async function fillRegister(){for(const [id,value]of Object.entries({'reg-correo':account.correo,'reg-suministro':account.numero_suministro,'reg-pass':account.password,'reg-pass2':account.password}))await page.locator('#'+id).fill(value);}
 const pending=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('hm_email_pending')));
 const check=()=>page.locator('#btn-check-email').click();
 return {page,context,account,calls,register,fillRegister,pending,check,offline:v=>{offline=v;},oldBackend:()=>{oldBackend=true;},mixedBackend:()=>{mixedBackend=true;},drop:p=>{drop=p;},dropBefore:p=>{dropBefore=p;}};
}
async function deliver(id){
 for(let n=0;n<50;n++){
  await ctx.drain();
  const r=await ctx.db.query(`SELECT o.estado FROM correo_outbox o JOIN registros_correo_envios e ON e.id=o.id
    JOIN registros_correo_pendientes p ON p.id=e.registro_id WHERE p.id=$1 AND o.codigo_hash=p.codigo_hash`,[id]);
  if(r.rows.some(r=>r.estado==='aceptado'))return;
  await new Promise(resolve=>setTimeout(resolve,20));
 }
 throw new Error('El trabajador simulado no aceptó el evento de la solicitud.');
}
async function waitPending(f){await f.page.waitForFunction(()=>!document.getElementById('verify-email-form').hidden && JSON.parse(sessionStorage.getItem('hm_email_pending'))?.aceptada===true);return f.pending();}

test('APK v1.0.0 recibe actualización legible sin crear solicitud; login anterior permanece',async t=>{
 const f=await fixture(t,{legacy:true});const before=(await ctx.db.query('SELECT count(*)::int AS n FROM registros_correo_pendientes')).rows[0].n;
 await f.register();await f.page.waitForFunction(()=>document.getElementById('reg-error').textContent.includes('Actualiza Hidro-Mejora'));
 assert.equal(f.calls.find(c=>c.path==='/api/auth/register').status,426);
 assert.equal((await ctx.db.query('SELECT count(*)::int AS n FROM registros_correo_pendientes')).rows[0].n,before);
 const account=ctx.registro(++sequence),p=(await ctx.request('register',account,202)).data;
 await ctx.drain();await ctx.request('verify-email',ctx.verificar(p.registro_id,ctx.codigo(account.correo)),201);
 await ctx.db.query('UPDATE usuarios SET correo_verificado_en=NULL WHERE correo=$1',[account.correo]);
 await f.page.goto(origin);await f.page.locator('#suministro').fill(account.numero_suministro);await f.page.locator('#password').fill(account.password);await f.page.locator('#btn-login').click();
 await f.page.waitForFunction(()=>document.getElementById('view-dashboard').classList.contains('active'));
 assert.ok(f.calls.some(c=>c.path==='/api/auth/login'&&c.status===200));
});

test('Cliente nuevo ante backend anterior: no envía credenciales ni crea cuenta sin OTP',async t=>{
 const f=await fixture(t);f.oldBackend();await f.register();
 await f.page.waitForFunction(()=>document.getElementById('reg-error').textContent.includes('no está disponible en este servidor'));
 assert.equal(f.calls.some(c=>c.path==='/api/auth/register'),false);assert.equal(await f.pending(),null);
});

test('Cambio a backend antiguo entre preflight y POST: ruta OTP desconocida, cero cuentas',async t=>{
 const f=await fixture(t);f.mixedBackend();const before=(await ctx.db.query('SELECT count(*)::int AS n FROM usuarios')).rows[0].n;
 await f.register();await f.page.waitForFunction(()=>document.getElementById('reg-error').classList.contains('show'));
 assert.ok(f.calls.some(c=>c.path==='/api/auth/otp/register'&&c.status===404));
 assert.equal(f.calls.some(c=>c.path==='/api/auth/register'),false);
 assert.equal((await ctx.db.query('SELECT count(*)::int AS n FROM usuarios')).rows[0].n,before);
});

test('Reintento concurrente con UUID estable no duplica evento ni altera contraseña/cuotas',async()=>{
 const body={...ctx.registro(++sequence),solicitud_id:crypto.randomUUID()};
 const rs=await Promise.all([1,2].map(()=>ctx.request('register',body,202)));
 assert.equal(rs[0].data.registro_id,body.solicitud_id);assert.equal(rs[1].data.registro_id,body.solicitud_id);
 const state=async()=>(await ctx.db.query('SELECT to_jsonb(p) AS p FROM registros_correo_pendientes p WHERE id=$1',[body.solicitud_id])).rows[0];
 const before=await state();
 await ctx.request('register',{...body,password:'DifferentFixture123'},409);
 await ctx.request('register',{...body,correo:'different@example.invalid'},409);
 assert.deepEqual(await state(),before);
 assert.equal((await ctx.db.query('SELECT count(*)::int AS n FROM registros_correo_envios WHERE registro_id=$1',[body.solicitud_id])).rows[0].n,1);
 await cancelarEventos(ctx.db,body.solicitud_id);
});

test('Respuestas perdidas de registro, reenvío y confirmación se recuperan sin repetir operaciones',async t=>{
 const f=await fixture(t);f.drop('/api/auth/otp/register');await f.register();const p=await waitPending(f);
 assert.equal(f.calls.filter(c=>c.path==='/api/auth/otp/register').length,1);
 await f.page.reload();await waitPending(f);assert.equal((await f.pending()).id,p.id);
 const storage=await f.page.evaluate(()=>sessionStorage.getItem('hm_email_pending'));
 for(const value of [f.account.password,f.account.correo,'codigo','token'])assert.equal(storage.includes(value),false);
 await deliver(p.id);await f.check();await f.page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('hm_email_pending')).estadoEnvio==='aceptado');
 const first=ctx.codigo(f.account.correo);
 await ctx.adelantarEnvios();await f.check();await f.page.waitForFunction(()=>!document.getElementById('btn-resend-email').disabled);
 f.drop('/api/auth/otp/resend-verification');await f.page.locator('#btn-resend-email').click();
 await f.page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('hm_email_pending')).estadoEnvio==='en_cola');
 assert.equal(f.calls.filter(c=>c.path==='/api/auth/otp/resend-verification').length,1);
 await deliver(p.id);await f.check();await f.page.waitForFunction(()=>!document.getElementById('btn-verify-email').disabled);
 assert.notEqual(ctx.codigo(f.account.correo),first);
 f.drop('/api/auth/verify-email');await f.page.locator('#verify-code').fill(ctx.codigo(f.account.correo));await f.page.locator('#btn-verify-email').click();
 await f.page.waitForFunction(()=>!document.getElementById('login-form').hidden && document.getElementById('suministro').value!== '');
 assert.equal(await f.pending(),null);
 assert.equal((await ctx.db.query('SELECT count(*)::int AS n FROM usuarios WHERE correo=$1',[f.account.correo])).rows[0].n,1);
});

test('Desconexión durante consulta conserva UUID y se recupera al volver la red',async t=>{
 const f=await fixture(t);
 // La solicitud llega al servidor; se pierde la respuesta y también la consulta inicial.
 f.drop('/api/auth/otp/register');await f.register();const p=await waitPending(f);
 f.offline(true);await f.check();await f.page.waitForFunction(()=>document.getElementById('verify-status').textContent.includes('Sin conexión'));
 assert.equal((await f.pending()).id,p.id);f.offline(false);await f.page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await f.page.waitForFunction(()=>!document.getElementById('verify-status').textContent.includes('Sin conexión'));
 assert.equal(f.calls.filter(c=>c.path==='/api/auth/otp/register').length,1);
});

test('Registro que no alcanzó la API se reintenta explícitamente con el mismo UUID',async t=>{
 const f=await fixture(t);f.dropBefore('/api/auth/otp/register');await f.register();
 await f.page.waitForFunction(()=>!document.getElementById('verify-email-form').hidden && document.getElementById('verify-status').textContent.includes('no se encontró'));
 const p=await f.pending();assert.equal(p.aceptada,false);
 await f.page.reload();await f.page.waitForFunction(()=>!document.getElementById('verify-email-form').hidden);
 await f.page.locator('#btn-retry-registration').click();await f.fillRegister();await f.page.locator('#btn-register').click();
 await waitPending(f);assert.equal((await f.pending()).id,p.id);
 assert.equal(f.calls.filter(c=>c.path==='/api/auth/otp/register').length,1);
});

for(const [device,viewport]of [['Pixel 5',{width:360,height:780}],['Galaxy S9+',undefined],['Pixel 7',undefined],['iPad Mini',{width:768,height:1024}],['Desktop Chrome',{width:1366,height:900}]]){
 test(`OTP, estados y layout en ${device} ${viewport?.width||'perfil'}`,async t=>{
  const f=await fixture(t,{device,viewport});await f.register();const p=await waitPending(f);
  assert.equal(await f.page.locator('#btn-verify-email').isDisabled(),true);
  await f.page.waitForFunction(()=>document.getElementById('verify-status').textContent.includes('Correo en cola'));
  for(const [state,text]of [['fallido','No se pudo enviar'],['caducado','El envío venció'],['ambiguo','No pudimos confirmar'],['cancelado','sustituido o cancelado']]){
   await ctx.db.query(`UPDATE correo_outbox SET estado=$2,payload=NULL,finalizado_en=clock_timestamp() WHERE id IN
    (SELECT id FROM registros_correo_envios WHERE registro_id=$1)`,[p.id,state]);
   await f.check();await f.page.waitForFunction(text=>document.getElementById('verify-status').textContent.includes(text),text);
  }
  const layout=await f.page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,
   controls:[...document.querySelectorAll('#verify-email-form button,#verify-code')].filter(e=>e.getClientRects().length).every(e=>{const r=e.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth+1;})}));
  assert.ok(layout.scroll<=layout.width);assert.equal(layout.controls,true);
  await ctx.db.query('UPDATE registros_correo_pendientes SET intentos=5 WHERE id=$1',[p.id]);await f.check();
  await f.page.waitForFunction(()=>document.getElementById('verify-status').textContent.includes('Agotaste los intentos'));
  assert.equal(await f.page.locator('#btn-resend-email').isDisabled(),true);
 });
}

test('Procesando, OTP incorrecto/vencido y reenvío conservan solicitud hasta verificar',async t=>{
 const f=await fixture(t);await f.register();const p=await waitPending(f);
 let job;for(let n=0;n<50 && !job;n++){job=await ctx.worker.tomar();if(!job)await new Promise(r=>setTimeout(r,20));}
 assert.equal(job?.registro_id,p.id);
 await f.check();await f.page.waitForFunction(()=>document.getElementById('verify-status').textContent.includes('Procesando el envío'));
 const message=require('../../Backend/outbox-crypto').descifrarMensaje(job.payload,Buffer.from(process.env.EMAIL_OUTBOX_KEY,'base64'),job.id,p.id);
 const code=JSON.parse(message).text.match(/: (\d{6})/)[1];
 await ctx.worker.finalizar(job,{id:'fixture-provider-accepted'});await f.check();
 const wrong=((Number(code)+1)%1000000).toString().padStart(6,'0');
 await f.page.locator('#verify-code').fill(wrong);await f.page.locator('#btn-verify-email').click();
 await f.page.waitForFunction(()=>document.getElementById('verify-error').classList.contains('show'));
 assert.equal((await f.pending()).id,p.id);
 assert.equal((await ctx.db.query('SELECT intentos FROM registros_correo_pendientes WHERE id=$1',[p.id])).rows[0].intentos,1);
 await ctx.db.query("UPDATE registros_correo_pendientes SET codigo_vence_en=clock_timestamp()-INTERVAL '1 second' WHERE id=$1",[p.id]);
 await ctx.adelantarEnvios();await f.check();
 await f.page.waitForFunction(()=>document.getElementById('verify-code-hint').textContent.includes('El código venció'));
 assert.equal(await f.page.locator('#btn-verify-email').isDisabled(),true);
 await f.page.locator('#btn-resend-email').click();
 await f.page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('hm_email_pending')).estadoEnvio==='en_cola');
 await deliver(p.id);await f.check();
 await f.page.waitForFunction(()=>!document.getElementById('btn-verify-email').disabled);
 await f.page.locator('#verify-code').fill(ctx.codigo(f.account.correo));await f.page.locator('#btn-verify-email').click();
 await f.page.waitForFunction(()=>document.getElementById('view-dashboard').classList.contains('active'));
 assert.equal(f.calls.some(c=>c.path==='/api/auth/login'),false,'Sin reutilizar contraseña para otro login');
 assert.equal(await f.page.locator('#reg-pass').inputValue(),'');
 assert.equal(await f.page.locator('#verify-code').inputValue(),'');
 assert.equal(await f.page.evaluate(()=>localStorage.getItem('hm_token') || sessionStorage.getItem('hm_token')),null);
 assert.equal(await f.pending(),null);
});

test('Respuesta de servidor anterior sin token conserva login normal; estado público no establece sesión',async t=>{
 const f=await fixture(t,{legacyVerification:true});await f.register();const p=await waitPending(f);
 await deliver(p.id);await f.check();await f.page.waitForFunction(()=>!document.getElementById('btn-verify-email').disabled);
 await f.page.locator('#verify-code').fill(ctx.codigo(f.account.correo));await f.page.locator('#btn-verify-email').click();
 await f.page.waitForFunction(()=>!document.getElementById('login-form').hidden);
 assert.equal(await f.page.locator('#suministro').inputValue(),f.account.numero_suministro);
 assert.equal(await f.page.locator('#password').inputValue(),'');
 assert.equal(await f.page.evaluate(()=>document.getElementById('view-dashboard').classList.contains('active')),false);
 assert.equal(await f.pending(),null);
});

test('Cliente publicado v1.1.1 acepta respuesta ampliada y conserva verificación seguida de login',async t=>{
 const f=await fixture(t,{legacy:'v1.1.1'});await f.register();const p=await waitPending(f);
 await deliver(p.id);await f.check();await f.page.waitForFunction(()=>!document.getElementById('btn-verify-email').disabled);
 await f.page.locator('#verify-code').fill(ctx.codigo(f.account.correo));await f.page.locator('#btn-verify-email').click();
 await f.page.waitForFunction(()=>!document.getElementById('login-form').hidden);
 assert.equal(await f.page.locator('#suministro').inputValue(),f.account.numero_suministro);
 await f.page.locator('#password').fill(f.account.password);await f.page.locator('#btn-login').click();
 await f.page.waitForFunction(()=>document.getElementById('view-dashboard').classList.contains('active'));
 assert.ok(f.calls.some(c=>c.path==='/api/auth/login'&&c.status===200));
});

test('CORS acepta cabecera de contrato desde https://localhost sin exigirla al login',async()=>{
 const r=await fetch(ctx.base+'/api/auth/register',{method:'OPTIONS',headers:{Origin:origin,
  'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-hidro-auth-contract'}});
 assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),origin);
 assert.match(r.headers.get('access-control-allow-headers'),/x-hidro-auth-contract/i);
});
