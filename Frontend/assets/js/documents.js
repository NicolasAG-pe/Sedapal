/* Documentos A4 del prototipo: jsPDF, datos registrados y ninguna tarifa estimada. */
(function(global){
  'use strict';
  const C={navy:[16,62,96],blue:[7,93,145],green:[20,108,72],greenPale:[233,245,238],muted:[82,104,121],text:[36,59,75],border:[217,227,235],pale:[244,247,250]};
  const text=value=>String(value??'').normalize('NFC').replace(/[\u2010-\u2015\u2212]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/[^\x20-\x7e\xa0-\xff\n]/gu,'').trim();
  function safeName(value){return text(value).replace(/[^a-zA-Z0-9_-]/g,'_').replace(/_+/g,'_').slice(0,100)||'sin_referencia';}
  function dateOnly(value){const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+'/'+m[2]+'/'+m[1]:'No disponible';}
  function money(value){if(value===null||value===undefined||!Number.isFinite(Number(value)))throw Error('Importe no disponible.');return 'S/ '+Number(value).toFixed(2);}
  function periodForFile(r){const p=String(r.periodo||r.etiqueta||'').match(/\b(\d{4})-(0[1-9]|1[0-2])\b/);if(p)return p[1]+'-'+p[2];const d=String(r.fechaEmisionISO||r.fecha_emision||'').match(/^(\d{4})-(\d{2})/);return d?d[1]+'-'+d[2]:'sin_fecha';}
  function receiptFileName(r,supply){return 'Recibo_HidroMejora_'+safeName(supply)+'_'+periodForFile(r)+'.pdf';}
  function paymentFileName(pago){return 'Constancia_Pago_HidroMejora_'+safeName(pago.codigo_operacion)+'.pdf';}
  async function save(doc,fileName){
    const cap=global.Capacitor;
    if(cap?.isNativePlatform?.()){
      if(!cap.isPluginAvailable('HidroDocuments'))throw Error('El guardado de PDF requiere la versión Android actualizada.');
      const base64=doc.output('datauristring').split(',')[1];
      const result=await cap.nativePromise('HidroDocuments','save',{base64,fileName});
      return !!result?.saved;
    }
    await doc.save(fileName,{returnPromise:true});return true;
  }
  function createDocument(kind,context,payment=false){
    const doc=new global.jspdf.jsPDF({unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true});
    const left=16,right=194,width=178,bottom=265,accent=payment?C.green:C.blue;
    const generatedText=global.HMShared.ui.date(context.generatedAt?new Date(context.generatedAt):new Date(),true)+' (hora del dispositivo)';
    let y=0;
    doc.setProperties({title:kind+' | Hidro-Mejora',subject:'Proyecto universitario. Documento referencial sin valor oficial.',author:'Hidro-Mejora'});
    function write(value,x,yy,{size=9,color=C.text,bold=false,align='left'}={}){doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(...color);doc.text(text(value)||'-',x,yy,{align});}
    function line(yy){doc.setDrawColor(...C.border);doc.setLineWidth(.25);doc.line(left,yy,right,yy);}
    function header(){
      doc.setFillColor(...accent);doc.rect(left,10,width,1.3,'F');let brandX=left;
      if(context.logo?.data){try{doc.addImage(context.logo.data,'PNG',left,16,17,17);brandX=38;}catch(_){}}
      write('HIDRO-MEJORA',brandX,23,{size:14,color:C.navy,bold:true});write('Gestión de servicios de agua',brandX,29,{size:8,color:C.muted});
      write('PROYECTO UNIVERSITARIO',right,23,{size:7,color:C.muted,align:'right'});line(39);
      write(kind,left,51,{size:18,color:payment?C.green:C.navy,bold:true});
      write('Documento referencial - sin valor oficial',left,59,{size:8,color:C.muted});y=74;
    }
    function ensure(height){if(y+height>bottom){doc.addPage();header();}}
    function section(label){ensure(19);write(label.toUpperCase(),left,y,{size:8,color:accent,bold:true});y+=5;line(y);y+=9;}
    function row(label,value){
      doc.setFont('helvetica','normal');doc.setFontSize(9);const values=doc.splitTextToSize(text(value)||'No disponible',width-58);let position=0;
      while(position<values.length){ensure(13);const capacity=Math.max(1,Math.floor((bottom-y-5)/5));const lines=values.slice(position,position+capacity);
        write(label+(position?' (cont.)':''),left,y,{size:8,color:C.muted});lines.forEach((value,index)=>write(value,left+58,y+index*5));y+=lines.length*5+5;line(y-3);position+=lines.length;}
    }
    function columns(fields){
      doc.setFont('helvetica','normal');doc.setFontSize(10);const cellWidth=width/fields.length;
      const lines=fields.map(field=>doc.splitTextToSize(text(field[1])||'No disponible',cellWidth-10));
      // Valores largos mantienen paginación mediante filas; no se recortan datos.
      if(lines.some(value=>value.length>5)){fields.forEach(field=>row(...field));return;}
      const height=13+Math.max(...lines.map(value=>value.length))*5;ensure(height);
      fields.forEach((field,index)=>{const x=left+index*cellWidth;write(field[0].toUpperCase(),x,y,{size:7,color:C.muted,bold:true});lines[index].forEach((value,n)=>write(value,x,y+7+n*5,{size:10,bold:true}));});y+=height;
    }
    function paragraph(value){doc.setFont('helvetica','normal');doc.setFontSize(8.5);const lines=doc.splitTextToSize(text(value),width);lines.forEach(value=>{ensure(6);write(value,left,y,{size:8.5,color:C.muted});y+=5;});y+=5;}
    function billingTable(consumption,amount){
      ensure(31);doc.setFillColor(...C.pale);doc.rect(left,y-5,width,10,'F');
      write('CONCEPTO REGISTRADO',left+4,y+1,{size:7,color:C.navy,bold:true});write('CONSUMO',left+119,y+1,{size:7,color:C.navy,bold:true,align:'right'});write('IMPORTE',right-4,y+1,{size:7,color:C.navy,bold:true,align:'right'});
      y+=15;write('Total del recibo de servicio',left+4,y);write(consumption,left+119,y,{align:'right'});write(money(amount),right-4,y,{align:'right',bold:true});y+=8;line(y);y+=13;
    }
    function receiptTotal(value,status){
      ensure(40);doc.setFillColor(...C.pale);doc.roundedRect(right-91,y-3,91,30,2,2,'F');
      write('TOTAL DEL RECIBO',right-86,y+4,{size:7,color:C.muted,bold:true});write(money(value),right-5,y+16,{size:23,color:C.navy,bold:true,align:'right'});
      write('ESTADO REGISTRADO',left,y+4,{size:7,color:C.muted,bold:true});write(status,left,y+13,{size:11,color:status==='PAGADO'?C.green:C.blue,bold:true});y+=39;
    }
    function paymentAmount(value){
      ensure(52);doc.setFillColor(...C.greenPale);doc.roundedRect(left,y-5,width,43,3,3,'F');
      doc.setDrawColor(...C.green);doc.setLineWidth(.7);doc.circle(left+14,y+15,6);doc.line(left+11,y+15,left+13.5,y+17.5);doc.line(left+13.5,y+17.5,left+17,y+12.5);
      write('PAGO REGISTRADO EN EL PROTOTIPO',left+28,y+7,{size:8,color:C.green,bold:true});write(money(value),left+28,y+24,{size:28,color:C.navy,bold:true});y+=49;
    }
    function operation(value){ensure(25);write('CÓDIGO DE OPERACIÓN',left,y,{size:7,color:C.green,bold:true});y+=8;row('Referencia del pago',value);}
    function finish(){const pages=doc.getNumberOfPages();for(let page=1;page<=pages;page++){doc.setPage(page);line(276);write('Hidro-Mejora | Documento referencial',left,282,{size:7,color:C.muted});write('Página '+page+' de '+pages,right,282,{size:7,color:C.muted,align:'right'});write('Generado: '+generatedText,left,287,{size:7,color:C.muted});}return doc;}
    header();return{section,row,columns,paragraph,billingTable,receiptTotal,paymentAmount,operation,finish};
  }
  function receipt(r,context){
    const pdf=createDocument('RECIBO DE SERVICIO',context);
    pdf.columns([['Número de suministro',context.supply],['Referencia interna','R-'+r.id_recibo]]);
    if(context.email)pdf.row('Correo del usuario',context.email);
    pdf.row('Periodo registrado',r.periodo||r.etiqueta);
    pdf.columns([['Fecha de emisión',r.fechaEmisionISO||r.fecha_emision?dateOnly(r.fechaEmisionISO||r.fecha_emision):r.emision],['Fecha de vencimiento',r.fechaVencimientoISO||r.fecha_vencimiento?dateOnly(r.fechaVencimientoISO||r.fecha_vencimiento):r.vencimiento]]);
    pdf.section('Detalle del servicio');pdf.billingTable(Number.isFinite(r.consumoM3)?r.consumoM3+' m³':'No disponible',r.monto);
    pdf.receiptTotal(r.monto,String(r.estado||'No disponible').toUpperCase());
    pdf.section('Información del documento');
    pdf.paragraph('El importe y el consumo proceden del recibo registrado. La base de datos no proporciona desglose tarifario, impuestos ni lecturas del medidor; este documento no estima esos conceptos.');
    pdf.paragraph('Proyecto universitario Hidro-Mejora. Este documento no sustituye un recibo oficial de la empresa prestadora.');return pdf.finish();
  }
  function payment(pago,r,context){
    if(!pago.codigo_operacion)throw Error('Código de operación no disponible.');
    const pdf=createDocument('CONSTANCIA DE PAGO',context,true);pdf.paymentAmount(pago.monto);pdf.operation(pago.codigo_operacion);
    pdf.columns([['Fecha de pago',global.HMShared.ui.date(pago.fecha_pago,true)],['Método registrado',pago.metodo]]);
    pdf.section('Suministro y recibo asociado');pdf.columns([['Número de suministro',context.supply],['Referencia interna','R-'+pago.id_recibo]]);
    if(context.email)pdf.row('Correo del usuario',context.email);pdf.row('Periodo registrado',pago.periodo||r.periodo||r.etiqueta);
    pdf.section('Alcance de la constancia');pdf.paragraph('Esta constancia acredita el registro de una operación dentro del prototipo Hidro-Mejora. No se realiza un cargo bancario ni se acredita una transacción ante una entidad financiera.');
    pdf.paragraph('Los datos de la operación proceden del registro de pagos. Documento referencial sin valor oficial.');return pdf.finish();
  }
  global.HMDocuments={receipt,payment,receiptFileName,paymentFileName,save};
})(window);
