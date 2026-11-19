/* Documentos A4 de Hidro-Mejora: jsPDF, datos registrados y ninguna tarifa estimada. */
(function(global){
  'use strict';
  const C={
    navy:[10, 37, 64],
    blue:[8, 99, 117],
    sky:[20, 150, 172],
    green:[30, 148, 96],
    greenInk:[20, 99, 64],
    warning:[211, 139, 32],
    red:[204, 63, 71],
    greenPale:[229, 246, 238],
    muted:[85, 109, 128],
    text:[20, 41, 59],
    border:[215, 227, 238],
    pale:[242, 250, 252],
    white:[255, 255, 255]
  };
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
  function createDocument(kind,context,reference,payment=false){
    const doc=new global.jspdf.jsPDF({unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true});
    const left=16,right=194,width=178,bottom=258;
    const generatedText=global.HMShared.ui.date(context.generatedAt?new Date(context.generatedAt):new Date(),true)+' (hora de Lima)';
    let y=0;
    doc.setProperties({title:kind+' | Hidro-Mejora',subject:'Proyecto universitario. Documento referencial sin valor oficial.',author:'Hidro-Mejora'});
    function write(value,x,yy,{size=9,color=C.text,bold=false,align='left'}={}){doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(...color);doc.text(text(value)||'-',x,yy,{align});}
    function line(yy){doc.setDrawColor(...C.border);doc.setLineWidth(.25);doc.line(left,yy,right,yy);}
    function box(x,yy,w,h,color){doc.setFillColor(...color);doc.roundedRect(x,yy,w,h,3,3,'F');}
    function header(continued=false){
      doc.setFillColor(...C.navy);
      doc.rect(0,0,210,3,'F');
      doc.setFillColor(...C.sky);
      doc.rect(150,0,60,3,'F');
      let brandX=left;
      if(context.logo?.data){
        const ratio=Number(context.logo.width || 1)/Number(context.logo.height || 1);
        const w=Math.min(15,15*ratio), h=w/ratio;
        doc.addImage(context.logo.data,'PNG',left,14+(15-h)/2,w,h);
        brandX+=18;
      }
      write('HIDRO-MEJORA',brandX,20,{size:13,color:C.navy,bold:true});
      write('Gestión de servicios de agua',brandX,26,{size:8,color:C.muted});
      write('PROYECTO UNIVERSITARIO',right,15,{size:7,color:C.blue,bold:true,align:'right'});
      write(kind,right,23,{size:13,color:C.navy,bold:true,align:'right'});
      line(32);
      y=42;
      if(!continued){
        box(left,36,width,10,payment?[254,244,226]:C.pale);
        write('Entorno de pruebas · Sin cobros reales',left+4,42,{size:8,color:C.navy,bold:true});
        y=54;
        row(payment?'Código de operación':'Número de recibo',reference);
      }
    }
    function ensure(height){if(y+height>bottom){doc.addPage();header(true);}}
    function section(label){ensure(19);doc.setFillColor(...C.blue);doc.rect(left,y-3,2,6,'F');write(label.toUpperCase(),left+5,y+1,{size:8.5,color:C.navy,bold:true});y+=8;}
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
      doc.setFont('helvetica','bold');doc.setFontSize(10);const gap=4,cellWidth=(width-gap*(fields.length-1))/fields.length;
      const values=fields.map(f=>doc.splitTextToSize(text(f[1])||'No disponible',cellWidth-12));
      if(values.some(v=>v.length>4)){fields.forEach(f=>row(...f));return;}
      const h=(payment?11:15)+Math.max(...values.map(v=>v.length))*5;ensure(h+6);
      fields.forEach((f,index)=>{const x=left+index*(cellWidth+gap);box(x,y-4,cellWidth,h,C.pale);write(f[0].toUpperCase(),x+6,y+2,{size:7,color:C.muted,bold:true});values[index].forEach((v,n)=>write(v,x+6,y+10+n*5,{size:10,bold:true}));});y+=h+(payment?3:5);
    }
    function paragraph(value){doc.setFont('helvetica','normal');doc.setFontSize(8.2);const lines=doc.splitTextToSize(text(value),width-10);for(const v of lines){ensure(6);write(v,left+5,y,{size:8.2,color:C.muted});y+=4.5;}y+=3;}
    function billingTable(consumption,amount){
      ensure(37);box(left,y-4,width,10,C.pale);
      write('CONCEPTO REGISTRADO',left+5,y+2,{size:7.5,color:C.navy,bold:true});write('CONSUMO',left+125,y+2,{size:7.5,color:C.navy,align:'right'});write('IMPORTE',right-5,y+2,{size:7.5,color:C.navy,align:'right'});
      y+=10;line(y-3);write('Total del recibo de servicio',left+5,y+7,{size:9});write(consumption,left+125,y+7,{align:'right'});write(money(amount),right-5,y+7,{align:'right',bold:true});y+=13;line(y-2);write('TOTAL REGISTRADO DEL RECIBO',left+5,y+4,{size:8,color:C.navy,bold:true});write(money(amount),right-5,y+4,{align:'right',bold:true});y+=13;
    }
    function amount(value,x,baseline,available){
      const formatted=money(value);
      doc.setFont('helvetica','bold');
      doc.setFontSize(25);
      const size=Math.min(25,25*available/doc.getTextWidth(formatted));
      write(formatted,x,baseline,{size,color:C.navy,bold:true});
    }
    function receiptSummary(r,context){
      const fields=[['Número de suministro',context.supply],['Periodo registrado',r.periodo||r.etiqueta]];
      if(context.email)fields.push(['Correo del titular',context.email]);
      doc.setFont('helvetica','normal');
      doc.setFontSize(9);
      const lines=fields.map(field=>doc.splitTextToSize(text(field[1])||'No disponible',91));
      const long=lines.some(value=>value.length>4);
      if(long){
        section('Identificación del suministro');
        fields.forEach(field=>row(...field));
      }
      const height=long?32:Math.max(39,9+lines.reduce((sum,value)=>sum+6+4*value.length,0));
      ensure(height+5);
      const x=long?left:left+105, w=right-x;
      if(!long){
        box(left,y-3,100,height,C.pale);
        let baseline=y+4;
        fields.forEach(([label],index)=>{
          write(label,left+5,baseline,{size:7.5,color:C.muted});
          for(const value of lines[index]){
            baseline+=4;
            write(value,left+5,baseline,{size:9});
          }
          baseline+=6;
        });
      }
      box(x,y-3,w,height,C.pale);
      doc.setFillColor(...C.blue);
      doc.rect(x,y,1.5,height-6,'F');
      write('TOTAL DEL RECIBO',x+6,y+4,{size:8,color:C.navy,bold:true});
      amount(r.monto,x+6,y+16,w-12);
      write('Estado registrado',x+6,y+23,{size:7.5,color:C.muted});
      write(String(r.estado||'No disponible').toUpperCase(),x+6,y+28,{size:9,bold:true});
      y+=height+4;
    }
    function paymentSummary(value,label,status,state){
      ensure(35);
      box(left,y-3,width,30,C.pale);
      doc.setFillColor(...C.blue);
      doc.rect(left,y,1.5,24,'F');
      write(label,left+6,y+5,{size:8,color:C.navy,bold:true});
      amount(value,left+6,y+20,94);
      write('ESTADO DE LA OPERACIÓN',left+105,y+5,{size:7.5,color:C.muted,bold:true});
      const confirmed=['verificada_manual','acreditada_proveedor'].includes(state);
      doc.setFont('helvetica','bold');
      doc.setFontSize(9);
      const lines=doc.splitTextToSize(status,width-112);
      lines.forEach((line,i)=>write(line,left+105,y+14+i*4.5,{size:9,color:confirmed?C.greenInk:C.navy,bold:true}));
      y+=34;
    }
    function finish(){
      const pages=doc.getNumberOfPages();for(let page=1;page<=pages;page++){doc.setPage(page);line(268);write('HIDRO-MEJORA  /  Documento referencial sin valor oficial',left,274,{size:7,color:C.navy,bold:true});write('Página '+page+' de '+pages,right,274,{size:7.5,color:C.muted,align:'right'});write('No es un comprobante oficial de SEDAPAL ni de SUNAT.',left,279,{size:7.5,color:C.muted});write('Generado: '+generatedText,left,284,{size:7,color:C.muted});}return doc;
    }
    header();return{section,row,columns,paragraph,billingTable,receiptSummary,paymentSummary,finish};
  }
  function receipt(r,context){
    const pdf=createDocument('RECIBO DE SERVICIO',context,'R-'+r.id_recibo);
    pdf.receiptSummary(r,context);
    const consumption=r.consumoM3??r.consumo_m3;
    const recorded=consumption!==null&&consumption!==undefined&&consumption!==''&&Number.isFinite(Number(consumption));
    const quantity=recorded?Number(consumption)+' m³':'No disponible';
    pdf.columns([
      ['Fecha de emisión',r.fechaEmisionISO||r.fecha_emision?dateOnly(r.fechaEmisionISO||r.fecha_emision):r.emision],
      ['Fecha de vencimiento',r.fechaVencimientoISO||r.fecha_vencimiento?dateOnly(r.fechaVencimientoISO||r.fecha_vencimiento):r.vencimiento],
      ['Consumo registrado',quantity]
    ]);
    pdf.section('Detalle del servicio');
    pdf.billingTable(quantity,r.monto);
    pdf.section('Información y verificación de pagos');
    pdf.paragraph('El recibo muestra el consumo y el importe registrados. No incluye estimaciones de tarifas oficiales, impuestos ni lecturas del medidor.');
    pdf.paragraph('Una declaración de pago o captura de pantalla no acredita fondos ni cancela una deuda. Consulta el estado vigente desde tu cuenta.');
    pdf.section('Alcance académico');
    pdf.paragraph('Hidro-Mejora es un proyecto universitario independiente. No mantiene relación oficial con SEDAPAL.');
    return pdf.finish();
  }
  function payment(pago,r,context){
    if(!pago.codigo_operacion)throw Error('Código de operación no disponible.');
    const statuses={demostrativa:'Operación registrada',declarada:'Transferencia declarada',pendiente_verificacion:'Pendiente de verificación',verificada_manual:'Verificada manualmente',acreditada_proveedor:'Aprobación registrada',rechazada:'Rechazada',cancelada:'Cancelada',reembolsada:'Reembolso registrado'};
    const pilot=pago.entorno==='piloto_manual',realPilot=pilot&&pago.piloto_ensayo===false;
    const synthetic=pago.entorno==='simulado'||pago.piloto_ensayo===true;
    const status=pago.metodo==='yape_manual'&&pago.estado==='pendiente_verificacion'?(synthetic?'Pendiente de revisión':'Pendiente de verificación'):pago.metodo==='yape_manual'&&pago.estado==='verificada_manual'?(synthetic?'Operación confirmada':'Transferencia auténtica verificada manualmente'):(statuses[pago.estado]||'Histórico sin verificación financiera');
    const kind='CONSTANCIA DE OPERACIÓN';
    const pdf=createDocument(kind,context,pago.codigo_operacion,true);
    pdf.paymentSummary(pago.monto,realPilot&&pago.estado==='verificada_manual'?'IMPORTE COMPROBADO MANUALMENTE':'IMPORTE REGISTRADO - SIN ACREDITACIÓN FINANCIERA',status,pago.estado);
    pdf.columns([['Número de recibo','R-'+pago.id_recibo],['Número de suministro',context.supply]]);
    pdf.columns([['Periodo registrado',pago.periodo||r.periodo||r.etiqueta],['Método registrado',({demostrativo:'Registro directo',yape_manual:'Pago con Yape',proveedor_simulado:'Proveedor de pruebas'})[pago.metodo]||pago.metodo]]);
    pdf.section('Datos de la operación');
    if(pago.id)pdf.row('Identificador interno',pago.id);
    pdf.columns([[realPilot&&pago.metodo==='yape_manual'?'Número de operación de Yape':'Referencia declarada',pago.referencia||'No declarada'],['Fecha registrada',pago.fecha_pago?global.HMShared.ui.date(pago.fecha_pago,true)+' (America/Lima)':'No disponible']]);
    if(pago.revisado_en)pdf.columns([['Revisión del servidor',global.HMShared.ui.date(pago.revisado_en,true)+' (America/Lima)'],['Revisor interno',pago.revisado_por?'Administrador #'+pago.revisado_por:'No disponible']]);
    if(realPilot)pdf.row('Recepción comprobada',pago.recibido_en?global.HMShared.ui.date(pago.recibido_en,true)+' (America/Lima)':'Fecha bancaria no registrada');
    if(!pilot&&pago.proveedor_id)pdf.row('Referencia del proveedor',pago.proveedor_id);
    if(pago.motivo&&!pilot)pdf.row('Motivo registrado',global.HMShared.ui.paymentAuditMessage(pago.motivo));
    pdf.section('Alcance del documento');
    pdf.paragraph(synthetic?'No se recibió dinero ni se procesó un cargo bancario. Esta constancia no acredita fondos ni cancela una deuda real.':realPilot&&pago.estado==='verificada_manual'?'Recepción comprobada personalmente según la revisión administrativa. No es una confirmación automática de Yape.':'Registro de una operación. No demuestra un cargo bancario ni recepción de fondos, ni cancela la deuda.');
    if(pilot)pdf.paragraph('No constituye un comprobante oficial de servicio de agua.');
    if(!pilot)pdf.paragraph('Consulta el historial desde tu cuenta. No se incluye QR público de validación.');
    return pdf.finish();
  }
  global.HMDocuments={receipt,payment,receiptFileName,paymentFileName,save,palette:Object.freeze(C)};
})(window);
