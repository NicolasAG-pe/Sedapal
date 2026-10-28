'use strict';
// Pantallas originales contra API/socket Unix del contenedor privado restaurado.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {buildWeb}=require('../build-web');
const root=path.resolve(__dirname,'../..'),output=fs.realpathSync(process.argv[2]||'');
assert.ok(output.startsWith(path.join(root,'artifacts/production-payments-compat-')));
assert.equal(JSON.parse(fs.readFileSync(path.join(output,'restore-result.json'))).result,'passed');
const {chromium}=require(process.env.HIDRO_PLAYWRIGHT_MODULE);
const fixtures=JSON.parse(fs.readFileSync(path.join(output,'fixtures.private.json'))),api='https://payments.compat.fixture';
// sockaddr_un admite rutas cortas: usar descriptor del directorio, sin enlaces globales.
const directoryFd=fs.openSync(output,'r'),socketPath='/proc/self/fd/'+directoryFd+'/api.sock';
const report={checks:[],errors:[],unexpectedOrigins:[],calls:[],socketIoRechecked:false};let browser;
const check=name=>report.checks.push(name);
function forward(request){return new Promise((resolve,reject)=>{
 const u=new URL(request.url()),req=http.request({socketPath,path:u.pathname+u.search,method:request.method(),headers:{'Content-Type':'application/json','X-Forwarded-For':'192.0.2.89',...(request.headers().origin?{Origin:request.headers().origin}:{}),...(request.headers().authorization?{Authorization:request.headers().authorization}:{})}},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,headers:{'Content-Type':res.headers['content-type']||'application/json','Access-Control-Allow-Origin':request.headers().origin||'https://localhost'},body:Buffer.concat(chunks)}));});req.on('error',reject);req.end(request.postDataBuffer()||undefined);
});}
(async()=>{
 const dir=fs.mkdtempSync(path.join(output,'browser-'));fs.chmodSync(dir,0o700);const runtimes={};
 for(const type of ['android','admin']){runtimes[type]=path.join(dir,type);buildWeb(type,{API_BASE_URL:api},runtimes[type]);}
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 async function page(type){
  const origin=type==='admin'?'https://admin.compat.fixture':'https://localhost',context=await browser.newContext({viewport:type==='admin'?{width:1366,height:768}:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('**/*',route=>{report.unexpectedOrigins.push(new URL(route.request().url()).origin);return route.abort();});
  await page.route(origin+'/**',route=>{
   const name=new URL(route.request().url()).pathname;
   if(name.endsWith('/socket.io.min.js'))return route.fulfill({contentType:'application/javascript',body:'window.io=()=>({on(){return this},off(){return this},removeAllListeners(){},disconnect(){}});'});
   const file=path.resolve(runtimes[type],'.'+(name==='/'?'/index.html':name));assert.ok(file.startsWith(runtimes[type]+path.sep));const mime={'.js':'application/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
   return route.fulfill({status:fs.existsSync(file)?200:404,contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.existsSync(file)?fs.readFileSync(file):''});
  });
  await page.route(api+'/**',async route=>{let result;try{result=await forward(route.request());}catch(error){report.errors.push('Proxy privado: '+error.code);return route.abort();}report.calls.push({path:new URL(route.request().url()).pathname,method:route.request().method(),status:result.status});await route.fulfill(result);});
  await page.goto(origin);return page;
 }
 const client=await page('android'),admin=await page('admin');
 async function login(p,a,isAdmin){await p.locator(isAdmin?'#admin-supply':'#suministro').fill(a.supply);await p.locator(isAdmin?'#admin-password':'#password').fill(a.password);await p.locator(isAdmin?'#admin-login-submit':'#btn-login').click();await p.waitForFunction(admin=>admin?!document.getElementById('admin-panel').hidden:document.getElementById('view-dashboard').classList.contains('active'),isAdmin);}
 await login(client,fixtures.accounts[0],false);
 await client.waitForFunction(()=>document.body.classList.contains('tutorial-open')||localStorage.getItem('hm_tutorial_seen')==='1');if(await client.evaluate(()=>document.body.classList.contains('tutorial-open')))await client.locator('#spot-skip-mobile:visible, #spot-skip:visible').first().click();
 await client.evaluate(()=>document.querySelector('[data-sec="historial"]').click());
 const receipt=client.locator('#cards .card').filter({hasText:fixtures.period});await receipt.locator('[data-act="pay"]').click();await client.waitForFunction(()=>!document.getElementById('pay-confirm').disabled);
 assert.equal(await client.locator('input[value="yape_manual"]').isDisabled(),true);await client.locator('#pay-confirm').click();await client.waitForFunction(()=>!document.getElementById('pay-success').hidden);assert.match(await client.locator('#pay-success-text').innerText(),/Operación registrada/);await client.locator('#pay-done').click();
 check('Cliente390×844 registra demostración real sobre014, con Yape cerrado');
 await client.evaluate(()=>document.querySelector('[data-sec="pagos"]').click());const card=client.locator('#pay-list').getByText(fixtures.period,{exact:false}).first();await card.waitFor();await client.locator('#pay-list').getByRole('button',{name:'Ver estado e historial',exact:true}).first().click();await client.waitForFunction(()=>document.getElementById('pay-list').textContent.includes('sin acreditación')||document.getElementById('pay-list').textContent.toLowerCase().includes('demostrativ'));
 await client.screenshot({path:path.join(dir,'client-payments.png'),fullPage:true});check('Estado e historial de demostraciones visibles sin acreditación bancaria');
 await login(admin,fixtures.accounts[2],true);await admin.locator('#admin-nav [data-sec="admin-pagos"]').click();await admin.locator('[data-tab="historial"]').click();await admin.locator('#operation-search').fill(fixtures.accounts[0].supply);await admin.locator('#operation-method').selectOption('demostrativo');await admin.waitForFunction(()=>document.querySelectorAll('#admin-operation-list [data-operation]').length>=2);await admin.locator('#admin-operation-list [data-operation] button').first().click();await admin.locator('#operation-history details').waitFor();await admin.locator('#operation-history summary').click();assert.match(await admin.locator('#operation-summary').innerText(),/no acredita fondos ni cancela una deuda/);assert.equal(await admin.locator('#operation-review button[type="submit"]').count(),0);await admin.locator('dialog.payment-dialog').screenshot({path:path.join(dir,'admin-payments.png')});check('Admin1366×768: filtros combinados, tabla e historial, sin revisión ni acreditación habilitada');
 assert.ok(report.calls.some(c=>c.path==='/api/me/operaciones-pago'&&c.method==='POST'&&c.status===201));assert.ok(report.calls.some(c=>c.path==='/api/admin/operaciones-pago'&&c.status===200));assert.ok(!report.calls.some(c=>c.status>=500));assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpectedOrigins,[]);check('UI→REST→PostgreSQL→UI sin500, errores JS ni salidas externas');report.result='passed';report.evidence=path.basename(dir);
})().catch(error=>{report.result='failed';fs.writeFileSync(path.join(output,'browser-failure.private.txt'),String(error.stack||error),{mode:0o600});process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();fs.closeSync(directoryFd);fs.writeFileSync(path.join(output,'browser-result.json'),JSON.stringify(report,null,2),{mode:0o600});console.log('Prueba de pagos UI: '+report.result);});
