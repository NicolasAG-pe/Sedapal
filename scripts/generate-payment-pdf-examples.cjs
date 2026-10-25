'use strict';
// Ejemplos sintéticos generados por el mismo jsPDF del cliente, nunca datos productivos.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const{jsPDF}=require('../Frontend/assets/vendor/jspdf.umd.min.js');
const root=path.resolve(__dirname,'..');
async function main(){
 const directory=path.resolve(process.argv[2]||path.join(root,'output/pdf/pagos-pdf-120'));
 fs.mkdirSync(directory,{recursive:true});
 const{chromium}=require(path.join(root,'artifacts/vercel-validation/tools/node_modules/playwright'));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});let logo;
 try{const page=await browser.newPage();logo=await page.evaluate(async svg=>{const image=new Image();image.src='data:image/svg+xml;base64,'+btoa(svg);await image.decode();const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;canvas.getContext('2d').drawImage(image,0,0,256,256);return canvas.toDataURL('image/png');},fs.readFileSync(path.join(root,'Shared/assets/hm-symbol.svg'),'utf8'));}finally{await browser.close();}
 const window={jspdf:{jsPDF}},sandbox={window,Intl,Date,WeakMap};
 for(const file of ['Shared/ui.js','Frontend/assets/js/documents.js'])vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),sandbox);
 const context={supply:'950000123',generatedAt:'2026-10-25T15:00:00Z',logo:{data:logo}};
 const receipt={id_recibo:42,periodo:'Octubre 2026',fecha_emision:'2026-10-01',fecha_vencimiento:'2026-11-01',monto:123.45,consumoM3:23.5,estado:'Pendiente'};
 const base={id:'00000000-0000-4000-8000-000000000042',codigo_operacion:'00000000-0000-4000-8000-000000000042',id_recibo:42,periodo:receipt.periodo,monto:123.45,moneda:'PEN',entorno:'simulado',fecha_pago:'2026-10-25T15:00:00Z'};
 const examples=[['recibo-sintetico',window.HMDocuments.receipt(receipt,context)],
 ['constancia-demostrativa',window.HMDocuments.payment({...base,estado:'demostrativa',metodo:'demostrativo'},receipt,context)],
 ['declaracion-pendiente',window.HMDocuments.payment({...base,estado:'pendiente_verificacion',metodo:'yape_manual',referencia:'SIM-YAPE-2026-0042'},receipt,context)],
 ['revision-manual-simulada',window.HMDocuments.payment({...base,estado:'verificada_manual',metodo:'yape_manual',referencia:'SIM-YAPE-2026-0042',revisado_por:900,revisado_en:'2026-10-25T15:10:00Z',motivo:'Movimiento sintético comprobado en el laboratorio. No representa una transferencia real.'},receipt,context)],
 ['proveedor-simulado',window.HMDocuments.payment({...base,estado:'acreditada_proveedor',metodo:'proveedor_simulado',proveedor_id:'sim_operacion_0042'},receipt,context)]];
 for(const[name,doc]of examples){const target=path.join(directory,name+'.pdf');fs.writeFileSync(target,Buffer.from(doc.output('arraybuffer')),{flag:'wx'});console.log(name+': '+doc.getNumberOfPages()+' página(s)');}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
