'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{jsPDF}=require('../Frontend/assets/vendor/jspdf.umd.min.js');
(async()=>{
 const{chromium}=require('../artifacts/vercel-validation/tools/node_modules/playwright'),browser=await chromium.launch({headless:true,args:['--no-sandbox']});let logo;
 try{const page=await browser.newPage();logo=await page.evaluate(async svg=>{const img=new Image();img.src='data:image/svg+xml;base64,'+btoa(svg);await img.decode();const c=document.createElement('canvas');c.width=c.height=256;c.getContext('2d').drawImage(img,0,0,256,256);return c.toDataURL('image/png');},fs.readFileSync('Shared/assets/hm-symbol.svg','utf8'));}finally{await browser.close();}
 const window={jspdf:{jsPDF}},sandbox={window,Date,Intl,WeakMap};for(const f of['Shared/ui.js','Frontend/assets/js/documents.js'])vm.runInNewContext(fs.readFileSync(f,'utf8'),sandbox);
 const p={id:'00000000-0000-4000-8000-000000000042',codigo_operacion:'00000000-0000-4000-8000-000000000042',id_recibo:42,monto:1,moneda:'PEN',metodo:'yape_manual',entorno:'piloto_manual',piloto_ensayo:false,estado:'verificada_manual',referencia:'EJEMPLO-000042',fecha_pago:'2026-10-25T20:05:00Z',recibido_en:'2026-10-25T20:00:00Z',revisado_en:'2026-10-25T20:10:00Z',revisado_por:900};
 const doc=window.HMDocuments.payment(p,{periodo:'Piloto Yape local'},{supply:'980000042',example:true,generatedAt:'2026-10-25T20:10:00Z',logo:{data:logo}});
 const dir=path.resolve('output/pdf/yape-piloto-120');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'constancia-yape-ejemplo-sintetico.pdf'),Buffer.from(doc.output('arraybuffer')),{flag:'wx'});console.log('Ejemplo sintético marcado: '+doc.getNumberOfPages()+' página(s), sin receptor ni transferencia real.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
