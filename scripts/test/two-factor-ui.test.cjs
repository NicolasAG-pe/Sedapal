'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const {chromium}=require(process.env.HIDRO_PLAYWRIGHT_MODULE||path.join(root,'artifacts/vercel-validation/tools/node_modules/playwright'));
async function fixture(t){
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});t.after(()=>browser.close());const page=await browser.newPage(),html=fs.readFileSync(path.join(root,'Frontend/index.html'),'utf8');
 await page.setContent(html.match(/<form id="two-factor-login"[\s\S]*?<\/form>/)[0]+html.match(/<section class="two-factor-settings"[\s\S]*?<\/section>/)[0]);await page.addScriptTag({path:path.join(root,'Shared/two-factor-ui.js')});return page;
}
test('Logout durante el establecimiento de sesión no repuebla códigos privados ni controles',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),html=fs.readFileSync(path.join(root,'Frontend/index.html'),'utf8');
  await page.setContent(html.match(/<form id="two-factor-login"[\s\S]*?<\/form>/)[0]+html.match(/<section class="two-factor-settings"[\s\S]*?<\/section>/)[0]);
  await page.addScriptTag({path:path.join(root,'Shared/two-factor-ui.js')});
  await page.evaluate(()=>{
   window.ui=createHMTwoFactorUI({session:{token:()=> 'synthetic',authFetch:async()=>({ok:true,json:async()=>({token:'synthetic',codigos_recuperacion:['SYNTHETIC-PRIVATE-RECOVERY']})})},
    apiFetch:async()=>({ok:true,json:async()=>({activo:true,disponible:true,recuperacion:10})}),showLogin(){},showChallenge(){},showProfile(){window.profileShown=true;},
    authenticated:()=>{window.authStarted=true;return new Promise(r=>{window.finishAuth=r;});}});
   document.getElementById('two-factor-controls').hidden=false;document.getElementById('two-factor-confirm').hidden=false;
  });
  await page.locator('#two-factor-confirm-code').fill('123456');await page.locator('#two-factor-confirm button').click();
  await page.waitForFunction(()=>window.authStarted);await page.evaluate(()=>{ui.clear();finishAuth();});
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#two-factor-codes-list').textContent(),'');
  assert.equal(await page.evaluate(()=>document.getElementById('two-factor-controls').hidden),true);
 }finally{await browser.close();}
});
test('Doble submit solo envía un segundo factor y no persiste el desafío',async t=>{
 const page=await fixture(t);await page.evaluate(()=>{
  window.calls=0;window.ui=createHMTwoFactorUI({session:{token:()=>'',authFetch:async()=>{calls++;return new Promise(resolve=>{window.respond=()=>resolve({ok:true,json:async()=>({token:'synthetic'})});});}},apiFetch(){},showLogin(){},showChallenge(){},showProfile(){},authenticated:async()=>{}});
  ui.challenge({desafio:'A'.repeat(43),vence_en:new Date(Date.now()+300000).toISOString()});document.getElementById('two-factor-login-code').value='123456';
  const form=document.getElementById('two-factor-login');form.dispatchEvent(new Event('submit',{cancelable:true}));form.dispatchEvent(new Event('submit',{cancelable:true}));
 });
 assert.equal(await page.evaluate(()=>calls),1);await page.evaluate(()=>respond());await page.waitForFunction(()=>document.getElementById('two-factor-login').hidden);
 assert.equal(await page.locator('#two-factor-login-code').inputValue(),'');
});
for(const mode of ['lost-response','timeout','server-error'])test('Confirmación incierta '+mode+' limpia secretos y exige login sin reenviar',async t=>{
 const page=await fixture(t);await page.evaluate(mode=>{
  window.calls=0;window.message='';window.ui=createHMTwoFactorUI({session:{token:()=> 'synthetic',authFetch:async()=>{calls++;if(mode==='server-error')return{ok:false,status:503,json:async()=>({mensaje:'No disponible'})};if(mode==='timeout')throw new DOMException('synthetic','AbortError');throw new TypeError('synthetic');}},apiFetch(){},showLogin:m=>{message=m;},showChallenge(){},showProfile(){},authenticated:async()=>{throw Error('No establecer sesión');}});
  document.getElementById('two-factor-controls').hidden=false;document.getElementById('two-factor-confirm').hidden=false;
  document.getElementById('two-factor-qr').src='data:image/png;base64,fixture';document.getElementById('two-factor-codes-list').textContent='SYNTHETIC-PRIVATE';
 },mode);
 await page.locator('#two-factor-confirm-code').fill('123456');await page.locator('#two-factor-confirm button').click();await page.waitForFunction(()=>message.includes('Vuelve a iniciar sesión'));
 assert.equal(await page.evaluate(()=>calls),1);assert.equal(await page.locator('#two-factor-qr').getAttribute('src'),null);assert.equal(await page.locator('#two-factor-codes-list').textContent(),'');
});
test('Un desafío caducado no envía códigos y anuncia recuperación por login',async t=>{
 const page=await fixture(t);await page.clock.install();await page.evaluate(()=>{
  window.calls=0;window.ui=createHMTwoFactorUI({session:{token:()=>'',authFetch:async()=>{calls++;}},apiFetch(){},showLogin(){},showChallenge(){},showProfile(){},authenticated:async()=>{}});
  ui.challenge({desafio:'A'.repeat(43),vence_en:new Date(Date.now()+300000).toISOString()});
 });
 await page.clock.fastForward(300001);assert.equal(await page.evaluate(()=>calls),0);assert.match(await page.locator('#two-factor-login-error').textContent(),/venció/);
 assert.equal(await page.locator('#two-factor-login-code').getAttribute('aria-describedby'),'two-factor-login-error');
});
