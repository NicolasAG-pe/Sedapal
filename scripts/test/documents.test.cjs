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
 for(const value of ['CONSTANCIA DE PAGO','HM-OPERACION-42','Banca móvil','123.45','020726159','cargo bancario'])assert.ok(result.text.includes(value),value);
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
