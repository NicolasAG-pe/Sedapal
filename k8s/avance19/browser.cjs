'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),state=path.join(root,'artifacts/kubernetes-avance-19/state');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(root,'artifacts/vercel-validation/browsers');
const {chromium}=require(process.env.HIDRO_PLAYWRIGHT_MODULE || path.join(root,'artifacts/vercel-validation/tools/node_modules/playwright'));
const accounts=JSON.parse(fs.readFileSync(path.join(state,'accounts.json'))),web='http://localhost:8084',adminBase='http://localhost:8085';
const report={checks:[],errors:[],assets:[]};
const ok=text=>{report.checks.push(text);console.log('OK: '+text);};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn,label){const end=Date.now()+20000;while(!await fn()){assert.ok(Date.now()<end,'Timeout: '+label);await pause(100);}}
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1366,height:900},reducedMotion:'reduce'});
  const page=await context.newPage();page.setDefaultTimeout(20000);
  page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().includes('/api/'))report.assets.push(r.url());});
  await page.goto(adminBase);
  await page.locator('#admin-supply').fill(accounts.user.numero_suministro);await page.locator('#admin-password').fill(accounts.user.password);await page.locator('#admin-login-form').evaluate(f=>f.requestSubmit());
  await page.locator('#admin-login-error').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>sessionStorage.getItem('hm_admin_token')),null);
  await page.locator('#admin-supply').fill(accounts.admin.numero_suministro);await page.locator('#admin-password').fill(accounts.admin.password);await page.locator('#admin-login-form').evaluate(f=>f.requestSubmit());
  await page.locator('#admin-panel').waitFor({state:'visible'});
  for(const section of ['admin-usuarios','admin-recibos','admin-cortes','admin-incidencias','admin-pagos','admin-atencion','admin-cuenta']){
   await page.locator('[data-sec="'+section+'"]').click();await page.waitForFunction(()=>document.querySelector('.dash-sec.active')?.getAttribute('aria-busy')!=='true');
  }
  await page.waitForFunction(email=>document.getElementById('ac-correo').textContent===email,accounts.admin.correo);
  await page.screenshot({path:path.join(state,'admin-desktop.png'),fullPage:true});
  ok('Admin: usuario rechazado, login admin y siete módulos reales mediante Kubernetes');
  await page.goto(web);
  await page.evaluate(()=>{window.__sockets=[];window.__events=[];const originalIO=window.io;window.io=Object.assign((...args)=>{const s=originalIO(...args);s.onAny(name=>window.__events.push(name));window.__sockets.push(s);return s;},originalIO);});
  await page.locator('#suministro').fill(accounts.user.numero_suministro);await page.locator('#password').fill(accounts.user.password);await page.locator('#login-form').evaluate(f=>f.requestSubmit());
  await page.locator('#view-dashboard.active').waitFor({state:'visible'});
  await wait(()=>page.evaluate(()=>window.__sockets.filter(s=>s.connected).length===1),'socket cliente');
  await page.waitForFunction(()=>document.getElementById('cards').querySelector('.card')&&!document.getElementById('btn-login').disabled);
  await page.locator('#spotlight-pop.open').waitFor({state:'visible'});
  await page.locator('#spot-skip').click();
  await wait(()=>page.evaluate(()=>!document.body.classList.contains('tutorial-open')),'tutorial cerrado');
  await require('../../scripts/test/chatbot-ui-checks.cjs')({client:{click:s=>page.locator(s).click(),fill:(s,v)=>page.locator(s).fill(v),evaluate:e=>page.evaluate(e)},wait,ok});
  const login=await fetch(adminBase+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(accounts.admin)});assert.equal(login.status,200);const admin=await login.json();
  const marker='K19UI-'+Date.now().toString().slice(-10);
  const created=await fetch(adminBase+'/api/admin/recibos',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+admin.token},body:JSON.stringify({numero_suministro:accounts.user.numero_suministro,periodo:marker,fecha_emision:'2026-10-02',fecha_vencimiento:'2030-11-02',monto:42,consumo_m3:11})});assert.equal(created.status,201);
  await wait(()=>page.evaluate(()=>window.__events.includes('recibo:nuevo')),'evento recibo por WebSocket proxy');
  await page.locator('#sidebar [data-sec="historial"]').click();await page.waitForFunction(m=>document.getElementById('cards').textContent.includes(m),marker);
  await page.evaluate(m=>[...document.querySelectorAll('#cards .card')].find(n=>n.textContent.includes(m)).querySelector('[data-act=detail]').click(),marker);
  await page.locator('#btn-pay-detail').click();await page.locator('#pay-confirm').click();await page.waitForFunction(()=>!document.getElementById('pay-success').hidden);
  await page.locator('#pay-done').click();await page.locator('#detail-close').click();
  ok('Cliente: recibo nuevo llega por Socket.IO y pago confirmado desde la interfaz');
  for(const section of ['perfil','incidencias','cortes','notificaciones','pagos']){
   await page.locator('#sidebar [data-sec="'+section+'"]').click();await page.waitForFunction(s=>document.getElementById('sec-'+s).classList.contains('active'),section);
  }
  await page.screenshot({path:path.join(state,'client-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(state,'client-mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>window.__sockets.filter(s=>s.connected).length),1);
  await page.evaluate(()=>document.getElementById('btn-logout').click());await page.waitForFunction(()=>!document.getElementById('login-form').hidden);
  assert.equal(await page.evaluate(()=>window.__sockets.filter(s=>s.connected).length),0);assert.equal(await page.evaluate(()=>sessionStorage.getItem('hm_token')),null);
  ok('Navegación cliente, un socket y logout limpian sesión sin persistir JWT web');
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.assets,[]);report.status='passed';
 }catch(e){report.status='failed';report.error=e.message;throw e;}
 finally{await browser.close();fs.writeFileSync(path.join(state,'browser.json'),JSON.stringify(report,null,2),{mode:0o600});}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
