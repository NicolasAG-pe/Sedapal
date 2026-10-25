'use strict';
// Web/API/PG/Socket.IO reales, cuentas sintéticas y QR sin receptor bancario.
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawn,execFileSync}=require('node:child_process');
const{chromium,devices}=require('../../artifacts/vercel-validation/tools/node_modules/playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'artifacts/yape-piloto-120');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,message){const end=Date.now()+20000;while(!await fn()){assert.ok(Date.now()<end,message);await pause(100);}}
test('piloto sintético completo: respuesta perdida, comprobación Admin, Socket.IO, PDF y recuperación', {timeout:120000},async()=>{
 const output=execFileSync(process.execPath,['scripts/yape-pilot.cjs','prepare','--synthetic'],{cwd:root,encoding:'utf8'});const statePath=output.trim().split('Estado privado: ')[1];assert.ok(statePath);
 fs.writeFileSync(path.join(out,'e2e-state-path'),statePath,{mode:0o600});
 const state=JSON.parse(fs.readFileSync(statePath)),credentials=JSON.parse(fs.readFileSync(path.join(path.dirname(statePath),'credentials.json'))).accounts;
 const child=spawn(process.execPath,['scripts/yape-pilot.cjs','start','--state',statePath],{cwd:root,stdio:['ignore','pipe','pipe']});let stdout='',stderr='',urls;
 child.stdout.on('data',d=>{stdout+=d;});child.stderr.on('data',d=>{stderr+=d;});let browser;
 try{
  await until(()=>{const line=stdout.split('\n').find(l=>l.startsWith('{"api":'));if(line)urls=JSON.parse(line);return!!urls;},'launcher no inició');
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const client=await browser.newContext({...devices['Pixel 5'],reducedMotion:'reduce'}),admin=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
  const p=await client.newPage(),a=await admin.newPage(),errors=[];for(const page of[p,a]){page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));}
  await p.goto(urls.client);await p.locator('#suministro').fill(credentials[0].supply);await p.locator('#password').fill(credentials[0].password);await p.locator('#btn-login').click();
  await p.waitForFunction(()=>document.getElementById('view-dashboard').classList.contains('active'));await pause(900);for(const sel of['#spot-skip-mobile','#spot-skip'])if(await p.locator(sel).isVisible())await p.locator(sel).click();
  await p.evaluate(()=>document.querySelector('#sidebar [data-sec="historial"]').click());await p.locator('#cards [data-act="pay"]').first().click();await p.waitForFunction(()=>!document.querySelector('input[value="yape_manual"]').disabled);
  await p.locator('input[value="yape_manual"]').check();assert.match(await p.locator('#pay-notice').textContent(),/sintético/);await p.locator('#pay-reference').fill('PILOT-FLOW-0001');
  await p.evaluate(()=>{const original=fetch;window.fetch=async(input,opt)=>{const r=await original(input,opt);if(String(input).endsWith('/api/me/operaciones-pago')&&opt?.method==='POST'){window.fetch=original;await r.arrayBuffer();throw new TypeError('Respuesta perdida por fixture');}return r;};});
  await p.locator('#pay-confirm').click();await p.waitForFunction(()=>document.getElementById('pay-feedback').textContent.includes('historial'));await p.locator('#pay-confirm').click();await p.waitForFunction(()=>!document.getElementById('pay-success').hidden);
  assert.match(await p.locator('#pay-success-text').textContent(),/Pendiente de comprobación/);await p.locator('#pay-done').click();await p.evaluate(()=>document.querySelector('#sidebar [data-sec="pagos"]').click());await p.waitForFunction(()=>document.getElementById('pay-list').textContent.includes('Pendiente de comprobación'));
  await a.goto(urls.admin);await a.locator('#admin-supply').fill(credentials[1].supply);await a.locator('#admin-password').fill(credentials[1].password);await a.locator('#admin-login-submit').click();await a.locator('#admin-nav [data-sec="admin-pagos"]').click();
  const card=a.locator('[data-operation]').filter({hasText:'PILOT-FLOW-0001'});await card.waitFor();
  await card.locator('textarea').fill('Ensayo sintético sin movimiento de dinero');await card.locator('input[id*="monto_recibido"]').fill('1.00');await card.locator('input[id*="referencia_comprobada"]').fill('ERRONEA');
  const local=await a.evaluate(()=>{const d=new Date(Date.now()-1000);return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(d).replace(' ','T');});await card.locator('input[type="datetime-local"]').fill(local);
  for(const checkbox of await card.locator('input[type="checkbox"]').all())await checkbox.check();await card.getByRole('button',{name:'Confirmar revisión manual'}).click();await card.getByText(/Contrasta importe exacto/).waitFor();
  await card.locator('input[id*="referencia_comprobada"]').fill('PILOT-FLOW-0001');await card.getByRole('button',{name:'Confirmar revisión manual'}).click();
  await a.waitForFunction(()=>document.getElementById('admin-operation-list').textContent.includes('Ensayo sintético revisado manualmente'));
  // Sin reload ni nueva navegación del cliente: actualización entregada por Socket.IO real.
  await p.waitForFunction(()=>document.getElementById('pay-list').textContent.includes('Ensayo sintético revisado manualmente'));
  await p.screenshot({path:path.join(out,'client-verified-synthetic.png'),fullPage:true});await a.screenshot({path:path.join(out,'admin-verified-synthetic.png'),fullPage:true});
  const download=p.waitForEvent('download');await p.locator('#pay-list [data-act="const"]').first().click();const d=await download;await d.saveAs(path.join(out,'constancia-e2e-sintetica.pdf'));
  const text=execFileSync('pdftotext',[path.join(out,'constancia-e2e-sintetica.pdf'),'-'],{encoding:'utf8'});assert.ok(text.includes('Ensayo sintético'));assert.ok(text.includes('Recepción comprobada'));
  await p.reload();await p.waitForFunction(()=>!document.getElementById('login-form').hidden); // web no persiste JWT; Android se valida por separado.
  assert.deepEqual(errors,[]);assert.ok(!stderr.includes('Error'));
  fs.writeFileSync(path.join(out,'e2e-result.json'),JSON.stringify({status:'passed',moneyMoved:false,synthetic:true,lostResponse:true,wrongReferenceRejected:true,adminConfirmed:true,realSocketUpdate:true,pdfDownloaded:true,webRequiresNewLogin:true},null,2));
 }finally{
  if(browser)await browser.close();child.kill('SIGTERM');await new Promise(r=>{if(child.exitCode!==null)return r();child.once('exit',r);setTimeout(r,11000).unref();});
  execFileSync(process.execPath,['scripts/yape-pilot.cjs','close','--state',statePath],{cwd:root,stdio:'ignore'});require('../yape-pilot.cjs').assertState(state);execFileSync('docker',['stop',state.container],{stdio:'ignore'});
 }
});
