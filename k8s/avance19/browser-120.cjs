'use strict';
process.umask(0o077);
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const state=path.resolve(__dirname,'../../artifacts/kubernetes-avance-19/state');
const {chromium}=require(process.env.HIDRO_PLAYWRIGHT_MODULE);
const accounts=JSON.parse(fs.readFileSync(path.join(state,'accounts.json')));
const web='http://localhost:8084',adminBase='http://localhost:8085';
const report={date:new Date().toISOString(),checks:[],errors:[],assetFailures:[],externalRequests:[],pdfs:[]};
const ok=s=>{report.checks.push(s);console.log('OK: '+s);};
async function wait(fn,label){const end=Date.now()+20000;while(!await fn()){assert.ok(Date.now()<end,'Timeout: '+label);await new Promise(r=>setTimeout(r,100));}}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1366,height:900},reducedMotion:'reduce',acceptDownloads:true});
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(['localhost','127.0.0.1'].includes(u.hostname)||['data:','blob:'].includes(u.protocol))return route.continue();report.externalRequests.push(u.origin+u.pathname);return route.abort();});
  const page=await context.newPage();page.setDefaultTimeout(20000);
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400&&!r.url().includes('/api/'))report.assetFailures.push(r.url());});
  await page.goto(adminBase);
  await page.locator('#admin-supply').fill(accounts.user.numero_suministro);await page.locator('#admin-password').fill(accounts.user.password);await page.locator('#admin-login-form').evaluate(f=>f.requestSubmit());
  await page.locator('#admin-login-error').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>sessionStorage.getItem('hm_admin_token')),null);
  await page.locator('#admin-supply').fill(accounts.admin.numero_suministro);await page.locator('#admin-password').fill(accounts.admin.password);await page.locator('#admin-login-form').evaluate(f=>f.requestSubmit());await page.locator('#admin-panel').waitFor({state:'visible'});
  for(const section of ['admin','admin-usuarios','admin-recibos','admin-cortes','admin-incidencias','admin-pagos','admin-atencion','admin-cuenta']){
   await page.locator('[data-sec="'+section+'"]').click();await page.waitForFunction(()=>document.querySelector('.dash-sec.active')?.getAttribute('aria-busy')!=='true');
  }
  await page.waitForFunction(email=>document.getElementById('ac-correo').textContent===email,accounts.admin.correo);
  await page.screenshot({path:path.join(state,'admin-120.png'),fullPage:true});
  ok('Admin: usuario rechazado; login y ocho módulos auténticos');
  await page.goto(web);
  await page.evaluate(()=>{window.__sockets=[];const original=window.io;window.io=Object.assign((...args)=>{const s=original(...args);window.__sockets.push(s);return s;},original);});
  await page.locator('#suministro').fill(accounts.user.numero_suministro);await page.locator('#password').fill(accounts.user.password);await page.locator('#login-form').evaluate(f=>f.requestSubmit());
  await page.locator('#view-dashboard.active').waitFor({state:'visible'});
  await wait(()=>page.evaluate(()=>window.__sockets.filter(s=>s.connected).length===1),'Socket cliente');
  await page.waitForFunction(()=>document.getElementById('cards').querySelector('.card')&&!document.getElementById('btn-login').disabled);
  // El contexto nuevo aún no tiene preferencia; esperar el inicio asíncrono real.
  await page.locator('#spotlight-pop.open').waitFor({state:'visible'});
  await page.locator('#spot-skip').click();
  await wait(()=>page.evaluate(()=>!document.body.classList.contains('tutorial-open')),'tutorial cerrado');
  await require('../../scripts/test/chatbot-ui-checks.cjs')({client:{click:s=>page.locator(s).click(),fill:(s,v)=>page.locator(s).fill(v),evaluate:e=>page.evaluate(e)},wait,ok});
  const login=await fetch(adminBase+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(accounts.admin)});assert.equal(login.status,200);const admin=await login.json();
  const marker='K120UI-'+Date.now().toString().slice(-10);
  const cr=await fetch(adminBase+'/api/admin/recibos',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+admin.token},body:JSON.stringify({numero_suministro:accounts.user.numero_suministro,periodo:marker,fecha_emision:'2026-10-02',fecha_vencimiento:'2030-11-02',monto:42,consumo_m3:11})});assert.equal(cr.status,201);
  await page.locator('#sidebar [data-sec="historial"]').click();await page.waitForFunction(m=>document.getElementById('cards').textContent.includes(m),marker);
  await page.evaluate(m=>[...document.querySelectorAll('#cards .card')].find(n=>n.textContent.includes(m)).querySelector('[data-act=detail]').click(),marker);
  async function pdf(selector,name){const download=page.waitForEvent('download');await page.locator(selector).click();const d=await download;const file=path.join(state,name);await d.saveAs(file);const b=fs.readFileSync(file);assert.equal(b.subarray(0,5).toString(),'%PDF-');assert.ok(b.length>1000);report.pdfs.push({file:name,bytes:b.length});}
  await pdf('#btn-pdf','recibo-120-sintetico.pdf');
  await page.locator('#btn-pay-detail').click();await page.locator('#pay-confirm').click();await page.waitForFunction(()=>!document.getElementById('pay-success').hidden);
  assert.match(await page.locator('#pay-success-text').innerText(),/no se ha acreditado dinero real/i);
  await pdf('#pay-constancia','constancia-120-sintetica.pdf');
  await page.locator('#pay-done').click();await page.locator('#detail-close').click();
  ok('Recibo en tiempo real, PDF real y operación demostrativa/constancia sin acreditar fondos');
  for(const section of ['perfil','incidencias','cortes','notificaciones','pagos']){
   await page.locator('#sidebar [data-sec="'+section+'"]').click();await page.waitForFunction(s=>document.getElementById('sec-'+s).classList.contains('active'),section);
  }
  await page.screenshot({path:path.join(state,'client-120-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(state,'client-120-mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>window.__sockets.filter(s=>s.connected).length),1);
  await page.evaluate(()=>document.getElementById('btn-logout').click());await page.waitForFunction(()=>!document.getElementById('login-form').hidden);
  assert.equal(await page.evaluate(()=>window.__sockets.filter(s=>s.connected).length),0);assert.equal(await page.evaluate(()=>sessionStorage.getItem('hm_token')),null);
  ok('Navegación cliente, un Socket.IO y cierre de sesión limpio');
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.assetFailures,[]);assert.deepEqual(report.externalRequests,[]);
  ok('Sin errores JavaScript, assets ausentes ni solicitudes a servicios externos');report.status='passed';
 }catch(e){report.status='failed';report.error=e.message;throw e;}
 finally{await browser.close();fs.writeFileSync(path.join(state,'browser-120.json'),JSON.stringify(report,null,2),{mode:0o600});}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
