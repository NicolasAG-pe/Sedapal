'use strict';
// Chromium móvil/escritorio + API y PostgreSQL 18 reales, exclusivamente sintéticos.
const{test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const{buildWeb}=require('../build-web'),{iniciar}=require('../../Backend/test/email-api.cjs');
const{PNG}=require('../../Backend/node_modules/pngjs');
const{chromium,devices}=require('../../artifacts/vercel-validation/tools/node_modules/playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'artifacts/pagos-pdf-120'),origin='https://localhost',api='https://api.payment.fixture.test';
let ctx,browser,accounts=[],ip=1,runtimes={};
before(async()=>{
 fs.mkdirSync(out,{recursive:true});const png=new PNG({width:20,height:20});png.data.fill(255);const qr=path.join(out,'qr-ui-fixture.png');fs.writeFileSync(qr,PNG.sync.write(png),{mode:0o600});
 process.env.PAYMENTS_MANUAL_ENABLED='1';process.env.YAPE_QR_FILE=qr;ctx=await iniciar();
 for(let i=0;i<2;i++){
  const a=ctx.registro(8000+i),pending=(await ctx.request('register',a,202)).data,verified=(await ctx.request('verify-email',ctx.verificar(pending.registro_id,ctx.codigo(a.correo)),201)).data;
  if(i===1)await ctx.db.query("UPDATE usuarios SET rol='admin' WHERE id_usuario=$1",[verified.usuario.id_usuario]);
  const s=(await ctx.db.query('SELECT * FROM suministros WHERE id_usuario=$1',[verified.usuario.id_usuario])).rows[0];accounts.push({...a,...s});
 }
 for(const type of ['android','admin']){runtimes[type]=fs.mkdtempSync(path.join(out,type+'-'));buildWeb(type,{API_BASE_URL:api},runtimes[type]);}
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
});
after(async()=>{if(browser)await browser.close();if(ctx)await ctx.close();delete process.env.PAYMENTS_MANUAL_ENABLED;delete process.env.YAPE_QR_FILE;});
async function fixture(t,admin=false,{holdReceipts=false}={}){
 const c=await browser.newContext(admin?{viewport:{width:1440,height:1000},reducedMotion:'reduce'}:{...devices['Pixel 5'],reducedMotion:'reduce'}),page=await c.newPage(),errors=[],calls=[];let lose=false;
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.abort());
 await page.route(origin+'/**',route=>{
  const name=new URL(route.request().url()).pathname;
  if(name.endsWith('socket.io.min.js'))return route.fulfill({contentType:'application/javascript',body:'window.io=()=>({on(){},removeAllListeners(){},disconnect(){}});'});
  const file=path.resolve(runtimes[admin?'admin':'android'],'.'+(name==='/'?'/index.html':name));assert.ok(file.startsWith(runtimes[admin?'admin':'android']+path.sep));
  const mime={'.js':'application/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
  route.fulfill({status:fs.existsSync(file)?200:404,contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.existsSync(file)?fs.readFileSync(file):''});
 });
 let releaseReceipts;const receiptGate=new Promise(resolve=>releaseReceipts=resolve);
 await page.route(api+'/**',async route=>{
  const req=route.request(),u=new URL(req.url());if(holdReceipts&&u.pathname==='/api/me/recibos')await receiptGate;const r=await fetch(ctx.base+u.pathname+u.search,{method:req.method(),headers:{'Content-Type':'application/json','X-Forwarded-For':'192.0.2.'+(ip++%240+1),...(req.headers().authorization?{Authorization:req.headers().authorization}:{})},...(req.postData()?{body:req.postData()}:{})});
  const body=Buffer.from(await r.arrayBuffer());calls.push({method:req.method(),path:u.pathname,status:r.status});
  if(lose&&req.method()==='POST'&&u.pathname==='/api/me/operaciones-pago'){lose=false;return route.abort('connectionreset');}
  await route.fulfill({status:r.status,headers:{'Content-Type':r.headers.get('content-type')||'application/json','Access-Control-Allow-Origin':origin},body});
 });
 t.after(async()=>{await c.close();assert.deepEqual(errors,[]);});await page.goto(origin);
 const a=accounts[admin?1:0];await page.locator(admin?'#admin-supply':'#suministro').fill(a.numero_suministro);await page.locator(admin?'#admin-password':'#password').fill(a.password);await page.locator(admin?'#admin-login-submit':'#btn-login').click();
 await page.waitForFunction(a=>a?!document.getElementById('admin-panel').hidden:document.getElementById('view-dashboard').classList.contains('active'),admin);
 if(!admin){await page.waitForTimeout(900);for(const sel of ['#spot-skip-mobile','#spot-skip'])if(await page.locator(sel).isVisible())await page.locator(sel).click();}
 return{page,calls,releaseReceipts,lose:()=>lose=true};
}
async function seed(period){return(await ctx.db.query("INSERT INTO recibos(id_suministro,periodo,fecha_emision,fecha_vencimiento,monto,consumo_m3,estado) VALUES($1,$2,CURRENT_DATE,CURRENT_DATE+7,78.90,15,'Pendiente') RETURNING id_recibo",[accounts[0].id_suministro,period])).rows[0].id_recibo;}
async function openPayment(page){await page.evaluate(()=>document.querySelector('[data-sec="historial"]').click());await page.locator('#cards [data-act="pay"]').first().click();await page.waitForFunction(()=>!document.querySelector('input[value="yape_manual"]').disabled);}
test('Android Chromium: declaración Yape, respuesta perdida, mismo UUID y deuda conservada',async t=>{
 const id=await seed('Prueba Yape 2026'),f=await fixture(t);await openPayment(f.page);
 await f.page.locator('input[value="yape_manual"]').check();await f.page.locator('#pay-reference').fill('UI-TEST-1234');
 await f.page.locator('#pay-proof').setInputFiles(process.env.YAPE_QR_FILE);f.lose();await f.page.locator('#pay-confirm').click();
 await f.page.waitForFunction(()=>document.getElementById('pay-feedback').textContent.includes('historial'));
 await f.page.locator('#pay-confirm').click();await f.page.waitForFunction(()=>!document.getElementById('pay-success').hidden);
 assert.match(await f.page.locator('#pay-success-text').textContent(),/Pendiente de revisión/);
 assert.equal((await ctx.db.query('SELECT count(*)::int AS n FROM operaciones_pago WHERE id_recibo=$1',[id])).rows[0].n,1);
 assert.equal((await ctx.db.query('SELECT estado FROM recibos WHERE id_recibo=$1',[id])).rows[0].estado,'Pendiente');
 await f.page.screenshot({path:path.join(out,'android-yape-pendiente.png'),fullPage:true});
 await f.page.locator('#pay-done').click();await f.page.evaluate(()=>document.querySelector('[data-sec="pagos"]').click());
 await f.page.waitForFunction(()=>document.getElementById('pay-list').textContent.includes('Pendiente de revisión'));
 assert.equal(await f.page.locator('#pay-list').getByText('PAGADO',{exact:true}).count(),0);
});
test('Admin: motivo, revisión separada, historial y resultado visibles para el propietario',async t=>{
 const f=await fixture(t,true);await f.page.locator('#admin-nav [data-sec="admin-pagos"]').click();
 const card=f.page.locator('[data-operation]').filter({hasText:'UI-TEST-1234'});await card.waitFor();
 await card.getByRole('button',{name:'Revisar',exact:true}).click();await f.page.locator('#operation-history details').waitFor();await f.page.locator('#operation-history summary').click();
 await f.page.locator('#operation-review textarea').fill('Ensayo sintético revisado en laboratorio');await f.page.getByRole('button',{name:'Confirmar ensayo',exact:true}).click();
 await f.page.locator('#operation-error').getByText(/Confirma la comprobación/).waitFor();
 await f.page.locator('#operation-review input[type="checkbox"]').check();await f.page.getByRole('button',{name:'Confirmar ensayo',exact:true}).click();await f.page.locator('.payment-dialog').waitFor({state:'hidden'});
 await f.page.locator('[data-tab="confirmadas"]').click();await f.page.locator('[data-operation]').getByText('Ensayo confirmado',{exact:true}).waitFor();
 await f.page.screenshot({path:path.join(out,'admin-revision.png'),fullPage:true});
 assert.equal((await ctx.db.query("SELECT count(*)::int AS n FROM operaciones_pago WHERE referencia='UI-TEST-1234' AND revisado_por IS NOT NULL AND estado='verificada_manual'")).rows[0].n,1);
});
test('Demostración y logout: no factura deuda, no quedan referencia, imagen ni sesión',async t=>{
 await seed('Demostración 2026');const f=await fixture(t);await openPayment(f.page);await f.page.locator('#pay-confirm').click();await f.page.waitForFunction(()=>!document.getElementById('pay-success').hidden);
 assert.match(await f.page.locator('#pay-success-text').textContent(),/Operación de prueba registrada/);
 await f.page.locator('#pay-done').click();await f.page.evaluate(()=>document.getElementById('btn-logout').click());
 await f.page.waitForFunction(()=>!document.getElementById('login-form').hidden);
 assert.equal(await f.page.locator('#pay-reference').inputValue(),'');assert.equal(await f.page.locator('#pay-yape-qr').getAttribute('src'),null);
 assert.deepEqual(await f.page.evaluate(()=>[localStorage.getItem('hm_token'),sessionStorage.getItem('hm_token')]),[null,null]);
});

test('HidroBot espera la carga inicial real, no la habilitación temprana del login',async t=>{
 const f=await fixture(t,false,{holdReceipts:true});try{assert.equal(await f.page.locator('#hb-fab').isDisabled(),true);assert.equal(await f.page.locator('#hb-fab').getAttribute('aria-disabled'),'true');}finally{f.releaseReceipts();}
 await f.page.waitForFunction(()=>!document.getElementById('hb-fab').disabled||document.body.classList.contains('tutorial-open'));if(await f.page.evaluate(()=>document.body.classList.contains('tutorial-open')))await f.page.locator('#spot-skip-mobile:visible, #spot-skip:visible').first().click();await f.page.waitForFunction(()=>!document.getElementById('hb-fab').disabled);assert.equal(await f.page.locator('#hb-fab').getAttribute('aria-disabled'),'false');
});
