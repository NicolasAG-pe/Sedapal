'use strict';
// Ejemplos del generador real; datos completamente sintéticos, salida nueva sin sobrescritura.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{jsPDF}=require('../Frontend/assets/vendor/jspdf.umd.min.js');
(async()=>{
 const{chromium}=require('../artifacts/vercel-validation/tools/node_modules/playwright');const browser=await chromium.launch({headless:true,args:['--no-sandbox']});let logo;
 try{const page=await browser.newPage();logo=await page.evaluate(async svg=>{const i=new Image();i.src='data:image/svg+xml;base64,'+btoa(svg);await i.decode();const c=document.createElement('canvas');c.width=c.height=256;c.getContext('2d').drawImage(i,0,0,256,256);return c.toDataURL('image/png');},fs.readFileSync('Shared/assets/hm-symbol.svg','utf8'));}finally{await browser.close();}
 const window={jspdf:{jsPDF}},sandbox={window,Date,Intl,WeakMap};for(const file of['Shared/ui.js','Frontend/assets/js/documents.js'])vm.runInNewContext(fs.readFileSync(file,'utf8'),sandbox);
 const receipt={id_recibo:42,periodo:'Ensayo sintético',fecha_emision:'2026-10-25',fecha_vencimiento:'2026-11-01',monto:1,consumo_m3:0,estado:'Pendiente'};
 const operation={id:'00000000-0000-4000-8000-000000000042',codigo_operacion:'00000000-0000-4000-8000-000000000042',id_recibo:42,monto:1,moneda:'PEN',metodo:'yape_manual',entorno:'piloto_manual',piloto_ensayo:true,estado:'verificada_manual',referencia:'ENSAYO-000042',fecha_pago:'2026-10-25T20:05:00Z',recibido_en:null,revisado_en:'2026-10-25T20:10:00Z',revisado_por:900};
 const context={supply:'980000042',example:true,generatedAt:'2026-10-25T20:10:00Z',logo:{data:logo}};
 const parent=path.resolve(process.env.HM_PDF_EXAMPLE_DIR||'output/pdf/auditoria-pagos-120');fs.mkdirSync(parent,{recursive:true});const output=fs.mkdtempSync(path.join(parent,'ejemplos-'));
 const samples=[['constancia-ensayo-sintetico',window.HMDocuments.payment(operation,receipt,context)],['recibo-sintetico',window.HMDocuments.receipt(receipt,context)]];
 if(process.argv.includes('--variants')){
  for(const[state,name]of[['pendiente_verificacion','pendiente'],['rechazada','rechazada'],['cancelada','cancelada'],['verificada_manual','manual-verificada']])samples.push(['constancia-'+name,window.HMDocuments.payment({...operation,piloto_ensayo:false,estado:state,revisado_en:state==='pendiente_verificacion'?null:operation.revisado_en,recibido_en:state==='verificada_manual'?'2026-10-25T20:00:00Z':null},receipt,context)]);
  samples.push(['recibo-texto-largo',window.HMDocuments.receipt({...receipt,periodo:'Detalle autorizado de ejemplo. '.repeat(120)},{...context,email:'usuario.sintetico@example.invalid'})]);
  samples.push(['constancia-texto-largo',window.HMDocuments.payment({...operation,entorno:'simulado',motivo:'Revisión sintética de ejemplo y observación extensa. '.repeat(120)},receipt,context)]);
 }
 for(const[name,doc]of samples){fs.writeFileSync(path.join(output,name+'.pdf'),Buffer.from(doc.output('arraybuffer')),{flag:'wx'});console.log(path.join(output,name+'.pdf'));}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
