/* Gestión de operaciones: datos autenticados, revisión explícita e historial conservado. */
(function(root){'use strict';
 root.createHMPaymentManagement=function({apiFetch,active,notify}){
  const host=document.getElementById('admin-operation-manager');let generation=0,disposed=false,page=1,tab='pendientes',timer,op=null,busy=false,opener=null,proofUrl=null,loadPromise=null,loadAgain=false,lastRendered=null;
  const ui=root.HMShared.ui,el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
  const synthetic=o=>o.entorno==='simulado'||o.piloto_ensayo===true;
  const label=o=>o.estado==='pendiente_verificacion'?(synthetic(o)?'Pendiente de revisión':'Pendiente de verificación'):({rechazada:'Rechazada',cancelada:'Cancelada',demostrativa:'Demostración sin dinero',acreditada_proveedor:'Aprobada por simulador'})[o.estado]||(o.estado==='verificada_manual'?(synthetic(o)?'Ensayo confirmado':'Transferencia auténtica verificada manualmente'):o.estado);
  host.innerHTML=`<div class="payment-tabs" role="group" aria-label="Secciones de operaciones"></div>
   <div class="payment-filters"><div class="field"><label for="operation-search">Buscar operación</label><input id="operation-search" type="search" maxlength="100" placeholder="Suministro, recibo o referencia"></div><div class="field"><label for="operation-method">Método</label><select id="operation-method"><option value="">Todos los métodos</option><option value="yape_manual">Yape manual</option><option value="demostrativo">Demostración</option><option value="proveedor_simulado">Proveedor simulado</option></select></div></div>
   <p id="admin-operation-status" role="status" aria-live="polite"></p><div id="admin-operation-list"></div>
   <nav class="payment-pagination" aria-label="Páginas de operaciones"><button type="button" class="btn-sm" data-page="previous">Anterior</button><span id="operation-page"></span><button type="button" class="btn-sm" data-page="next">Siguiente</button></nav>
   <dialog class="payment-dialog" aria-labelledby="operation-dialog-title"><header><h3 id="operation-dialog-title" tabindex="-1">Revisar operación</h3><button type="button" class="icon-btn" data-close aria-label="Cerrar revisión">×</button></header><div class="payment-dialog-body"><div id="operation-summary"></div><div id="operation-history"></div><form id="operation-review" aria-describedby="operation-error" novalidate></form><p id="operation-error" role="alert" aria-live="assertive"></p></div></dialog>`;
  const $=s=>host.querySelector(s),dialog=$('dialog'),form=$('#operation-review'),message=$('#operation-error');
  const names={pendientes:'Pendientes de revisión',confirmadas:'Confirmadas',rechazadas:'Rechazadas',simulaciones:'Simulaciones',historial:'Historial completo'};
  for(const[key,name]of Object.entries(names)){const b=el('button',name,'btn-sm');b.type='button';b.dataset.tab=key;b.setAttribute('aria-pressed',String(key===tab));b.addEventListener('click',()=>{tab=key;page=1;load();});$('.payment-tabs').append(b);}
  function clearProof(){if(proofUrl)URL.revokeObjectURL(proofUrl);proofUrl=null;}
  function close(){if(busy)return;dialog.close();op=null;form.replaceChildren();$('#operation-history').replaceChildren();clearProof();if(opener?.isConnected)opener.focus();else $('[data-tab][aria-pressed="true"]').focus();}
  $('[data-close]').addEventListener('click',close);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  $('#operation-search').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{page=1;load();},250);});$('#operation-method').addEventListener('change',()=>{page=1;load();});
  for(const b of host.querySelectorAll('[data-page]'))b.addEventListener('click',()=>{page+=b.dataset.page==='next'?1:-1;load();});
  function load(){
   if(disposed||!active())return Promise.resolve();generation++;
   if(loadPromise){loadAgain=true;return loadPromise;}
   loadPromise=(async()=>{do{loadAgain=false;await loadOnce(generation);}while(loadAgain&&!disposed&&active());})().finally(()=>{loadPromise=null;});return loadPromise;
  }
  async function loadOnce(version){
   if(disposed||!active())return;const status=$('#admin-operation-status');status.textContent='Consultando operaciones…';$('#admin-operation-list').setAttribute('aria-busy','true');
   try{const params=new URLSearchParams({page:String(page),tab,q:$('#operation-search').value,metodo:$('#operation-method').value});const r=await apiFetch('/api/admin/operaciones-pago?'+params);const d=await r.json();if(!r.ok)throw Error(d.mensaje||'No se pudieron consultar las operaciones.');if(disposed||!active()||version!==generation)return;
    page=d.pagina;for(const b of host.querySelectorAll('[data-tab]')){b.textContent=names[b.dataset.tab]+' ('+d.contadores[b.dataset.tab]+')';b.setAttribute('aria-pressed',String(tab===b.dataset.tab));}
    status.textContent=d.total+(d.total===1?' operación':' operaciones')+' · Las simulaciones no acreditan dinero ni cancelan deudas.';
    const signature=JSON.stringify([tab,page,d.operaciones]);
    const list=$('#admin-operation-list');if(signature!==lastRendered){lastRendered=signature;list.replaceChildren();
    if(!d.operaciones.length)list.append(el('p','No hay operaciones en esta sección.','payment-empty'));
    else{const table=el('table',null,'payment-table'),caption=el('caption',names[tab]);table.append(caption);const head=el('thead'),hr=el('tr'),columns=['Recibo / suministro','Importe','Método / entorno','Código / operación','Estado','Registro','Acción'];for(const c of columns){const th=el('th',c);th.scope='col';hr.append(th);}head.append(hr);table.append(head);const body=el('tbody');
     for(const o of d.operaciones){const row=el('tr');row.dataset.operation=o.id;
      const values=['R-'+o.id_recibo+' · '+o.numero_suministro,ui.money(o.monto),o.metodo==='yape_manual'?'Yape · '+(synthetic(o)?'Ensayo sintético':o.entorno==='piloto_manual'?'Piloto real manual':'Simulación'):o.metodo==='demostrativo'?'Demostración':'Proveedor simulado',o.referencia||'No declarada',label(o),ui.date(o.fecha_pago,true)];
      values.forEach((v,i)=>{const td=el('td',v);td.dataset.label=i===3?(synthetic(o)?'Código de prueba':'Número de operación de Yape'):columns[i];if(i===4)td.className='payment-state state-'+o.estado;row.append(td);});const td=el('td');td.dataset.label='Acción';const pending=o.estado==='pendiente_verificacion'&&o.metodo==='yape_manual',button=el('button',pending?'Revisar':'Ver historial','btn-sm detail');button.type='button';button.addEventListener('click',()=>open(o,button));td.append(button);row.append(td);body.append(row);
     }table.append(body);list.append(table);}
    }
    $('#operation-page').textContent='Página '+page+' de '+d.paginas;$('[data-page="previous"]').disabled=page<=1;$('[data-page="next"]').disabled=page>=d.paginas;
   }catch(e){if(!disposed&&active()&&version===generation&&e.name!=='AbortError'){status.textContent=(e.message||'Sin conexión.')+' Vuelve a seleccionar la sección para reintentar.';}}
   finally{if(!disposed&&version===generation)$('#admin-operation-list').removeAttribute('aria-busy');}
  }
  function field(key,title,type='text',required=false){const wrap=el('div',null,'field'),l=el('label',title),i=el(type==='textarea'?'textarea':'input');i.id='review-'+key;i.name=key;if(type!=='textarea')i.type=type;i.required=required;i.autocomplete='off';if(type==='textarea'){i.maxLength=500;i.minLength=8;i.rows=2;}l.htmlFor=i.id;wrap.append(l,i);form.append(wrap);return i;}
  function check(key,text){const l=el('label',null,'payment-check'),i=el('input');i.type='checkbox';i.name=key;i.required=true;l.append(i,el('span',text));form.append(l);return i;}
  async function open(o,button){
   if(busy||disposed)return;op=o;opener=button;clearProof();form.replaceChildren();message.textContent='';$('#operation-summary').replaceChildren(el('p','R-'+o.id_recibo+' · Suministro '+o.numero_suministro+' · '+ui.money(o.monto)),el('p',(synthetic(o)?'Código de prueba: ':'Número de operación de Yape: ')+(o.referencia||'No declarada')),el('p','Período: '+(o.periodo||'No disponible')),el('p',synthetic(o)?'Ensayo sintético. No existe movimiento bancario que comprobar.':'La recepción se comprueba por separado en Yape. El sistema no consulta tu cuenta.'),el('small','Operación '+o.id));
   $('#operation-history').replaceChildren();$('#operation-dialog-title').textContent=o.estado==='pendiente_verificacion'?'Revisar operación':'Estado e historial';dialog.showModal();$('#operation-dialog-title').focus();
   if(o.estado==='pendiente_verificacion'&&o.metodo==='yape_manual'){
    if(synthetic(o))check('ensayo_confirmado','He revisado este ensayo sintético; no acredita dinero ni cancela una deuda.');
    else{const amount=field('monto_recibido','Importe recibido en S/','text',true);amount.inputMode='decimal';amount.pattern='[0-9]+[.][0-9]{2}';field('referencia_comprobada','Número de operación de Yape comprobado','text',true).maxLength=100;
     check('movimiento_comprobado','He comprobado personalmente la recepción efectiva, el importe y la referencia en mis movimientos Yape.');check('receptor_comprobado','El movimiento corresponde al receptor autorizado. Una captura no acredita dinero.');}
    field('motivo','Motivo breve de revisión (obligatorio para rechazar)','textarea');
    form.append(el('p','La fecha y el administrador de revisión se registran automáticamente. La fecha bancaria no se presume.','hint'));
    const actions=el('div',null,'payment-review-actions');for(const[value,text,cls]of[['rechazar','Rechazar con motivo','btn btn-danger'],['confirmar',synthetic(o)?'Confirmar ensayo':'Confirmar recepción manual','btn btn-primary']]){const b=el('button',text,cls);b.type='submit';b.value=value;actions.append(b);}form.append(actions);
   }
   if(o.tiene_comprobante){const proof=el('button','Ver comprobante protegido','btn-sm');proof.type='button';$('#operation-history').append(proof);proof.addEventListener('click',async()=>{proof.disabled=true;try{const r=await apiFetch('/api/admin/operaciones-pago/'+o.id+'/comprobante');if(!r.ok)throw Error('No se pudo abrir el comprobante.');const blob=await r.blob();if(op!==o||disposed)return;clearProof();proofUrl=URL.createObjectURL(blob);const img=el('img');img.alt='Comprobante declarado: no acredita recepción';img.src=proofUrl;img.className='payment-proof';$('#operation-history').append(img);}catch(e){message.textContent=e.message;}finally{proof.disabled=false;}});}
   try{const r=await apiFetch('/api/admin/operaciones-pago/'+o.id);if(!r.ok)throw Error('No se pudo consultar el historial.');const d=await r.json();if(op!==o||disposed||!active())return;const details=el('details'),summary=el('summary','Historial de auditoría');details.append(summary);for(const h of d.historial)details.append(el('p',ui.date(h.fecha,true)+' · '+label({...o,...h})+' · '+h.motivo+' · Actor '+(h.actor_id||'proveedor')));if(o.revisado_en)details.append(el('p','Revisión del servidor: '+ui.date(o.revisado_en,true)+' · Administrador #'+o.revisado_por));$('#operation-history').append(details);}catch(e){if(op===o&&!disposed)message.textContent=e.message;}
  }
  form.addEventListener('submit',async e=>{
   e.preventDefault();if(busy||!op)return;const action=e.submitter?.value;if(!['confirmar','rechazar'].includes(action))return;
   const reason=form.elements.motivo;function invalid(i,text){message.textContent=text;i.setAttribute('aria-invalid','true');i.focus();}
   for(const i of form.elements)i.removeAttribute('aria-invalid');
   if((action==='rechazar'||reason.value.trim())&&reason.value.trim().length<8)return invalid(reason,'Explica el rechazo con al menos 8 caracteres.');
   if(reason.value.length>500)return invalid(reason,'El motivo admite hasta 500 caracteres.');
   if(action==='confirmar'){for(const i of form.querySelectorAll('[required]'))if(!i.checkValidity())return invalid(i,i.type==='checkbox'?'Confirma la comprobación indicada antes de continuar.':'Completa '+i.previousElementSibling?.textContent+' correctamente.');}
   if(action==='confirmar'&&!synthetic(op)){
    if(form.elements.monto_recibido.value!==Number(op.monto).toFixed(2))return invalid(form.elements.monto_recibido,'El importe no coincide con el importe esperado. Revisa el movimiento.');
    const canonical=v=>v.normalize('NFKC').trim().toUpperCase().replace(/[ -]/g,'');
    if(canonical(form.elements.referencia_comprobada.value)!==canonical(op.referencia||''))return invalid(form.elements.referencia_comprobada,'La referencia no coincide con la declarada. Revisa el movimiento.');
   }
   const body={accion:action,motivo:reason.value.trim()||(synthetic(op)?'Ensayo sintético revisado sin movimiento de dinero':'Recepción verificada personalmente en los movimientos Yape')};
   if(action==='confirmar')for(const i of form.querySelectorAll('[required]'))body[i.name]=i.type==='checkbox'?i.checked:i.value;
   const selected=op;busy=true;form.setAttribute('aria-busy','true');for(const b of form.querySelectorAll('button'))b.disabled=true;message.textContent='Guardando revisión…';
   let success=false;
   try{const r=await apiFetch('/api/admin/operaciones-pago/'+selected.id+'/revisar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.mensaje||'No se pudo registrar la revisión.');success=true;}
   catch(e){if(!disposed&&active()){
    // Una respuesta perdida no autoriza repetir una decisión: consultar la operación primero.
    try{const r=await apiFetch('/api/admin/operaciones-pago/'+selected.id);const d=await r.json();if(r.ok&&d.estado!=='pendiente_verificacion'){success=true;notify('La operación ya está revisada. Consulta el historial.');}}catch(_){}
    if(!success)message.textContent=(e.message||'Sin conexión.')+' No se repitió la solicitud. Consulta el historial antes de reintentar.';
   }}finally{busy=false;if(!disposed&&active()){form.removeAttribute('aria-busy');for(const b of form.querySelectorAll('button'))b.disabled=false;if(success){close();notify('Revisión registrada. El recibo sintético continúa pendiente.');load();}}}
  });
  return{load,dispose(){disposed=true;generation++;clearTimeout(timer);clearProof();if(dialog.open)dialog.close();host.replaceChildren();}};
 };
})(window);
