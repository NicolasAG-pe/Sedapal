'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {jsPDF}=require('../../Frontend/assets/vendor/jspdf.umd.min.js');
const window={jspdf:{jsPDF}};
const sandbox={window,Intl,Date,WeakMap};
vm.runInNewContext(fs.readFileSync(path.resolve('Shared/ui.js'),'utf8'),sandbox);
vm.runInNewContext(fs.readFileSync(path.resolve('Frontend/assets/js/documents.js'),'utf8'),sandbox);
const api=window.HMDocuments;
const receipt={id_recibo:42,periodo:'Octubre 2026',fechaEmisionISO:'2026-10-01',fechaVencimientoISO:'2026-11-01',estado:'Emitido',monto:123.45,consumoM3:23.5};
const context={supply:'020726159',email:'fixture@example.invalid',generatedAt:'2026-10-07T17:00:00Z'};
const pdfOutput=path.resolve('artifacts/pdf/tests');
fs.mkdirSync(pdfOutput,{recursive:true});
const temporary=fs.mkdtempSync(path.join(pdfOutput,'hidro-document-tests-'));
function inspect(doc,name){
 const file=path.join(temporary,name+'.pdf');fs.writeFileSync(file,Buffer.from(doc.output('arraybuffer')));
 return {text:execFileSync('pdftotext',[file,'-'],{encoding:'utf8'}),info:execFileSync('pdfinfo',[file],{encoding:'utf8'})};
}
test('recibo A4 usa total y consumo registrados, advertencia, correo y fechas, sin desglose ficticio',()=>{
 const result=inspect(api.receipt(receipt,context),'receipt');
 for(const value of ['RECIBO DE SERVICIO','020726159','fixture@example.invalid','123.45','23.5','01/10/2026','01/11/2026','sin valor oficial'])assert.ok(result.text.includes(value),value);
 assert.ok(!result.text.includes('IGV'));assert.ok(!result.text.includes('60%'));
 assert.match(result.info,/A4/);assert.match(result.text,/Página 1 de 1/);
 assert.equal(api.receiptFileName(receipt,context.supply),'Recibo_HidroMejora_020726159_2026-10.pdf');
});
test('constancia usa los datos de pago y el código real para el nombre',()=>{
 const payment={id_recibo:42,periodo:'Octubre 2026',monto:123.45,metodo:'Banca móvil',codigo_operacion:'HM-OPERACION-42',fecha_pago:'2026-10-07T17:00:00Z'};
 const result=inspect(api.payment(payment,receipt,context),'payment');
 for(const value of ['CONSTANCIA DE OPERACIÓN','HM-OPERACION-42','Banca móvil','123.45','020726159','cargo bancario'])assert.ok(result.text.includes(value),value);
 assert.equal(api.paymentFileName(payment),'Constancia_Pago_HidroMejora_HM-OPERACION-42.pdf');
 assert.throws(()=>api.payment({...payment,codigo_operacion:''},receipt,context),/Código/);
 assert.throws(()=>api.payment({...payment,monto:null},receipt,context),/Importe/);
});
test('texto extenso conserva cabeceras, pies y numeración en todas las páginas',()=>{
 const doc=api.receipt({...receipt,periodo:'Detalle extenso '.repeat(250)},context);
 const pages=doc.getNumberOfPages();assert.ok(pages>1);
 const result=inspect(doc,'long');
 for(let page=1;page<=pages;page++)assert.ok(result.text.includes('Página '+page+' de '+pages));
 assert.equal((result.text.match(/sin valor oficial/g)||[]).length,pages);
});
test('guardado nativo envía PDF al selector Android y distingue cancelación de éxito',async()=>{
 const calls=[];window.Capacitor={isNativePlatform:()=>true,isPluginAvailable:name=>name==='HidroDocuments',nativePromise:async(...args)=>{calls.push(args);return{saved:true};}};
 try{
   const doc=api.receipt(receipt,context),name=api.receiptFileName(receipt,context.supply);
   assert.equal(await api.save(doc,name),true);
   assert.deepEqual(calls[0].slice(0,2),['HidroDocuments','save']);
   assert.equal(calls[0][2].fileName,name);
   assert.equal(Buffer.from(calls[0][2].base64,'base64').subarray(0,5).toString(),'%PDF-');
   window.Capacitor.nativePromise=async()=>({saved:false});assert.equal(await api.save(doc,name),false);
   window.Capacitor.isPluginAvailable=()=>false;await assert.rejects(()=>api.save(doc,name),/actualizada/);
 }finally{delete window.Capacitor;}
});

for(const [state,label]of Object.entries({demostrativa:'CONSTANCIA DE OPERACIÓN',pendiente_verificacion:'Pendiente de revisión',verificada_manual:'Operación confirmada',acreditada_proveedor:'Aprobación registrada',rechazada:'Rechazada',cancelada:'Cancelada',reembolsada:'Reembolso registrado'})){
 test('constancia preserva estado real '+state+' y no atribuye acreditación financiera',()=>{
  const payment={id:'00000000-0000-4000-8000-000000000042',id_recibo:42,monto:123.45,metodo:state==='demostrativa'?'demostrativo':'yape_manual',estado:state,entorno:'simulado',codigo_operacion:'OPERACION-42',fecha_pago:'2026-10-25T15:00:00Z',referencia:'SIM-DECLARADA-42',revisado_por:900,revisado_en:state==='verificada_manual'?'2026-10-25T15:05:00Z':null};
  const result=inspect(api.payment(payment,receipt,context),'state-'+state);
  for(const value of [label,'SIN ACREDITACIÓN FINANCIERA','SIM-DECLARADA-42','00000000-0000-4000-8000-000000000042','America/Lima','SEDAPAL','SUNAT'])assert.ok(result.text.includes(value),value);
  assert.ok(!result.text.includes('Pago exitoso'));assert.match(result.info,/A4/);assert.match(result.text,/Entorno de pruebas · Sin cobros reales/);assert.match(result.text,/No se recibió dinero/);assert.doesNotMatch(result.text,/ensayo|sintétic|simulación/iu);
 });
}
test('motivos extensos y referencias largas se conservan sin inventar QR',()=>{
 const payment={id:'op-fixture',id_recibo:42,monto:123.45,metodo:'yape_manual',estado:'verificada_manual',entorno:'simulado',codigo_operacion:'H'.repeat(100),fecha_pago:'2026-10-25T15:00:00Z',motivo:'Revisión sintética con información extensa. '.repeat(80)};
 const result=inspect(api.payment(payment,receipt,context),'long-payment');
 assert.ok(result.text.includes('Revisión sintética'));assert.ok(result.text.includes('No se incluye QR público'));
 assert.ok(result.text.includes('Página 2 de'));assert.ok(!result.text.includes('https://'));
});

test('recibo acepta consumo de API sin inferir lecturas ni inventar consumo ausente',()=>{
 const raw={...receipt,consumoM3:undefined,consumo_m3:'23.50'};
 const result=inspect(api.receipt(raw,context),'api-receipt');assert.ok(result.text.includes('23.5 m³'));
 const missing=inspect(api.receipt({...raw,consumo_m3:null},context),'missing-consumption');assert.ok(missing.text.includes('No disponible'));assert.ok(!missing.text.includes('0 m³'));
});

test('piloto verificado: recepción y revisión separadas, sin receptor privado ni motivo sensible',()=>{
 const p={id:'00000000-0000-4000-8000-000000000042',codigo_operacion:'PILOTO-42',id_recibo:42,monto:1,metodo:'yape_manual',entorno:'piloto_manual',piloto_ensayo:false,estado:'verificada_manual',referencia:'REF-SINTETICA',fecha_pago:'2026-10-25T15:00:00Z',recibido_en:'2026-10-25T14:59:00Z',revisado_en:'2026-10-25T15:05:00Z',revisado_por:900,receptor_huella:'PRIVADO-NO-COPIAR',motivo:'DETALLE-PRIVADO-NO-COPIAR'};
 const r=inspect(api.payment(p,receipt,{...context,example:true}),'pilot-real-template');
 assert.match(r.text.replace(/\s+/g,' '),/Transferencia auténtica verificada manualmente/);for(const v of['Recepción comprobada','Revisión del servidor','REF-SINTETICA','Entorno de pruebas · Sin cobros reales','comprobante oficial de servicio de agua'])assert.ok(r.text.replace(/\s+/g,' ').toLowerCase().includes(v.toLowerCase()),v);for(const v of[p.receptor_huella,p.motivo])assert.ok(!r.text.includes(v));
 const synthetic=inspect(api.payment({...p,piloto_ensayo:true},receipt,context),'pilot-synthetic');assert.ok(synthetic.text.includes('Operación confirmada'));assert.ok(!synthetic.text.replace(/\s+/g,' ').includes('Transferencia auténtica verificada manualmente'));
});

test('paleta PDF corresponde a los tokens compartidos, sin una identidad independiente',()=>{
 const css=fs.readFileSync('Shared/styles.css','utf8');
 for(const[token,key]of Object.entries({primary:'navy',secondary:'blue',sky:'sky',green:'green',orange:'warning',red:'red',text:'text',border:'border',white:'white'})){
  const hex=css.match(new RegExp('--'+token+':\\s*#([a-f0-9]{6})','i'))?.[1];assert.ok(hex,token);
  assert.deepEqual(Array.from(api.palette[key]),[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)),token);
 }
});
test('geometría de todas las páginas: contenido dentro de A4 y pie legal por página',()=>{
 const samples=[api.receipt({...receipt,periodo:'Información extensa de prueba. '.repeat(130)},context),api.payment({id:'00000000-0000-4000-8000-000000000042',codigo_operacion:'PRUEBA-42',id_recibo:42,monto:1,metodo:'yape_manual',entorno:'simulado',estado:'verificada_manual',motivo:'Revisión sintética detallada. '.repeat(150)},receipt,context)];
 samples.forEach((doc,index)=>{const file=path.join(temporary,'geometry-'+index+'.pdf');fs.writeFileSync(file,Buffer.from(doc.output('arraybuffer')));const xml=execFileSync('pdftotext',['-bbox-layout',file,'-'],{encoding:'utf8'});
  const pages=[...xml.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)];assert.equal(pages.length,doc.getNumberOfPages());
  for(const page of pages){const words=[...page[1].matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"[^>]*>(.*?)<\/word>/g)];assert.ok(words.length>20,'No páginas vacías');for(const w of words){assert.ok(+w[1]>=40&&+w[2]>=25&&+w[3]<=555&&+w[4]<=835,'Texto fuera de márgenes: '+w[5]);}for(let i=0;i<words.length;i++)for(let j=i+1;j<words.length;j++){const a=words[i],b=words[j],dx=Math.min(+a[3],+b[3])-Math.max(+a[1],+b[1]),dy=Math.min(+a[4],+b[4])-Math.max(+a[2],+b[2]);assert.ok(dx<=1||dy<=1,'Texto superpuesto: '+a[5]+' / '+b[5]);}assert.match(page[1],/referencial/);assert.match(page[1],/SUNAT/);}
 });
});

test('recibo con correo largo e importe máximo conserva una sola página A4',()=>{
 const doc=api.receipt({...receipt,periodo:'Septiembre 2026',monto:99999999.99},{...context,email:'cuenta.'+'x'.repeat(85)+'@example.invalid'});
 assert.equal(doc.getNumberOfPages(),1,'Un dato válido largo no debe crear una página casi vacía');
 const r=inspect(doc,'max-fields');assert.ok(r.text.includes('99999999.99'));assert.match(r.info,/A4/);
});
