/* Documentos A4 del prototipo: jsPDF, datos registrados y ninguna tarifa estimada. */
(function(global){
  'use strict';
  const C={navy:[15,76,129],blue:[30,107,168],sky:[77,168,218],green:[46,139,87],greenInk:[33,102,63],warning:[217,164,65],red:[201,76,76],greenPale:[234,246,239],muted:[76,98,117],text:[36,55,70],border:[217,226,236],pale:[234,244,251],white:[255,255,255]};
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
    const left=16,right=194,width=178,bottom=262;
    const generatedText=global.HMShared.ui.date(context.generatedAt?new Date(context.generatedAt):new Date(),true)+' (hora del dispositivo)';
    let y=0;
    doc.setProperties({title:kind+' | Hidro-Mejora',subject:'Proyecto universitario. Documento referencial sin valor oficial.',author:'Hidro-Mejora'});
    function write(value,x,yy,{size=9,color=C.text,bold=false,align='left'}={}){doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(...color);doc.text(text(value)||'-',x,yy,{align});}
    function line(yy){doc.setDrawColor(...C.border);doc.setLineWidth(.25);doc.line(left,yy,right,yy);}
    function box(x,yy,w,h,color){doc.setFillColor(...color);doc.roundedRect(x,yy,w,h,3,3,'F');}
    function header(continued=false){
      box(left,14,width,continued?25:32,C.navy);
      let brandX=left+7;
      if(context.logo?.data){try{
        const ratio=Math.max(.01,Number(context.logo.width||1)/Number(context.logo.height||1));
        const w=ratio>=1?19:19*ratio,h=ratio>=1?19/ratio:19;
        box(left+5,19,22,22,C.white);doc.addImage(context.logo.data,'PNG',left+6.5+(19-w)/2,20.5+(19-h)/2,w,h);brandX=left+32;
      }catch(_){}}
      write('HIDRO-MEJORA',brandX,26,{size:14,color:C.white,bold:true});
      write('Gestión de servicios de agua',brandX,33,{size:8,color:C.white});
      write('INGENIERÍA DE SISTEMAS',right-7,25,{size:7,color:C.white,align:'right'});
      write('PROYECTO UNIVERSITARIO',right-7,32,{size:7.5,color:C.white,align:'right'});
      const titleSize=continued?12:19;doc.setFont('helvetica','bold');doc.setFontSize(titleSize);
      const title=doc.splitTextToSize(text(kind),width);
      title.forEach((t,i)=>write(t,left,(continued?49:61)+i*(continued?6:8),{size:titleSize,color:C.navy,bold:true}));
      y=(continued?56:68)+(title.length-1)*8;
      if(!continued){write('Entorno de pruebas · Sin cobros reales',left,y,{size:8,color:C.muted});y+=13;}
    }
    function ensure(height){if(y+height>bottom){doc.addPage();header(true);}}
    function section(label){ensure(19);doc.setFillColor(...C.blue);doc.rect(left,y-3,2,6,'F');write(label.toUpperCase(),left+5,y+1,{size:8.5,color:C.navy,bold:true});y+=payment?8:10;}
    function row(label,value){
      doc.setFont('helvetica','normal');doc.setFontSize(9);
      const values=doc.splitTextToSize(text(value)||'No disponible',width-58);let position=0;
      const labelLines=doc.splitTextToSize(text(label),49);
      while(position<values.length){
        ensure(Math.max(16,labelLines.length*4.5+6));
        const capacity=Math.max(1,Math.floor((bottom-y-6)/4.5));const lines=values.slice(position,position+capacity);
        labelLines.forEach((v,i)=>write(v+(position&&i===0?' (cont.)':''),left+4,y+i*4.5,{size:8,color:C.muted}));
        lines.forEach((v,i)=>write(v,left+58,y+i*4.5,{size:9}));
        y+=Math.max(lines.length,labelLines.length)*4.5+(payment?4:6);line(y-3);position+=lines.length;
      }
    }
    function columns(fields){
      doc.setFont('helvetica','normal');doc.setFontSize(10);const gap=4,cellWidth=(width-gap*(fields.length-1))/fields.length;
      const values=fields.map(f=>doc.splitTextToSize(text(f[1])||'No disponible',cellWidth-12));
      if(values.some(v=>v.length>4)){fields.forEach(f=>row(...f));return;}
      const h=(payment?11:15)+Math.max(...values.map(v=>v.length))*5;ensure(h+6);
      fields.forEach((f,index)=>{const x=left+index*(cellWidth+gap);box(x,y-4,cellWidth,h,C.pale);write(f[0].toUpperCase(),x+6,y+2,{size:7,color:C.muted,bold:true});values[index].forEach((v,n)=>write(v,x+6,y+10+n*5,{size:10,bold:true}));});y+=h+(payment?3:5);
    }
    function paragraph(value){doc.setFont('helvetica','normal');doc.setFontSize(8.2);const lines=doc.splitTextToSize(text(value),width-10);for(const v of lines){ensure(6);write(v,left+5,y,{size:8.2,color:C.muted});y+=4.5;}y+=payment?3:5;}
    function billingTable(consumption,amount){
      ensure(35);box(left,y-4,width,10,C.navy);
      write('CONCEPTO REGISTRADO',left+5,y+2,{size:7.5,color:C.white,bold:true});write('CONSUMO',left+125,y+2,{size:7.5,color:C.white,align:'right'});write('IMPORTE',right-5,y+2,{size:7.5,color:C.white,align:'right'});
      y+=10;box(left,y-2,width,19,C.pale);write('Total del recibo de servicio',left+5,y+7,{size:9});write(consumption,left+125,y+7,{align:'right'});write(money(amount),right-5,y+7,{align:'right',bold:true});y+=26;
    }
    function receiptTotal(value,status){
      ensure(37);box(left,y-3,width,31,C.pale);doc.setFillColor(...C.sky);doc.rect(left,y-1,2,27,'F');
      write('TOTAL DEL RECIBO',left+7,y+5,{size:8,color:C.muted,bold:true});write(money(value),left+7,y+20,{size:27,color:C.navy,bold:true});
      write('ESTADO REGISTRADO',right-7,y+5,{size:7.5,color:C.muted,align:'right'});write(status,right-7,y+17,{size:11,color:status==='PAGADO'?C.greenInk:C.navy,bold:true,align:'right'});y+=38;
    }
    function paymentAmount(value,label){
      ensure(34);box(left,y-3,width,29,C.pale);doc.setFillColor(...C.blue);doc.rect(left,y,2,27,'F');
      write(label||'IMPORTE REGISTRADO',left+8,y+5,{size:7.5,color:C.muted,bold:true});write(money(value),left+8,y+22,{size:27,color:C.navy,bold:true});
      write('PEN',right-8,y+22,{size:11,color:C.blue,bold:true,align:'right'});y+=34;
    }
    function statusBand(value,state){
      ensure(19);const confirmed=['verificada_manual','acreditada_proveedor'].includes(state),rejected=['rechazada','cancelada'].includes(state);
      const ink=confirmed?C.greenInk:rejected?[152,53,53]:C.navy,bg=confirmed?C.greenPale:rejected?[255,241,241]:C.pale;
      box(left,y-3,width,13,bg);write('ESTADO DE LA OPERACIÓN',left+5,y+5,{size:7,color:C.muted,bold:true});write(value,left+61,y+5,{size:9.5,color:ink,bold:true});y+=18;
    }
    function operation(value){section('Identificación de la operación');row('Código de operación',value);}
    function finish(){
      const pages=doc.getNumberOfPages();for(let page=1;page<=pages;page++){doc.setPage(page);line(276);write('HIDRO-MEJORA  /  Documento referencial sin valor oficial',left,282,{size:7,color:C.navy,bold:true});write('Página '+page+' de '+pages,right,282,{size:7.5,color:C.muted,align:'right'});write('No es un comprobante oficial de SEDAPAL ni de SUNAT.',left,287,{size:7.5,color:C.muted});write('Generado: '+generatedText,left,292,{size:7,color:C.muted});}return doc;
    }
    header();return{section,row,columns,paragraph,billingTable,receiptTotal,paymentAmount,statusBand,operation,finish};
  }
  function receipt(r,context){
    const pdf=createDocument('RECIBO DE SERVICIO',context);
    pdf.columns([['Número de recibo','R-'+r.id_recibo],['Número de suministro',context.supply]]);
    if(context.email)pdf.row('Correo del usuario',context.email);
    pdf.row('Periodo registrado',r.periodo||r.etiqueta);
    pdf.columns([['Fecha de emisión',r.fechaEmisionISO||r.fecha_emision?dateOnly(r.fechaEmisionISO||r.fecha_emision):r.emision],['Fecha de vencimiento',r.fechaVencimientoISO||r.fecha_vencimiento?dateOnly(r.fechaVencimientoISO||r.fecha_vencimiento):r.vencimiento]]);
    const consumption=r.consumoM3??r.consumo_m3;
    pdf.receiptTotal(r.monto,String(r.estado||'No disponible').toUpperCase());
    pdf.section('Detalle del servicio');pdf.billingTable(consumption!==null&&consumption!==undefined&&consumption!==''&&Number.isFinite(Number(consumption))?Number(consumption)+' m³':'No disponible',r.monto);
    pdf.section('Información y verificación de pagos');
    pdf.paragraph('Datos registrados, sin estimar tarifas, impuestos ni lecturas. Una declaración o captura no acredita fondos ni cancela la deuda.');
    return pdf.finish();
  }
  function payment(pago,r,context){
    if(!pago.codigo_operacion)throw Error('Código de operación no disponible.');
    const statuses={demostrativa:'Operación registrada',declarada:'Transferencia declarada',pendiente_verificacion:'Pendiente de verificación',verificada_manual:'Verificada manualmente',acreditada_proveedor:'Aprobación registrada',rechazada:'Rechazada',cancelada:'Cancelada',reembolsada:'Reembolso registrado'};
    const pilot=pago.entorno==='piloto_manual',realPilot=pilot&&pago.piloto_ensayo===false;
    const synthetic=pago.entorno==='simulado'||pago.piloto_ensayo===true;
    const status=pago.metodo==='yape_manual'&&pago.estado==='pendiente_verificacion'?(synthetic?'Pendiente de revisión':'Pendiente de verificación'):pago.metodo==='yape_manual'&&pago.estado==='verificada_manual'?(synthetic?'Operación confirmada':'Transferencia auténtica verificada manualmente'):(statuses[pago.estado]||'Histórico sin verificación financiera');
    const kind='CONSTANCIA DE OPERACIÓN';
    const pdf=createDocument(kind,context,true);
    pdf.paymentAmount(pago.monto,realPilot&&pago.estado==='verificada_manual'?'IMPORTE COMPROBADO MANUALMENTE':'IMPORTE REGISTRADO - SIN ACREDITACIÓN FINANCIERA');
    pdf.statusBand(status,pago.estado);
    pdf.columns([['Número de recibo','R-'+pago.id_recibo],['Número de suministro',context.supply]]);
    pdf.columns([['Periodo registrado',pago.periodo||r.periodo||r.etiqueta],['Método registrado',({demostrativo:'Registro directo',yape_manual:'Pago con Yape',proveedor_simulado:'Proveedor de pruebas'})[pago.metodo]||pago.metodo]]);
    pdf.section('Trazabilidad de la operación');
    pdf.row('Código de operación',pago.id||pago.codigo_operacion);
    pdf.columns([[realPilot&&pago.metodo==='yape_manual'?'Número de operación de Yape':'Código de operación',pago.referencia||'No declarada'],['Fecha registrada',pago.fecha_pago?global.HMShared.ui.date(pago.fecha_pago,true)+' (America/Lima)':'No disponible']]);
    if(pago.revisado_en)pdf.columns([['Revisión del servidor',global.HMShared.ui.date(pago.revisado_en,true)+' (America/Lima)'],['Revisor interno',pago.revisado_por?'Administrador #'+pago.revisado_por:'No disponible']]);
    if(realPilot)pdf.row('Recepción comprobada',pago.recibido_en?global.HMShared.ui.date(pago.recibido_en,true)+' (America/Lima)':'Fecha bancaria no registrada');
    if(!pilot&&pago.proveedor_id)pdf.row('Referencia del proveedor',pago.proveedor_id);
    if(pago.motivo&&!pilot)pdf.row('Motivo registrado',global.HMShared.ui.paymentAuditMessage(pago.motivo));
    pdf.section('Alcance del documento');
    pdf.paragraph(synthetic?'No se recibió dinero. La confirmación no acredita fondos ni cancela la deuda.':realPilot&&pago.estado==='verificada_manual'?'Recepción comprobada personalmente según la revisión administrativa. No es una confirmación automática de Yape.':'Registro de una operación. No demuestra un cargo bancario ni recepción de fondos, ni cancela la deuda.');
    if(pilot)pdf.paragraph('No constituye un comprobante oficial de servicio de agua.');
    if(!pilot)pdf.paragraph('Consulta el historial autenticado. No se incluye QR público de validación.');
    return pdf.finish();
  }
  global.HMDocuments={receipt,payment,receiptFileName,paymentFileName,save,palette:Object.freeze(C)};
})(window);
