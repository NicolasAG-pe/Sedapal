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

for(const [state,label]of Object.entries({demostrativa:'CONSTANCIA DEMOSTRATIVA',pendiente_verificacion:'Pendiente de verificación',verificada_manual:'Verificada manualmente',acreditada_proveedor:'Aprobada por proveedor simulado',rechazada:'Rechazada',cancelada:'Cancelada',reembolsada:'Reembolso simulado'})){
 test('constancia preserva estado real '+state+' y no atribuye acreditación financiera',()=>{
  const payment={id:'00000000-0000-4000-8000-000000000042',id_recibo:42,monto:123.45,metodo:state==='demostrativa'?'demostrativo':'yape_manual',estado:state,entorno:'simulado',codigo_operacion:'OPERACION-42',fecha_pago:'2026-10-25T15:00:00Z',referencia:'SIM-DECLARADA-42',revisado_por:900,revisado_en:state==='verificada_manual'?'2026-10-25T15:05:00Z':null};
  const result=inspect(api.payment(payment,receipt,context),'state-'+state);
  for(const value of [label,'SIN ACREDITACIÓN FINANCIERA','SIM-DECLARADA-42','00000000-0000-4000-8000-000000000042','America/Lima','SEDAPAL','SUNAT'])assert.ok(result.text.includes(value),value);
  assert.ok(!result.text.includes('Pago exitoso'));assert.match(result.info,/A4/);
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
 assert.match(r.text.replace(/\s+/g,' '),/Transferencia verificada manualmente/);for(const v of['Recepción comprobada','Revisión del servidor','REF-SINTETICA','EJEMPLO SINTÉTICO','comprobante oficial de servicio de agua'])assert.ok(r.text.replace(/\s+/g,' ').toLowerCase().includes(v.toLowerCase()),v);for(const v of[p.receptor_huella,p.motivo])assert.ok(!r.text.includes(v));
 const synthetic=inspect(api.payment({...p,piloto_ensayo:true},receipt,context),'pilot-synthetic');assert.ok(synthetic.text.includes('Ensayo sintético'));assert.ok(!synthetic.text.replace(/\s+/g,' ').includes('Transferencia verificada manualmente'));
});
