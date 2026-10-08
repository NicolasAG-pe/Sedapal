/* Presentación de Inicio. Reutiliza datos cargados; no hace peticiones ni autoriza. */
(function(global){
  'use strict';
  const ui=global.HMShared.ui;
  function row(icon,title,detail,value,section){
    const button=ui.node('button','activity-row');button.type='button';button.dataset.openSection=section;
    button.append(global.HMShared.icons.icon(icon));
    const copy=ui.node('span','activity-copy');copy.append(ui.node('strong','',title),ui.node('small','',detail));
    button.append(copy,ui.node('span','activity-value',value),global.HMShared.icons.icon('arrow'));return button;
  }
  function fill(id,rows,empty){
    const list=document.getElementById(id);list.replaceChildren(...rows);
    if(!rows.length)list.append(ui.node('p','activity-empty',empty));
  }
  function render(data){
    const open=data.incidents.filter(i=>!/resuelta|cerrada|cancelada/i.test(i.estado));
    const upcoming=data.cuts.filter(c=>!/cancelado|finalizado/i.test(c.estado)&&c.fechaFinISO&&new Date(c.fechaFinISO)>=new Date()).sort((a,b)=>String(a.fechaInicioISO).localeCompare(String(b.fechaInicioISO)));
    const unread=data.notifications.filter(n=>!n.leida);
    const alert=document.getElementById('home-alert');alert.hidden=!unread.length&&!upcoming.length;
    document.getElementById('home-alert-text').textContent=upcoming.length?'Hay '+upcoming.length+' corte(s) próximo(s) o en curso para tu suministro.':'Tienes '+unread.length+' notificación(es) sin leer.';
    alert.dataset.openSection=upcoming.length?'cortes':'notificaciones';
    fill('home-payment-list',data.payments.slice(0,2).map(p=>row('payment',p.periodo,p.metodo+' · '+p.fecha,ui.money(p.monto),'pagos')),data.paymentError?'No fue posible consultar los pagos.':'Todavía no hay pagos registrados.');
    fill('home-service-list',[
      ...upcoming.slice(0,1).map(c=>row('cut',c.motivo,c.fecha,c.estado,'cortes')),
      ...open.slice(0,2).map(i=>row('incident',i.tipo,i.code+' · '+i.fecha,i.estado,'incidencias'))
    ],data.cutError?'No fue posible consultar los cortes.':'Sin cortes próximos ni incidencias abiertas en los datos consultados.');
    fill('home-notification-list',unread.slice(0,2).map(n=>row('bell',n.titulo,n.mensaje,'Sin leer','notificaciones')),'No tienes notificaciones pendientes de lectura.');
    document.getElementById('home-open-incidents').textContent=open.length;
    document.getElementById('home-unread-count').textContent=unread.length;
    document.getElementById('home-balance-state').textContent=data.receiptError?'Consulta no disponible':data.debt>0?'Recibos por pagar':'Sin deuda pendiente';
    const action=document.getElementById('home-pay-action');action.disabled=data.receiptError||data.debt<=0;
    action.querySelector('span').textContent=data.debt>0?'Pagar recibos':'Sin pagos pendientes';
  }
  function clear(){
    ['home-payment-list','home-service-list','home-notification-list'].forEach(id=>document.getElementById(id)?.replaceChildren());
    ['home-alert-text','home-balance-state'].forEach(id=>{document.getElementById(id).textContent='';});
    ['home-open-incidents','home-unread-count'].forEach(id=>{document.getElementById(id).textContent='—';});
    document.getElementById('home-alert').hidden=true;
    const action=document.getElementById('home-pay-action');action.disabled=true;action.querySelector('span').textContent='Pagar recibos';
  }
  global.HMClientHome={render,clear};
})(window);
