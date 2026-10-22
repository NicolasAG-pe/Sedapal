'use strict';
// WebView Android real. Solo AVD dedicado + base nueva; no .env ni proveedor real.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync,spawnSync}=require('node:child_process');
const {iniciar}=require('../../Backend/test/email-api.cjs');
const root=path.resolve(__dirname,'../..'),pkg='pe.edu.hidromejora.app';
const serial=process.env.HIDRO_NATIVE_SERIAL || 'emulator-5582';
const adb=process.env.HIDRO_ADB || path.join(process.env.ANDROID_HOME || path.join(os.homedir(),'Android/Sdk'),'platform-tools/adb');
const {_android}=require(process.env.HIDRO_PLAYWRIGHT_MODULE || path.join(root,'artifacts/vercel-validation/tools/node_modules/playwright'));
const jwt=require(path.join(root,'Backend/node_modules/jsonwebtoken'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function android(...args){
 // adb shell vuelve a interpretar los argumentos: proteger también nombres con espacios/paréntesis.
 const command=args[0]==='shell'?['shell',...args.slice(1).map(v=>"'"+String(v).replace(/'/g,"'\\''")+"'")]:args;
 return execFileSync(adb,['-s',serial,...command],{encoding:'utf8',timeout:30000});
}
async function until(fn,label,timeout=25000){const end=Date.now()+timeout;while(!await fn()){assert.ok(Date.now()<end,'Timeout: '+label);await pause(100);}}

(async()=>{
 assert.match(serial,/^emulator-\d+$/,'No operar teléfonos físicos');
 assert.match(android('emu','avd','name'),/^hm_110_debug_api35\r?\n/,'AVD dedicado obligatorio');
 const output=fs.mkdtempSync(path.join(root,'artifacts/android-session-native-'));fs.chmodSync(output,0o700);
 const report={androidNative:true,checks:[],errors:[],applicationId:pkg};
 const ok=label=>{report.checks.push(label);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log('OK: '+label);};
 const ctx=await iniciar({autoDrain:false});let device,page;
 let sessionRequests=0;
 ctx.httpServer.on('request',req=>{if(req.method==='GET'&&req.url==='/api/auth/session')sessionRequests++;});
 const supplyA='900000711',supplyB='900000712',password=ctx.registro(711).password;
 const screenshot=name=>fs.writeFileSync(path.join(output,name+'.png'),execFileSync(adb,['-s',serial,'exec-out','screencap','-p'],{timeout:30000}));
 async function attach(){
  const devices=await _android.devices({omitDriverInstall:true});device=devices.find(d=>d.serial()===serial);assert.ok(device,'AVD conectado');
  for(const other of devices)if(other!==device)await other.close();
  const view=await device.webView({pkg},{timeout:20000});page=await view.page();page.setDefaultTimeout(25000);
  await page.waitForFunction(()=>document.readyState==='complete',null,{polling:100});
  assert.equal(await page.evaluate(()=>Capacitor.getPlatform()),'android');
 }
 async function detach(){if(device){await device.close();device=null;}}
 async function restart(mode='force-stop'){
  await detach();
  if(mode==='finish'){
   await attach();await page.evaluate(()=>Capacitor.Plugins.App.exitApp());await detach();await pause(300);
  }else if(mode==='kill'){
   const pid=android('shell','pidof',pkg).trim();assert.match(pid,/^\d+$/);
   android('shell','input','keyevent','3');await pause(700);android('shell','am','kill',pkg);await pause(1200);
   let current='';try{current=android('shell','pidof',pkg).trim();}catch(_){}
   if(current===pid){
    // En algunos AVD depurables ActivityManager conserva el proceso. Simular su
    // muerte por señal del kernel solo con el UID propio, nunca en otro proceso.
    android('shell','run-as',pkg,'/system/bin/kill','-9',pid);report.processTermination='SIGKILL del PID propio tras HOME; no LMKD real';
   }else report.processTermination='ActivityManager am kill';
   await until(()=>{try{return android('shell','pidof',pkg).trim()!==pid;}catch(_){return true;}},'proceso anterior terminado');
  }else android('shell','am','force-stop',pkg);
  android('shell','am','start','-n',pkg+'/.MainActivity');await pause(700);await attach();
 }
 async function dashboard(supply){
  await page.waitForFunction(s=>document.getElementById('view-dashboard').classList.contains('active')&&document.getElementById('supply-label').textContent===s,supply);
  await until(()=>ctx.io.engine.clientsCount===1,'un único Socket.IO');
 }
 async function loginScreen(){await page.waitForFunction(()=>!document.getElementById('login-form').hidden&&document.getElementById('session-restore').hidden);}
 async function login(supply){
  await loginScreen();await page.locator('#suministro').fill(supply);await page.locator('#password').fill(password);await page.locator('#btn-login').click();await dashboard(supply);
  // Omitir tutorial por su control real, sin hacer persistente ningún JWT de prueba.
  await pause(800);
  if(await page.locator('#spot-skip-mobile').isVisible())await page.locator('#spot-skip-mobile').click();
  else if(await page.locator('#spot-skip').isVisible())await page.locator('#spot-skip').click();
 }
 async function saved(){return page.evaluate(()=>HMNativeState.readSession());}
 async function setSaved(token){await page.evaluate(t=>HMNativeState.writeSession(t),token);}
 async function noPlainToken(){
  const clean=await page.evaluate(()=>sessionStorage.getItem('hm_token')===null&&localStorage.getItem('hm_token')===null);
  assert.ok(clean,'No JWT en Web Storage'); // Tampoco incluir el valor en un fallo de aserción.
 }
 async function logout(){await page.evaluate(()=>document.getElementById('btn-logout').click());await loginScreen();assert.ok(!(await saved()).token,'Credencial retirada');await noPlainToken();}
 try{
  report.database=ctx.connection.database;
  const env={...process.env,API_BASE_URL:ctx.base.replace('127.0.0.1','10.0.2.2')};
  for(const [command,args,name]of [[process.execPath,['scripts/sync-android.cjs'],'sync.log'],['bash',['scripts/android-gradle.sh','--no-daemon','--console=plain','-PhidroBuildDir='+path.join(output,'app'),':app:assembleDebug',':app:assembleDebugAndroidTest'],'build.log']]){
   const r=spawnSync(command,args,{cwd:root,env,encoding:'utf8',maxBuffer:32*1024*1024});fs.writeFileSync(path.join(output,name),(r.stdout||'')+(r.stderr||''),{mode:0o600});assert.equal(r.status,0,'Compilación '+name);
  }
  android('install','-r',path.join(output,'app/outputs/apk/debug/app-debug.apk'));
  android('install','-r',path.join(output,'app/outputs/apk/androidTest/debug/app-debug-androidTest.apk'));
  const instrument=android('shell','am','instrument','-w','-e','class','pe.edu.hidromejora.app.SecureStateInstrumentedTest','-e','hidroSecureFixture','1',pkg+'.test/androidx.test.runner.AndroidJUnitRunner');
  fs.writeFileSync(path.join(output,'instrumentation.txt'),instrument);assert.match(instrument,/OK \(1 test\)/);ok('Android Keystore: clave no exportable, GCM/IV distinto, alteración rechazada y borrado confirmado');
  if(process.argv.includes('--otp')){
   android('shell','am','start','-n',pkg+'/.MainActivity');await attach();
   await require('./android-otp-native.cjs')({ctx,getPage:()=>page,restart,until,ok,screenshot});
   report.result='passed';return;
  }
  if(process.argv.includes('--location')){
   android('shell','am','start','-n',pkg+'/.MainActivity');await attach();
   await require('./android-location-native.cjs')({ctx,getPage:()=>page,android,restart,until,ok,screenshot,login,output});
   report.result='passed';return;
  }
  for(const n of [711,712]){
   const account=ctx.registro(n),pending=(await ctx.request('register',account,202)).data;await ctx.drain();await ctx.request('verify-email',ctx.verificar(pending.registro_id,ctx.codigo(account.correo)),201);
  }
  await ctx.db.query("UPDATE usuarios SET correo_verificado_en=NULL WHERE correo='cliente711@example.invalid'");
  android('shell','am','start','-n',pkg+'/.MainActivity');await attach();await login(supplyA);await noPlainToken();
  const tokenA=(await saved()).token;assert.ok(typeof tokenA==='string'&&tokenA.length>50);
  const ciphertext=execFileSync(adb,['-s',serial,'exec-out','run-as',pkg,'cat','no_backup/hm-secure-v1/session.bin']);assert.ok(!ciphertext.includes(Buffer.from(tokenA)),'JWT no aparece en ciphertext');
  ok('Primer login y cuenta histórica: JWT persistido cifrado, sin copias en localStorage/sessionStorage');
  for(const mode of ['finish','force-stop','kill']){
   const before=sessionRequests;await restart(mode);await dashboard(supplyA);assert.equal(sessionRequests-before,1,'Una sola validación remota');await noPlainToken();ok('Restauración nativa tras '+mode+': validación remota única y un socket');
  }
  const claims=jwt.decode(tokenA);const expired=jwt.sign({...claims,exp:Math.floor(Date.now()/1000)-1},process.env.AUTH_TOKEN_SECRET);
  await setSaved(expired);await restart();await loginScreen();assert.ok(!(await saved()).token);ok('JWT expirado: se retira la credencial y no se muestran datos privados');
  const altered=tokenA.split('.');altered[2]=(altered[2].startsWith('a')?'b':'a')+altered[2].slice(1);
  await setSaved(altered.join('.'));await restart();await loginScreen();assert.ok(!(await saved()).token);ok('JWT alterado: backend rechaza y Android limpia credencial');
  await login(supplyA);await ctx.db.query("UPDATE usuarios SET activo=false WHERE correo='cliente711@example.invalid'");await restart();await loginScreen();assert.ok(!(await saved()).token);ok('Cuenta deshabilitada: 403 impide restauración y elimina credencial');
  await ctx.db.query("UPDATE usuarios SET activo=true WHERE correo='cliente711@example.invalid'");await login(supplyA);await logout();await restart();await loginScreen();assert.ok(!(await saved()).token);ok('Logout confirmado sigue cerrado después de reabrir Android');
  await login(supplyA);await logout();await login(supplyB);await page.evaluate(()=>document.querySelector('[data-sec="perfil"]').click());
  await page.waitForFunction(()=>document.getElementById('pf-correo').textContent==='cliente712@example.invalid');assert.ok(!await page.evaluate(()=>document.body.textContent.includes('cliente711@example.invalid')));ok('Cambio de cuenta: Perfil y socket pertenecen solo a la segunda identidad');
  const tokenB=(await saved()).token;
  report.stage='offline attach';
  await detach();android('shell','am','force-stop',pkg);android('shell','svc','wifi','disable');android('shell','svc','data','disable');android('shell','am','start','-n',pkg+'/.MainActivity');await attach();
  report.stage='offline feedback';
  await until(()=>page.evaluate(()=>!document.getElementById('session-retry').hidden),'mensaje sin conexión');assert.equal(await page.evaluate(()=>document.getElementById('view-dashboard').classList.contains('active')),false);assert.ok((await saved()).token===tokenB,'Sin red conserva credencial cifrada');screenshot('offline-restore');
  const before=sessionRequests;android('shell','svc','wifi','enable');report.stage='network return';
  // svc wifi enable confirma el comando, no que DHCP/ruta ya sean utilizables.
  await until(()=>page.evaluate(async()=>{try{return(await fetch(HMShared.apiUrl('/api/auth/capabilities'),{signal:AbortSignal.timeout(1000)})).ok;}catch(_){return false;}}),'red nuevamente operativa');
  if(await page.locator('#session-retry').isVisible())await page.evaluate(()=>{document.getElementById('session-retry').click();document.getElementById('session-retry').click();});
  report.stage='dashboard after reconnect';
  await dashboard(supplyB);assert.equal(sessionRequests-before,1);ok('Sin internet no hay datos privados; reconexión/reintento visible hacen una sola restauración');
  const logs=execFileSync(adb,['-s',serial,'logcat','-d'],{encoding:'utf8',maxBuffer:32*1024*1024});assert.ok(!logs.includes(tokenA)&&!logs.includes(tokenB)&&!logs.includes(password),'No credenciales en logcat');ok('Logcat sin JWT ni contraseña del flujo; logging del bridge desactivado también en debug');
  await logout();report.result='passed';
 }catch(error){
  report.result='failed';report.errors.push(error.message);
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2),{mode:0o600});
  console.error('Fallo antes de limpieza: '+error.message);throw error;
 }
 finally{
  try{android('shell','svc','wifi','enable');}catch(_){}
  // Al terminar, detener solo la app del AVD dedicado: su reconexión puede impedir
  // cerrar el servidor HTTP del fixture. No borrar datos ni modificar otros procesos.
  try{android('shell','am','force-stop',pkg);}catch(_){}
  await detach();await ctx.close();fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2),{mode:0o600});console.log('Evidencia local: '+path.relative(root,output));
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
