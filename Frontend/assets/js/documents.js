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
    const left=16,right=194,width=178,bottom=payment?268:265,accent=payment?C.green:C.blue;
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
      write(context.example?'EJEMPLO SINTÉTICO - NO HUBO TRANSFERENCIA':'Documento referencial - sin valor oficial',left,59,{size:8,color:C.muted});y=payment?67:74;
    }
    function ensure(height){if(y+height>bottom){doc.addPage();header();}}
    function section(label){ensure(20);write(label.toUpperCase(),left,y,{size:8,color:accent,bold:true});y+=4;line(y);y+=payment?6:10;}
    function row(label,value){
      doc.setFont('helvetica','normal');doc.setFontSize(9);const values=doc.splitTextToSize(text(value)||'No disponible',width-58);let position=0;
      while(position<values.length){ensure(13);const step=payment?4.5:5,pad=payment?3:5;const capacity=Math.max(1,Math.floor((bottom-y-pad)/step));const lines=values.slice(position,position+capacity);
        write(label+(position?' (cont.)':''),left,y,{size:8,color:C.muted});lines.forEach((value,index)=>write(value,left+58,y+index*step,{size:payment?8.5:9}));y+=lines.length*step+pad;line(y-3);position+=lines.length;}
    }
    function columns(fields){
      doc.setFont('helvetica','normal');doc.setFontSize(10);const cellWidth=width/fields.length;
      const lines=fields.map(field=>doc.splitTextToSize(text(field[1])||'No disponible',cellWidth-10));
      // Valores largos mantienen paginación mediante filas; no se recortan datos.
      if(lines.some(value=>value.length>5)){fields.forEach(field=>row(...field));return;}
      const height=(payment?10:13)+Math.max(...lines.map(value=>value.length))*(payment?4.5:5);ensure(height);
      fields.forEach((field,index)=>{const x=left+index*cellWidth;write(field[0].toUpperCase(),x,y,{size:7,color:C.muted,bold:true});lines[index].forEach((value,n)=>write(value,x,y+7+n*5,{size:10,bold:true}));});y+=height;
    }
    function paragraph(value){doc.setFont('helvetica','normal');doc.setFontSize(payment?8:8.5);const lines=doc.splitTextToSize(text(value),width);lines.forEach(value=>{ensure(6);write(value,left,y,{size:payment?8:8.5,color:C.muted});y+=payment?4.2:5;});y+=payment?3:5;}
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
    function paymentAmount(value,label){
      ensure(37);doc.setFillColor(...C.greenPale);doc.roundedRect(left,y-3,width,29,3,3,'F');
      doc.setDrawColor(...C.green);doc.setLineWidth(.5);doc.circle(left+12,y+11,5);write('i',left+12,y+13,{size:12,color:C.green,bold:true,align:'center'});
      write(label||'OPERACIÓN SIN ACREDITACIÓN FINANCIERA',left+24,y+4,{size:7.5,color:C.green,bold:true});write(money(value),left+24,y+19,{size:24,color:C.navy,bold:true});y+=34;
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
    const consumption=r.consumoM3??r.consumo_m3;
    pdf.section('Detalle del servicio');pdf.billingTable(consumption!==null&&consumption!==undefined&&consumption!==''&&Number.isFinite(Number(consumption))?Number(consumption)+' m³':'No disponible',r.monto);
    pdf.receiptTotal(r.monto,String(r.estado||'No disponible').toUpperCase());
    pdf.section('Información y verificación de pagos');
    pdf.paragraph('Importe y consumo registrados, sin estimar tarifas, impuestos ni lecturas. Una declaración, demostración o captura no acredita fondos ni cancela la deuda. Consulta la verificación en tu historial.');
    pdf.paragraph('Hidro-Mejora: proyecto universitario. No es un comprobante oficial de SEDAPAL ni de SUNAT.');return pdf.finish();
  }
  function payment(pago,r,context){
    if(!pago.codigo_operacion)throw Error('Código de operación no disponible.');
    const statuses={demostrativa:'Operación demostrativa',declarada:'Transferencia declarada',pendiente_verificacion:'Pendiente de verificación',verificada_manual:'Verificada manualmente',acreditada_proveedor:'Aprobada por proveedor simulado',rechazada:'Rechazada',cancelada:'Cancelada',reembolsada:'Reembolso simulado'};
    const pilot=pago.entorno==='piloto_manual',realPilot=pilot&&pago.piloto_ensayo===false;
    const status=pilot&&pago.estado==='pendiente_verificacion'?'Pendiente de comprobación':pilot&&pago.estado==='verificada_manual'?(realPilot?'Transferencia verificada manualmente':'Ensayo sintético revisado manualmente'):(statuses[pago.estado]||'Histórico sin verificación financiera');
    const kind=pilot?'CONSTANCIA DE TRANSFERENCIA':pago.estado==='verificada_manual'?'CONSTANCIA DE REVISIÓN MANUAL':pago.estado==='acreditada_proveedor'?'CONSTANCIA DE OPERACIÓN SIMULADA':pago.estado==='demostrativa'?'CONSTANCIA DEMOSTRATIVA':'CONSTANCIA DE OPERACIÓN';
    const pdf=createDocument(kind,context,true);
    pdf.paymentAmount(pago.monto,realPilot&&pago.estado==='verificada_manual'?'IMPORTE COMPROBADO MANUALMENTE - PILOTO LOCAL':'IMPORTE REGISTRADO - SIN ACREDITACIÓN FINANCIERA');
    pdf.columns([['Estado de verificación',status],['Moneda','PEN - soles peruanos']]);
    pdf.row('Operación / verificación',pago.id||pago.codigo_operacion);
    pdf.columns([['Fecha y hora del servidor',pago.fecha_pago?global.HMShared.ui.date(pago.fecha_pago,true)+' (America/Lima)':'No disponible'],['Método registrado',({demostrativo:'Demostración',yape_manual:'Yape - revisión manual',proveedor_simulado:'Proveedor simulado'})[pago.metodo]||pago.metodo]]);
    pdf.columns([['Número de suministro',context.supply],['Referencia interna','R-'+pago.id_recibo]]);
    pdf.row('Periodo registrado',pago.periodo||r.periodo||r.etiqueta);
    pdf.section('Trazabilidad de la operación');
    pdf.row('Referencia declarada',pago.referencia||'No declarada');
    if(!pilot)pdf.row('Referencia del proveedor',pago.proveedor_id||'Sin confirmación comercial');
    if(pilot)pdf.row('Recepción comprobada',pago.recibido_en?global.HMShared.ui.date(pago.recibido_en,true)+' (America/Lima)':'No comprobada');
    if(pago.revisado_en){
      pdf.columns([['Revisión del servidor',global.HMShared.ui.date(pago.revisado_en,true)+' (America/Lima)'],['Revisor interno',pago.revisado_por?'Administrador #'+pago.revisado_por:'No disponible']]);
    }
    if(pago.motivo&&!pilot)pdf.row('Motivo registrado',pago.motivo);
    pdf.section('Alcance de la constancia');
    pdf.paragraph(pilot?(realPilot&&pago.estado==='verificada_manual'?'El administrador declaró haber comprobado personalmente la recepción de una transferencia externa por Yape. No es una confirmación automática del proveedor ni un pago de servicio de agua.':'Ensayo de piloto o recepción aún no comprobada. No acredita una transferencia real ni el pago de un servicio de agua.'):pago.estado==='verificada_manual'?'Se registró una revisión manual en un entorno de pruebas. Requiere comprobar por separado el movimiento receptor; una captura no constituye validación automática.':pago.estado==='acreditada_proveedor'?'El proveedor simulado informó una aprobación de prueba. No existe un cargo real ni una acreditación bancaria.':'Esta constancia acredita únicamente el registro de una operación. No demuestra un cargo bancario ni cancela por sí sola la deuda.');
    if(pilot)pdf.paragraph('Recibo y suministro sintéticos del piloto. Sin datos de la cuenta receptora. No constituye un comprobante oficial de servicio de agua.');
    pdf.paragraph('Entorno: '+(pago.entorno||'histórico, origen financiero no verificado')+'. Sin valor tributario. No es un comprobante oficial de SEDAPAL ni de SUNAT.');
    pdf.paragraph('Consulta el historial autenticado en Hidro-Mejora. No se incluye QR público: todavía no existe un servicio de validación documental público y seguro.');
    return pdf.finish();
  }
  global.HMDocuments={receipt,payment,receiptFileName,paymentFileName,save};
})(window);
