'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),pkg='pe.edu.hidromejora.app.lab120',activity=pkg+'/pe.edu.hidromejora.app.MainActivity';
const serial=process.env.HIDRO_NATIVE_SERIAL||'emulator-5586',adb=process.env.HIDRO_ADB||path.join(os.homedir(),'Android/Sdk/platform-tools/adb');
const {_android}=require(process.env.HIDRO_PLAYWRIGHT_MODULE);
const base='http://127.0.0.1:45679',pause=ms=>new Promise(r=>setTimeout(r,ms));
function android(...args){return execFileSync(adb,['-s',serial,...(args[0]==='shell'?['shell',...args.slice(1).map(v=>"'"+String(v).replace(/'/g,"'\\''")+"'")]:args)],{encoding:'utf8',timeout:30000});}
async function until(fn,label,timeout=30000){const end=Date.now()+timeout;while(!await fn()){assert.ok(Date.now()<end,'Timeout: '+label);await pause(100);}}
(async()=>{
 assert.match(serial,/^emulator-\d+$/);assert.match(android('emu','avd','name'),/^hm_physical_api35\r?\n/);
 const candidate=JSON.parse(fs.readFileSync(process.env.HIDRO_LAB_CANDIDATE,'utf8'));
 assert.equal(candidate.applicationId,pkg);assert.equal(candidate.firebaseConfigured,false);
 const apk=fs.realpathSync(candidate.apk);assert.ok(apk.startsWith(path.join(root,'artifacts/android-physical-lab-')));
 assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(apk)).digest('hex'),candidate.sha256);
 const accounts=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.local/share/hidromejora/android-lab-120/private/lab-accounts.json'),'utf8'));
 const officialPath=()=>{try{return android('shell','pm','path','pe.edu.hidromejora.app').trim();}catch(_){return '';}};
 const baseline=process.argv.includes('--tutorial-baseline');
 const output=fs.mkdtempSync(path.join(root,'artifacts/physical-native-'));fs.chmodSync(output,0o700);
 const report={applicationId:pkg,baseline,checks:[],externalRequests:[],physicalDeviceOperated:false};
 const ok=s=>{report.checks.push(s);console.log('OK: '+s);};let device,page;
 const shot=name=>fs.writeFileSync(path.join(output,name+'.png'),execFileSync(adb,['-s',serial,'exec-out','screencap','-p']),{mode:0o600});
 async function attach(){
  const devices=await _android.devices({omitDriverInstall:true});device=devices.find(d=>d.serial()===serial);assert.ok(device);for(const d of devices)if(d!==device)await d.close();
  page=await(await device.webView({pkg})).page();page.setDefaultTimeout(30000);await page.waitForFunction(()=>document.readyState==='complete');
  page.on('request',req=>{const url=new URL(req.url());if(['http:','https:','ws:','wss:'].includes(url.protocol)&&!['127.0.0.1','localhost'].includes(url.hostname))report.externalRequests.push(url.origin);});
 }
 async function detach(){if(device){await device.close();device=null;}}
 async function restart(){await detach();android('shell','am','force-stop',pkg);android('shell','am','start','-n',activity);await attach();}
 async function dashboard(){await page.waitForFunction(()=>document.getElementById('view-dashboard').classList.contains('active'));}
 async function settle(){await until(()=>page.evaluate(()=>localStorage.getItem('hm_tutorial_seen')==='1'||document.body.classList.contains('tutorial-open')),'tutorial o preferencia');if(await page.evaluate(()=>document.body.classList.contains('tutorial-open')))await page.locator('#spot-skip-mobile:visible, #spot-skip:visible').first().click();await until(()=>page.evaluate(()=>!document.body.classList.contains('tutorial-open')&&!document.getElementById('hb-fab').disabled),'tutorial cerrado');}
 async function login(a){await page.locator('#suministro').fill(a.supply);await page.locator('#password').fill(a.password);await page.locator('#btn-login').click();await dashboard();}
 try{
  assert.equal(android('shell','getprop','ro.build.version.sdk').trim(),'35');
  report.officialPackageBefore=officialPath();
  android('reverse','tcp:45679','tcp:45679');android('install','-r',apk);
  if(!baseline){
   const testApk=path.join(path.dirname(path.dirname(path.dirname(apk))),'apk/androidTest/lab/app-lab-androidTest.apk');
   android('install','-r',testApk);
   const output=android('shell','am','instrument','-w','-e','class','pe.edu.hidromejora.app.LaboratoryInstrumentedTest,pe.edu.hidromejora.app.SecureStateInstrumentedTest','-e','hidroSecureFixture','1',pkg+'.test/androidx.test.runner.AndroidJUnitRunner');
   fs.writeFileSync(path.join(path.dirname(apk),'lab-instrumentation.txt'),output,{mode:0o600});assert.match(output,/OK \(3 tests\)/);ok('Instrumentación LAB: identidad, backup, transporte y Keystore real');
  }
  android('shell','am','force-stop',pkg);android('shell','am','start','-n',activity);await attach();shot('login');
  if(await page.locator('#login-form:visible').count())await login(accounts[0]);else await dashboard();
  if(baseline){
   await until(()=>page.evaluate(()=>document.body.classList.contains('tutorial-open')),'tutorial inicial');shot('tutorial-before');
   await page.locator('#spot-skip-mobile:visible, #spot-skip:visible').first().click();
   // El cierre observable precede al force-stop, sin flush/pausa artificial de Web Storage.
   await until(()=>page.evaluate(()=>!document.body.classList.contains('tutorial-open')),'cierre voluntario');
   await restart();await dashboard();await until(()=>page.evaluate(()=>!document.getElementById('hb-fab').disabled),'carga tras cierre rápido');await pause(700);
   report.tutorialReappeared=await page.evaluate(()=>document.body.classList.contains('tutorial-open'));shot('tutorial-restart-before');
   report.result='observed';console.log('Tutorial reapareció: '+report.tutorialReappeared);return;
  }
  await settle();assert.equal(await page.locator('aside[aria-label="Entorno de pruebas"]').innerText(),'LAB · 1.2.0 · Datos sintéticos');shot('dashboard');ok('Identificación LAB visible y login real por USB reverse a PostgreSQL aislado');
  for(let i=0;i<5;i++){
   // Replay siempre disponible; la confirmación debe preceder al cierre visual.
   await page.locator('#btn-replay-tutorial').click();await until(()=>page.evaluate(()=>document.body.classList.contains('tutorial-open')),'replay real');
   await page.locator('#spot-skip-mobile:visible, #spot-skip:visible').first().click();await until(()=>page.evaluate(()=>!document.body.classList.contains('tutorial-open')),'cierre durable');
   await restart();await dashboard();await until(()=>page.evaluate(()=>!document.getElementById('hb-fab').disabled),'datos tras reinicio');await pause(300);
   assert.equal(await page.evaluate(()=>document.body.classList.contains('tutorial-open')),false);assert.equal(await page.evaluate(()=>localStorage.getItem('hm_tutorial_seen')),'1');
  }ok('Cinco cierres voluntarios y reinicios rápidos conservan preferencia del tutorial; replay disponible');shot('tutorial-restart-after');
  const token=await page.evaluate(()=>HMNativeState.readSession().then(s=>s.token));assert.ok(token);
  const req=async(route,opt={})=>fetch(base+route,{...opt,headers:{Authorization:'Bearer '+token,...opt.headers}});
  assert.equal((await req('/api/auth/session')).status,200);
  assert.equal((await req('/api/admin/resumen')).status,403);ok('Sesión REST autorizada y rol cliente rechazado por Admin');
  for(const [section,name]of [['historial','recibos'],['incidencias','incidencias'],['notificaciones','notificaciones'],['perfil','perfil'],['ayuda','atencion']]){
   await page.evaluate(s=>document.querySelector('[data-sec="'+s+'"]').click(),section);await page.locator('#sec-'+section).waitFor({state:'visible'});shot(name);
  }ok('Navegación auténtica: recibos, incidencias, notificaciones, perfil y atención');
  assert.equal(await page.evaluate(async()=>(await Capacitor.nativePromise('HidroPushState','configuration',{})).configured),false);ok('FCM nativo desactivado, sin registro ni permiso automático');
  assert.deepEqual(report.externalRequests,[]);assert.equal(officialPath(),report.officialPackageBefore);ok('Sin solicitudes externas ni modificación del paquete oficial');
  await page.evaluate(()=>document.getElementById('btn-logout').click());await page.locator('#login-form').waitFor({state:'visible'});assert.ok(!(await page.evaluate(()=>HMNativeState.readSession())).token);
  await login(accounts[1]);await settle();assert.equal(await page.locator('#supply-label').innerText(),accounts[1].supply);ok('Logout retira credencial y cambio de cuenta conserva aislamiento');
  report.result='passed';
 }catch(e){report.result='failed';report.error=String(e.message).replace(/Bearer\s+\S+/g,'Bearer [redactado]');throw e;
 }finally{await detach();fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2),{mode:0o600});console.log('Evidencia: '+output);}
})().catch(()=>{console.error('Prueba nativa detenida; consulta el informe privado.');process.exitCode=1;});
