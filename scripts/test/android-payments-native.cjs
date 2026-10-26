'use strict';
// WebView real + API/PG nuevos. No proveedor externo, no dinero ni cuenta personal.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async function({ctx,getPage,restart,until,ok,screenshot,login,logout,android,output}){
 const pilot=process.argv.includes('--yape-pilot'),amount=pilot?'1.00':'45.50';
 const p=()=>getPage(),supply='900000741',pkg='pe.edu.hidromejora.app';
 const a=ctx.registro(741),pending=(await ctx.request('register',a,202)).data;await ctx.drain();const verified=(await ctx.request('verify-email',ctx.verificar(pending.registro_id,ctx.codigo(a.correo)),201)).data;
 const id=(await ctx.db.query("INSERT INTO recibos(id_suministro,periodo,fecha_emision,fecha_vencimiento,monto,consumo_m3,estado) VALUES($1,'Prueba Android pagos',CURRENT_DATE,CURRENT_DATE+30,$2,15,'Pendiente') RETURNING id_recibo",[verified.suministro.id_suministro,amount])).rows[0].id_recibo;
 let adminToken;
 if(pilot){
  const a=ctx.registro(742),q=(await ctx.request('register',a,202)).data;await ctx.drain();const u=(await ctx.request('verify-email',ctx.verificar(q.registro_id,ctx.codigo(a.correo)),201)).data;
  await ctx.db.query("UPDATE usuarios SET rol='admin' WHERE id_usuario=$1",[u.usuario.id_usuario]);adminToken=(await ctx.request('login',{numero_suministro:a.numero_suministro,password:a.password},200)).data.token;
  const manifest={version:1,id:require('node:crypto').randomUUID(),user_id:verified.usuario.id_usuario,admin_id:u.usuario.id_usuario,receipt_id:id,synthetic:true,max_amount:amount,starts_at:new Date(Date.now()-60000).toISOString(),expires_at:new Date(Date.now()+3600000).toISOString(),qr_hash:require('../../Backend/yape-pilot').fingerprint(require('../../Backend/payment-operations').pngSeguro(fs.readFileSync(process.env.YAPE_QR_FILE)))};
  process.env.YAPE_PILOT_CONFIG_FILE=path.join(output,'pilot.json');fs.writeFileSync(process.env.YAPE_PILOT_CONFIG_FILE,JSON.stringify(manifest),{mode:0o600});process.env.YAPE_PILOT_ENABLED='1';
  await ctx.db.query('INSERT INTO control_piloto_yape(piloto_id,habilitado,ensayo_sintetico,id_recibo,id_usuario,id_admin,qr_hash,monto_maximo,inicio_en,vence_en) VALUES($1,true,true,$2,$3,$4,$5,$6,$7,$8)',[manifest.id,id,manifest.user_id,manifest.admin_id,manifest.qr_hash,amount,manifest.starts_at,manifest.expires_at]);
 }
 await login(supply);await p().evaluate(()=>document.querySelector('#sidebar [data-sec="historial"]').click());await p().locator('#cards [data-act="pay"]').first().click();
 await until(()=>p().evaluate(()=>!document.querySelector('input[value="yape_manual"]').disabled),'configuración de laboratorio y QR protegido');
 await p().locator('input[value="yape_manual"]').check();await p().locator('#pay-reference').fill('NATIVE-SIM-741');
 // Petición llega a PG; descartar exclusivamente la primera respuesta en la WebView.
 await p().evaluate(()=>{const original=fetch;window.fetch=async function(input,options){const r=await original(input,options);if(String(input).endsWith('/api/me/operaciones-pago')&&options?.method==='POST'){window.fetch=original;await r.arrayBuffer();throw new TypeError('Respuesta descartada por fixture');}return r;};});
 await p().locator('#pay-confirm').click();await until(()=>p().evaluate(()=>document.getElementById('pay-feedback').textContent.includes('historial')),'respuesta perdida visible');
 if(pilot){await p().locator('#pay-existing-history').waitFor({state:'visible'});assert.equal(await p().locator('#pay-confirm').isDisabled(),true);}else{await p().locator('#pay-confirm').click();await until(()=>p().evaluate(()=>!document.getElementById('pay-success').hidden),'declaración recuperada');}
 const op=(await ctx.db.query("SELECT * FROM operaciones_pago WHERE id_recibo=$1",[id])).rows;assert.equal(op.length,1);assert.equal(op[0].estado,'pendiente_verificacion');
 assert.equal((await ctx.db.query('SELECT estado FROM recibos WHERE id_recibo=$1',[id])).rows[0].estado,'Pendiente');assert.equal((await ctx.db.query('SELECT 1 FROM pagos WHERE id_recibo=$1',[id])).rowCount,0);
 ok('Yape de laboratorio en WebView: QR privado, importe exacto, respuesta perdida recuperada con una UUID y deuda sin cancelar');screenshot('payment-pending');
 await p().locator(pilot?'#pay-existing-history':'#pay-done').click();await restart();await until(()=>p().evaluate(()=>document.getElementById('view-dashboard').classList.contains('active')),'sesión segura tras force-stop');
 await p().evaluate(()=>document.querySelector('#sidebar [data-sec="pagos"]').click());await until(()=>p().evaluate(()=>document.getElementById('pay-list').textContent.includes('Pendiente de')),'operación recuperada desde servidor');
 ok('Force-stop: sesión cifrada restaurada, historial pendiente recuperado y sin otra declaración');
 if(pilot){
  const response=await fetch(ctx.base+'/api/admin/operaciones-pago/'+op[0].id+'/revisar',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+adminToken},body:JSON.stringify({accion:'confirmar',motivo:'Ensayo sintético en Android sin dinero',ensayo_confirmado:true})});assert.equal(response.status,200);
  await until(()=>p().evaluate(()=>document.getElementById('pay-list').textContent.includes('Ensayo confirmado')),'Socket.IO entrega revisión al cliente sin recarga');ok('Piloto sintético: comprobación Admin llega por Socket.IO real sin recarga del cliente');
 }
 if(pilot){
  await p().evaluate(()=>document.querySelector('#sidebar [data-sec="historial"]').click());
  android('shell','svc','wifi','disable');android('shell','svc','data','disable');
  await until(()=>p().evaluate(()=>document.getElementById('client-connection').dataset.state!=='online'),'aviso de sincronización sin red (heartbeat Socket.IO)',60000);assert.equal(await p().locator('#client-connection').isVisible(),true);screenshot('payment-offline');
  const demo=await fetch(ctx.base+'/api/me/operaciones-pago',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+verified.token},body:JSON.stringify({id_recibo:id,metodo:'demostrativo',solicitud_id:require('node:crypto').randomUUID()})});assert.equal(demo.status,201);
  android('shell','svc','wifi','enable');
  await until(()=>p().evaluate(()=>document.getElementById('client-connection').dataset.state==='online'),'reconexión Socket.IO y consultas');
  await until(()=>p().evaluate(()=>document.getElementById('pay-list').children.length===2),'historial actualizado aunque Recibos esté visible');
  await p().evaluate(()=>document.querySelector('#sidebar [data-sec="pagos"]').click());
  await p().locator('#pay-list').getByText('Operación de prueba registrada',{exact:true}).waitFor();
  assert.equal((await ctx.db.query("SELECT 1 FROM operaciones_pago WHERE id_recibo=$1 AND metodo='yape_manual'",[id])).rowCount,1);
  ok('Red Android interrumpida: aviso visible, historial recuperado desde Recibos y ninguna declaración Yape duplicada');screenshot('payment-reconnected');
 }
 async function nativeSave(button,name){
  const before=android('shell','find','/sdcard/Download','-name','*.pdf').trim().split('\n');await button.click();
  let target;await until(()=>{try{android('shell','uiautomator','dump','/sdcard/hm-payments-window.xml');const xml=android('shell','cat','/sdcard/hm-payments-window.xml');const nodes=[...xml.matchAll(/<node\b[^>]*>/g)].map(x=>Object.fromEntries([...x[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]])));target=nodes.find(n=>/action_menu_save|save_button/.test(n['resource-id']||'')||/^(Save|Guardar)$/i.test(n.text||''));return!!target;}catch(_){return false;}},'selector SAF guardar PDF');
  const b=target.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/).slice(1).map(Number);android('shell','input','tap',String((b[0]+b[2])>>1),String((b[1]+b[3])>>1));
  let file;await until(()=>{file=android('shell','find','/sdcard/Download','-name','*.pdf').trim().split('\n').find(f=>f.endsWith('.pdf')&&!before.includes(f));return!!file&&Number(android('shell','stat','-c','%s',file))>1000;},'PDF guardado');
  android('pull',file,path.join(output,name+'.pdf'));const bytes=fs.readFileSync(path.join(output,name+'.pdf'));assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.ok(bytes.toString('latin1').includes('%%EOF'));
  await until(()=>/(?:topResumedActivity|mResumedActivity)=.*(?:PdfViewerActivity|Pdf)/.test(android('shell','dumpsys','activity','activities')),'visor PDF Android');
  const content=execFileSync('pdftotext',[path.join(output,name+'.pdf'),'-'],{encoding:'utf8'}).replace(/\s+/g,' ');
  for(const value of ['HIDRO-MEJORA',amount,name==='native-constancia'?(pilot?'Ensayo confirmado':'Pendiente de revisión'):'RECIBO DE SERVICIO'])assert.ok(content.includes(value),'Contenido PDF '+value);
  await require('./android-pdf-viewer.cjs')({android,until,fileName:path.basename(file),capture:()=>{screenshot(name+'-viewer');return fs.readFileSync(path.join(output,name+'-viewer.png'));}});
  android('shell','input','keyevent','4');await until(()=>new RegExp('(?:topResumedActivity|mResumedActivity)=.*'+pkg.replaceAll('.','\\.')).test(android('shell','dumpsys','activity','activities')),'botón Atrás vuelve del visor PDF a Hidro-Mejora');
 }
 await nativeSave(p().locator(pilot?'#pay-list [data-estado="verificada_manual"] button[data-act="const"]':'#pay-list button[data-act="const"]').first(),'native-constancia');
 ok((pilot?'Constancia revisada de ensayo:':'Constancia pendiente:')+' PDF real guardado por SAF y abierto en visor Android, sin permisos generales de almacenamiento');
 await p().evaluate(()=>document.querySelector('#sidebar [data-sec="historial"]').click());await p().locator('#cards [data-act="detail"]').first().click();await nativeSave(p().locator('#btn-pdf'),'native-recibo');
 ok('Recibo profesional: PDF A4 guardado y visualizado en Android con importe y estado originales');
 // UI de demostración conserva la deuda, no un cargo financiero.
 await p().locator('#detail-close').click();await p().locator('#cards [data-act="pay"]').first().click();if(pilot){await until(()=>p().evaluate(()=>document.getElementById('pay-notice').textContent.includes('no hagas otra transferencia')),'piloto no vuelve a mostrar QR para una declaración existente');assert.equal(await p().locator('input[value="yape_manual"]').isDisabled(),true);assert.equal(await p().locator('#pay-yape-qr').getAttribute('src'),null);ok('Piloto revisado: QR oculto y Yape deshabilitado para evitar una segunda transferencia');assert.equal(await p().locator('#pay-confirm').isDisabled(),true);}else{await p().locator('#pay-confirm').click();await until(()=>p().evaluate(()=>!document.getElementById('pay-success').hidden),'demostración nativa');}
 assert.equal((await ctx.db.query('SELECT 1 FROM pagos WHERE id_recibo=$1',[id])).rowCount,0);ok(pilot?'Piloto revisado no permite otro envío ni modifica la deuda':'Demostración en Android no crea pago financiero ni modifica el recibo');
 await p().locator(pilot?'#pay-cancel':'#pay-done').click();await logout();await restart();await until(()=>p().evaluate(()=>!document.getElementById('login-form').hidden),'logout conservado');
 assert.equal(await p().locator('#pay-existing-state').textContent(),'');assert.equal(await p().locator('#pay-existing-history').isHidden(),true);assert.equal(await p().locator('#pay-reference').inputValue(),'');assert.equal(await p().locator('#pay-yape-qr').getAttribute('src'),null);ok('Logout/reapertura limpia sesión, referencia y QR; no restaura datos privados');
};
