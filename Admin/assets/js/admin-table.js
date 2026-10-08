// Columnas por registro. Se mueven los botones originales y sus listeners.
(function(global){
  'use strict';
  const {node,date,money}=global.HMShared.ui;
  const definitions={
    'admin-usu-list':['Usuarios y suministros',['Cuenta','Suministro','Ubicación y registros','Rol','Estado','Acciones']],
    'admin-rec-list':['Recibos',['Recibo y periodo','Suministro','Fechas','Consumo','Importe','Estado','Acciones']],
    'admin-cortes-list':['Cortes de servicio',['Aviso','Motivo y cobertura','Programación','Estado','Acciones']],
    'admin-inc-list':['Incidencias',['Reporte','Suministro','Descripción y referencia','Fecha','Estado','Acciones']],
    'admin-pay-list':['Pagos registrados',['Pago y periodo','Suministro','Recibo y método','Operación y fecha','Importe']],
    'admin-ate-list':['Atención',['Solicitud','Suministro','Asunto y seguimiento','Fecha','Estado','Acciones']]
  };
  function stack(main,sub){const span=node('span','',main??'—');if(sub)span.append(node('small','cell-sub',sub));return span;}
  function columns(kind,d,heading,badge,actions){
    switch(kind){
      case 'admin-usu-list':return [heading,d.numero_suministro||'—',stack((d.distrito||'Sin distrito')+' / '+(d.zona||'Sin zona'),'Reg: '+date(d.fecha_registro)+' · Recibos: '+d.cantidad_recibos+' · Pagos: '+d.cantidad_pagos+' · Incidencias: '+d.cantidad_incidencias),d.rol==='admin'?'Administrador':'Usuario',badge,actions];
      case 'admin-rec-list':return [heading,d.numero_suministro,stack('Emisión '+date(d.fecha_emision),'Vence '+date(d.fecha_vencimiento)),Number(d.consumo_m3)+' m³',money(d.monto),badge,actions];
      case 'admin-cortes-list':return [heading,stack(d.motivo,d.alcance==='General'?'Cobertura general':(d.distrito||'—')+' / '+(d.zona||'—')),stack(date(d.fecha_inicio,true),date(d.fecha_fin,true)),badge,actions];
      case 'admin-inc-list':return [stack(heading.textContent,d.tipo),d.numero_suministro,stack(d.descripcion,'Ref: '+(d.referencia||'—')),date(d.fecha_registro),badge,actions];
      case 'admin-pay-list':return [heading,d.numero_suministro,stack('Recibo #'+d.id_recibo,d.metodo||'—'),stack(d.codigo_operacion||'—',date(d.fecha_pago)),money(d.monto)];
      case 'admin-ate-list':return [heading,d.numero_suministro,stack(d.asunto,d.descripcion+(d.respuesta?' · Respuesta: '+d.respuesta:'')),date(d.fecha_registro),badge,actions];
      default:return [];
    }
  }
  function iconActions(actions){
    actions.querySelectorAll('button').forEach(button=>{
      const text=button.textContent;const name=/Editar/.test(text)?'edit':/Anular|Cancelar/.test(text)?'cancel':/foto/i.test(text)?'photo':/Responder/.test(text)?'support':'eye';
      button.prepend(global.HMShared.icons.icon(name));
    });
  }
  global.HMAdminTable=function(list){
    const definition=definitions[list.id];if(!definition)return;
    const records=[...list.children].filter(node=>node.classList.contains('inc-item'));
    list.classList.add('table-scroll');list.setAttribute('role','region');
    list.setAttribute('aria-label',definition[0]);list.tabIndex=0;
    if(!records.length)return;
    const table=document.createElement('table');table.className='tbl hm-table';
    const caption=document.createElement('caption');caption.className='sr-only';
    caption.textContent=definition[0]+': '+records.length+' registros mostrados';table.append(caption);
    const labels=definition[1];
    const head=document.createElement('thead');const header=document.createElement('tr');
    labels.forEach((label,index)=>{const th=document.createElement('th');th.scope='col';th.id=list.id+'-column-'+index;th.textContent=label;if(/Importe|Consumo/.test(label))th.className='number-cell';header.append(th);});
    head.append(header);table.append(head);
    const body=document.createElement('tbody');
    records.forEach(record=>{
      const row=document.createElement('tr');row.className='inc-item';
      const heading=record.querySelector('.row');const badge=heading?.querySelector('.badge');
      if(badge)badge.remove();
      const actions=record.querySelector('.tbl-actions')||node('span','cell-sub','Sin acciones disponibles');iconActions(actions);
      const values=columns(list.id,record.hmData,heading,badge||'—',actions);
      values.forEach((value,index)=>{
        const td=document.createElement('td');td.dataset.label=labels[index];td.setAttribute('headers',list.id+'-column-'+index);
        if(/Importe|Consumo/.test(labels[index]))td.classList.add('number-cell');
        if(/Estado/.test(labels[index]))td.classList.add('state-cell');
        if(/Fechas|Fecha|Programación/.test(labels[index]))td.classList.add('cell-date');
        if(value instanceof Node)td.append(value);else td.textContent=value??'—';row.append(td);
      });
      body.append(row);
    });
    table.append(body);list.replaceChildren(table);
  };
})(window);
