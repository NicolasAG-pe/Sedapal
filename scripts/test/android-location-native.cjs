'use strict';
// Posición entregada por Android (geo fix del AVD), no override de geolocation JS.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async function({ctx,getPage,android,restart,until,ok,screenshot,login,output}){
 const p=()=>getPage(),pkg='pe.edu.hidromejora.app',supply='900000731';
 async function nav(section){await p().evaluate(s=>document.querySelector('#sidebar [data-sec="'+s+'"]').click(),section);}
 async function api(route,body,token,expected=201){const r=await fetch(ctx.base+route,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});assert.equal(r.status,expected,'API sintética '+route);return r.json();}
 async function nativeTap(match){
  let target;
  await until(()=>{try{
   const dumped=android('shell','uiautomator','dump','/sdcard/hm17-window.xml');if(!dumped.includes('dumped'))return false;
   const xml=android('shell','cat','/sdcard/hm17-window.xml');
   const nodes=[...xml.matchAll(/<node\b[^>]*>/g)].map(x=>Object.fromEntries([...x[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]])));
   target=nodes.find(match);return !!target;
  }catch(_){return false;}},'control Android disponible');
  const b=target.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/).slice(1).map(Number);android('shell','input','tap',String((b[0]+b[2])>>1),String((b[1]+b[3])>>1));
 }
 async function locate(){
  await p().locator('#inc-geo').click();
  for(let i=0;i<16;i++){await pause(300);android('emu','geo','fix','-77.0428','-12.0464','0','8');}
  await until(()=>p().evaluate(()=>document.getElementById('inc-coords').textContent==='-12.04640, -77.04280'),'posición GPS en formulario');
 }
 async function fill(description){await p().locator('#inc-tipo').selectOption({label:'Fuga de agua'});await p().locator('#inc-desc').fill(description);await p().locator('#inc-dir').fill('Referencia sintética de AVD');}
 async function submit(description,hasPosition){
  await p().locator('#inc-submit').click();await until(()=>p().evaluate(()=>!document.getElementById('inc-ok').hidden),'incidencia confirmada');
  const {rows}=await ctx.db.query('SELECT latitud,longitud FROM incidencias WHERE descripcion=$1',[description]);assert.equal(rows.length,1);
  if(hasPosition){assert.equal(Number(rows[0].latitud),-12.0464);assert.equal(Number(rows[0].longitud),-77.0428);}
  else{assert.ok(rows[0].latitud===null&&rows[0].longitud===null,'Sin coordenadas antiguas o inventadas');}
 }
 for(const n of [731,732]){const account=ctx.registro(n),pending=(await ctx.request('register',account,202)).data;await ctx.drain();await ctx.request('verify-email',ctx.verificar(pending.registro_id,ctx.codigo(account.correo)),201);}
 await ctx.db.query("UPDATE usuarios SET rol='admin' WHERE correo='cliente732@example.invalid'");
 const admin=(await ctx.request('login',{numero_suministro:'900000732',password:ctx.registro(732).password},200)).data;
 android('shell','pm','grant',pkg,'android.permission.ACCESS_COARSE_LOCATION');android('shell','pm','grant',pkg,'android.permission.ACCESS_FINE_LOCATION');android('shell','cmd','location','set-location-enabled','true');
 await login(supply);await nav('incidencias');await p().locator('#btn-nueva-incidencia').click();await fill('GPS Android confirmado con proveedor del AVD');
 const photo=path.join(output,'fixture.png');fs.writeFileSync(photo,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAACv0lEQVR4nO3TMQ0AMAzAsH5DOVBjPBg9YskA8mTOfZA16wWwyACkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSPvqBw5cOo42mgAAAABJRU5ErkJggg==','base64'));
 android('push',photo,'/sdcard/Download/hidro-17-fixture.png');android('shell','am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file:///sdcard/Download/hidro-17-fixture.png');
 const cdp=await p().context().newCDPSession(p());await cdp.send('Page.setInterceptFileChooserDialog',{enabled:false});await p().locator('#inc-foto').click();
 await nativeTap(n=>(n['content-desc']||'').startsWith('Photo taken on'));
 await until(()=>p().evaluate(()=>!document.getElementById('inc-foto-prev').hidden),'fotografía real seleccionada');await locate();screenshot('gps-success');await submit('GPS Android confirmado con proveedor del AVD',true);
 assert.equal((await ctx.db.query("SELECT foto_mime FROM incidencias WHERE descripcion='GPS Android confirmado con proveedor del AVD'")).rows[0].foto_mime,'image/png');
 ok('Photo Picker Android real: PNG sintético válido seleccionado y persistido con la incidencia');
 ok('GPS nativo: permiso concedido, alta precisión y geo fix del proveedor llegan al formulario y PostgreSQL');
 await p().locator('#inc-again').click();await fill('Proveedor desactivado después de posición válida');await locate();android('shell','cmd','location','set-location-enabled','false');await p().locator('#inc-geo').click();
 await until(()=>p().evaluate(()=>!document.getElementById('inc-geo').disabled&&document.getElementById('inc-coords').textContent==='Sin ubicación compartida.'),'proveedor desactivado sin posición');await submit('Proveedor desactivado después de posición válida',false);
 ok('Proveedor apagado tras éxito: error seguro y registro sin reutilizar coordenadas anteriores');
 android('shell','cmd','location','set-location-enabled','true');
 for(const permission of ['android.permission.ACCESS_FINE_LOCATION','android.permission.ACCESS_COARSE_LOCATION']){
  android('shell','pm','revoke',pkg,permission);
  android('shell','pm','clear-permission-flags',pkg,permission,'user-set','user-fixed');
 }
 await restart();
 await until(()=>p().evaluate(()=>document.getElementById('view-dashboard').classList.contains('active')),'sesión después de cambio de permisos');await nav('incidencias');await p().locator('#btn-nueva-incidencia').click();await fill('Permiso de ubicación denegado por usuario sintético');await p().locator('#inc-geo').click();
 await nativeTap(n=>/\/permission_deny(?:_and_dont_ask_again)?_button$/.test(n['resource-id']||''));
 await until(()=>p().evaluate(()=>document.getElementById('toast').textContent.includes('Permiso de ubicación denegado')),'denegación visible');screenshot('location-denied');await submit('Permiso de ubicación denegado por usuario sintético',false);await p().locator('#inc-close').click();
 ok('Permiso denegado mediante diálogo Android real: formulario sigue operativo y SQL no contiene coordenadas');
 await p().locator('#btn-nueva-incidencia').click();android('shell','input','keyevent','4');await until(()=>p().evaluate(()=>!document.getElementById('incident-modal').classList.contains('open')),'Atrás cierra formulario');
 android('shell','settings','put','system','accelerometer_rotation','0');android('shell','settings','put','system','user_rotation','1');await pause(700);screenshot('location-landscape');android('shell','settings','put','system','user_rotation','0');
 await nav('perfil');await until(()=>p().evaluate(()=>document.getElementById('pf-correo').textContent==='cliente731@example.invalid'),'Perfil de identidad restaurada');await until(()=>ctx.io.engine.clientsCount===1,'un socket tras permisos/navegación/rotación');ok('Sesión restaurada tras cambio de permisos, Perfil, Atrás, rotación y Socket.IO único');
 const receipt=await api('/api/admin/recibos',{numero_suministro:supply,periodo:'Nativo avance17',fecha_emision:'2026-10-01',fecha_vencimiento:'2030-11-01',monto:45,consumo_m3:15},admin.token);
 await nav('historial');await until(()=>p().evaluate(()=>document.getElementById('cards').textContent.includes('Nativo avance17')),'recibo recibido en WebView');
 await p().locator('[data-filter="Pagado"]').click();
 await until(()=>p().evaluate(()=>!document.getElementById('cards').textContent.includes('Nativo avance17')),'filtro pagado en Android');
 await p().locator('[data-filter="Emitido"]').click();
 await until(()=>p().evaluate(()=>document.getElementById('cards').textContent.includes('Nativo avance17')),'filtro emitido en Android');
 assert.equal(await p().evaluate(()=>document.querySelectorAll('[data-filter].active').length),1);
 await p().locator('[data-filter="Todos"]').click();
 ok('Filtros en WebView Android: Pagado excluye Emitido, Emitido lo recupera y Todos restablece la lista');
 await p().evaluate(()=>[...document.querySelectorAll('#cards .card')].find(e=>e.textContent.includes('Nativo avance17')).querySelector('[data-act=detail]').click());
 const before=android('shell','find','/sdcard/Download','-name','*.pdf').trim().split('\n');await p().locator('#btn-pdf').click();await nativeTap(n=>/action_menu_save|save_button/.test(n['resource-id']||'')||/^(Save|Guardar)$/i.test(n.text||''));
 let pdf;await until(()=>{pdf=android('shell','find','/sdcard/Download','-name','*.pdf').trim().split('\n').find(f=>f.endsWith('.pdf')&&!before.includes(f));return !!pdf&&Number(android('shell','stat','-c','%s',pdf).trim())>1000;},'PDF escrito mediante SAF');
 await until(()=>/(?:topResumedActivity|mResumedActivity)=.*com\.google\.android\.apps\.docs\/com\.google\.android\.apps\.viewer\.PdfViewerActivity/.test(android('shell','dumpsys','activity','activities')),'visor PDF Android abierto');
 android('pull',pdf,path.join(output,'native-receipt.pdf'));assert.equal(fs.readFileSync(path.join(output,'native-receipt.pdf')).subarray(0,5).toString(),'%PDF-');assert.ok(fs.readFileSync(path.join(output,'native-receipt.pdf')).toString('latin1').includes('%%EOF'),'PDF completo');screenshot('native-pdf-saved');
 android('shell','am','start','-n',pkg+'/.MainActivity');await pause(700);await p().locator('#btn-pay-detail').click();await p().locator('#pay-confirm').click();await until(()=>p().evaluate(()=>!document.getElementById('pay-success').hidden),'pago nativo');assert.equal((await ctx.db.query('SELECT count(*)::int n FROM pagos WHERE id_recibo=$1',[receipt.recibo.id_recibo])).rows[0].n,1);ok('Recibo y pago desde WebView real; PDF guardado por el plugin/SAF Android, sin permisos generales de almacenamiento');
 await p().locator('#pay-done').click();await p().locator('#detail-close').click();
 await ctx.db.query("UPDATE suministros SET distrito='Distrito fixture',zona='Zona fixture' WHERE numero_suministro=$1",[supply]);
 await api('/api/admin/cortes',{alcance:'Zona',distrito:'Distrito fixture',zona:'Zona fixture',motivo:'Corte nativo avance17',fecha_inicio:'2030-01-01T09:00:00',fecha_fin:'2030-01-01T12:00:00'},admin.token);
 await nav('cortes');await until(()=>p().evaluate(()=>document.getElementById('cortes-list').textContent.includes('Corte nativo avance17')),'corte publicado por fixture');
 await nav('notificaciones');await until(()=>p().evaluate(()=>document.getElementById('notif-list').children.length>0),'notificaciones nativas');
 await p().evaluate(()=>[...document.querySelectorAll('#notif-list button')].find(n=>/leída/i.test(n.textContent)).click());await until(async()=>(await ctx.db.query('SELECT count(*)::int n FROM notificaciones_lecturas')).rows[0].n>0,'lectura persistida');
 await until(()=>ctx.io.engine.clientsCount===1,'Socket.IO único al terminar');ok('Cortes, notificaciones/leída y navegación nativa conservan SQL y un único socket');
};
