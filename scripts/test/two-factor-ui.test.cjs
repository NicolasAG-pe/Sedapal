'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const {chromium}=require(process.env.HIDRO_PLAYWRIGHT_MODULE||path.join(root,'artifacts/vercel-validation/tools/node_modules/playwright'));
test('Logout durante el establecimiento de sesión no repuebla códigos privados ni controles',async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),html=fs.readFileSync(path.join(root,'Frontend/index.html'),'utf8');
  await page.setContent(html.match(/<form id="two-factor-login"[\s\S]*?<\/form>/)[0]+html.match(/<section class="two-factor-settings"[\s\S]*?<\/section>/)[0]);
  await page.addScriptTag({path:path.join(root,'Frontend/assets/js/two-factor-ui.js')});
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
