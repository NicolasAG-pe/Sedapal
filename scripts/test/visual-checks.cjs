// Evidencia de layout/accesibilidad con el Chromium del entorno aislado.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
module.exports=async function capture(chrome,output,name,width=1280,height=900){
  if(process.env.HIDRO_TEST_VISUAL_CAPTURE!=='1')return;
  if(process.env.HIDRO_TEST_VISUAL_CLIENT_ONLY==='1'&&!name.startsWith('client-'))return;
  await chrome.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<650});
  const previousScroll=await chrome.evaluate('window.scrollY');
  await chrome.evaluate('window.scrollTo({top:0,behavior:"instant"})');
  await new Promise(r=>setTimeout(r,250));
  const result=await chrome.evaluate(`(()=>{
    const visible=el=>!!(el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
    const named=el=>el.getAttribute('aria-label')||el.getAttribute('aria-labelledby')||el.labels?.length||el.getAttribute('title');
    return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
      unlabelled:[...document.querySelectorAll('input:not([type=hidden]):not([type=submit]),select,textarea')].filter(visible).filter(el=>!named(el)).map(el=>el.id||el.outerHTML.slice(0,100)),
      unnamedButtons:[...document.querySelectorAll('button')].filter(visible).filter(el=>!el.textContent.trim()&&!named(el)).map(el=>el.id),
      brokenImages:[...document.images].filter(visible).filter(el=>el.getAttribute('src')).filter(el=>!el.complete||!el.naturalWidth).map(el=>el.getAttribute('src')),
      // Las tablas y la navegación horizontal de Admin en teléfonos tienen scroll propio.
      clippedControls:[...document.querySelectorAll('button,input,select,textarea')].filter(visible).filter(el=>!el.closest('.table-scroll,#admin-nav')).filter(el=>{const r=el.getBoundingClientRect();return r.right>innerWidth+1||r.left< -1;}).map(el=>el.id||el.textContent.trim().slice(0,35)),
      modalBounds:[...document.querySelectorAll('.overlay.open .dialog')].map(el=>{const r=el.getBoundingClientRect();return{top:r.top,bottom:r.bottom,left:r.left,right:r.right};}),
      tables:document.querySelectorAll('.dash-sec.active table').length,
      activePage:document.querySelector('.dash-sec.active')?.id||'login'};
  })()`);
  fs.writeFileSync(path.join(output,name+'.json'),JSON.stringify(result,null,2)+'\n');
  await chrome.screenshot(path.join(output,name+'.png'));
  await chrome.command('Emulation.clearDeviceMetricsOverride');
  await chrome.evaluate('window.scrollTo({top:'+previousScroll+',behavior:"instant"})');
  assert.ok(result.scrollWidth<=result.width,name+': overflow horizontal');
  assert.deepEqual(result.unlabelled,[],name+': campos sin nombre accesible');
  assert.deepEqual(result.unnamedButtons,[],name+': botones sin nombre accesible');
  assert.deepEqual(result.brokenImages,[],name+': imágenes rotas');
  assert.deepEqual(result.clippedControls,[],name+': controles fuera del ancho visible');
  for(const r of result.modalBounds)assert.ok(r.top>=0&&r.bottom<=height+1&&r.left>=0&&r.right<=width+1,name+': modal fuera de pantalla');
};
module.exports.matrix=async function matrix(chrome,output,name,role){
  if(process.env.HIDRO_TEST_VISUAL_MATRIX!=='1')return;
  const widths=role==='admin'?[768,1024,1366,1920]:[360,390,412,768,1366];
  for(const width of widths)await module.exports(chrome,output,name+'-'+width,width,width<650?844:900);
};
