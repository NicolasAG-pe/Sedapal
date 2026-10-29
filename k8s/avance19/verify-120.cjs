'use strict';
process.umask(0o077);
// Solo cuentas sintéticas del estado privado y los dos NodePorts de avance19.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const state=path.resolve(__dirname,'../../artifacts/kubernetes-avance-19/state');
const accounts=JSON.parse(fs.readFileSync(path.join(state,'accounts.json')));
const web='http://localhost:8084',adminBase='http://localhost:8085';
const report={date:new Date().toISOString(),checks:[],endpoints:[]};
const kube=(args,input)=>execFileSync('bash',[path.join(__dirname,'kube.sh'),...args],{input,encoding:'utf8',timeout:60000,maxBuffer:8*1024**2});
const ok=s=>{report.checks.push(s);console.log('OK: '+s);};
async function request(base,url,method='GET',token,body,status=200){
 const r=await fetch(base+url,{method,headers:{Origin:base,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 report.endpoints.push({method,url:url.replace(/\/[0-9a-f-]+(?=\/|$)/g,'/:id'),status:r.status});
 assert.equal(r.status,status,method+' '+url);return r.json();
}
async function socket(base,token,accepted=true){
 const WebSocket=require('ws');const events=[];
 return new Promise((resolve,reject)=>{
  const s=new WebSocket(base.replace('http:','ws:')+'/socket.io/?EIO=4&transport=websocket',{headers:{Origin:base}});
  const timer=setTimeout(()=>{s.close();reject(Error('Timeout Socket.IO'));},15000);
  s.on('error',()=>{clearTimeout(timer);reject(Error('Socket.IO falló'));});
  s.on('message',raw=>{const m=raw.toString();
   if(m.startsWith('0'))s.send('40'+JSON.stringify(token?{token}:{}));
   else if(m==='2')s.send('3');
   else if(m.startsWith('42'))events.push(JSON.parse(m.slice(2)));
   else if(m.startsWith('44')){clearTimeout(timer);s.close();accepted?reject(Error('Socket autenticado rechazado')):resolve({s,events});}
   else if(m.startsWith('40')){clearTimeout(timer);if(!accepted){s.close();reject(Error('Socket anónimo aceptado'));}else resolve({s,events});}
  });
 });
}
async function waitEvent(connection,name,id){
 const end=Date.now()+10000;
 while(!connection.events.some(([event,payload])=>event===name&&String(payload.id)===String(id))){assert.ok(Date.now()<end,'Falta evento '+name);await new Promise(r=>setTimeout(r,50));}
}
(async()=>{
 const sockets=[];
 try{
  const source=fs.readFileSync(path.join(__dirname,'seed.cjs'),'utf8');
  kube(['exec','-i','deployment/backend','--','node','-e',source],JSON.stringify(accounts));
  ok('PostgreSQL interno y cuentas sintéticas existentes verificadas');
  for(const base of [web,adminBase]){assert.equal((await fetch(base)).status,200);const h=await request(base,'/api/health');assert.equal(h.estado,'ok');assert.equal(h.auth_contract,'hidro-auth-2fa-v2');}
  const admin=await request(adminBase,'/api/auth/login','POST',null,accounts.admin);
  const user=await request(web,'/api/auth/login','POST',null,accounts.user);
  const other=await request(web,'/api/auth/login','POST',null,accounts.other);
  const session=await request(web,'/api/auth/session','GET',user.token);assert.equal(session.suministro.numero_suministro,accounts.user.numero_suministro);
  await request(web,'/api/auth/session','GET',null,null,401);
  await request(web,'/api/admin/usuarios','GET',user.token,null,403);
  ok('Health SQL, contrato 2FA, login, sesión y separación usuario/Admin');
  for(const endpoint of ['/api/admin/usuarios','/api/admin/recibos','/api/admin/pagos','/api/admin/operaciones-pago?page=1&categoria=simulaciones','/api/admin/cortes','/api/admin/incidencias','/api/admin/atencion','/api/admin/resumen'])await request(adminBase,endpoint,'GET',admin.token);
  for(const endpoint of ['/api/me/recibos','/api/me/pagos','/api/me/incidencias','/api/me/perfil','/api/me/cortes','/api/notificaciones','/api/atencion','/api/pagos/config'])await request(web,endpoint,'GET',user.token);
  const pc=await request(web,'/api/push/capabilities');assert.equal(pc.disponible,false);
  await request(web,'/api/auth/register','POST',null,{},426);
  ok('Ocho consultas Admin y ocho de cliente; capacidades push cerradas y registro legacy bloqueado');
  const us=await socket(web,user.token),as=await socket(adminBase,admin.token);sockets.push(us.s,as.s);await socket(web,null,false);
  const marker='K120-'+Date.now().toString().slice(-10);
  const created=await request(adminBase,'/api/admin/recibos','POST',admin.token,{numero_suministro:accounts.user.numero_suministro,periodo:marker,fecha_emision:'2026-10-01',fecha_vencimiento:'2030-11-01',monto:45,consumo_m3:15},201);
  const receiptId=created.recibo.id_recibo;report.receiptId=receiptId;report.marker=marker;
  await waitEvent(us,'recibo:nuevo',receiptId);
  assert.ok(!(await request(web,'/api/me/recibos','GET',other.token)).recibos.some(r=>String(r.id_recibo)===String(receiptId)));
  const payment={id_recibo:receiptId,metodo:'demostrativo',solicitud_id:crypto.randomUUID()};
  await request(web,'/api/me/operaciones-pago','POST',other.token,payment,404);
  const first=await request(web,'/api/me/operaciones-pago','POST',user.token,payment,201);
  const again=await request(web,'/api/me/operaciones-pago','POST',user.token,payment,200);
  assert.equal(first.operacion.id,again.operacion.id);assert.equal(first.operacion.estado,'demostrativa');assert.equal(first.operacion.entorno,'simulado');
  report.operationId=first.operacion.id;
  await request(web,'/api/me/operaciones-pago/'+first.operacion.id,'GET',other.token,null,404);
  const detail=await request(adminBase,'/api/admin/operaciones-pago/'+first.operacion.id,'GET',admin.token);assert.ok(detail.historial.length>0);
  await request(web,'/api/pagos','POST',user.token,{id_recibo:receiptId,metodo:'demostrativo'},409);
  const receipts=(await request(web,'/api/me/recibos','GET',user.token)).recibos;
  assert.ok(['Emitido','Pendiente'].includes(receipts.find(r=>String(r.id_recibo)===String(receiptId)).estado));
  assert.equal((await request(web,'/api/me/pagos','GET',user.token)).pagos.filter(p=>String(p.id_recibo)===String(receiptId)).length,0);
  ok('Recibo por Socket.IO; operación demostrativa idempotente, historial y aislamiento; no acredita ni cancela deuda');
  const photo='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1cAAAAASUVORK5CYII=';
  const incident=(await request(web,'/api/incidencias','POST',user.token,{tipo:'Prueba Kubernetes',descripcion:'Incidencia sintética '+marker,referencia:'Clúster local avance19',foto_base64:'data:image/png;base64,'+photo,foto_mime:'image/png'},201)).incidencia;
  report.incidentId=incident.id_incidencia;
  await waitEvent(as,'incidencia:nueva',incident.id_incidencia);
  for(const [base,token,url,status] of [[web,user.token,'/api/incidencias/',200],[adminBase,admin.token,'/api/admin/incidencias/',200],[web,other.token,'/api/incidencias/',404]]){
   const r=await fetch(base+url+incident.id_incidencia+'/foto',{headers:{Authorization:'Bearer '+token}});assert.equal(r.status,status);if(status===200)assert.equal(crypto.createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'),crypto.createHash('sha256').update(Buffer.from(photo,'base64')).digest('hex'));
  }
  const change={estado:'En revisión',comentario_publico:'Validación local sintética',solicitud_id:crypto.randomUUID()};
  await request(adminBase,'/api/admin/incidencias/'+incident.id_incidencia+'/estado','PATCH',admin.token,change);
  const repeated=await request(adminBase,'/api/admin/incidencias/'+incident.id_incidencia+'/estado','PATCH',admin.token,change);assert.equal(repeated.repetida,true);
  await request(web,'/api/me/incidencias/'+incident.id_incidencia+'/seguimiento','GET',user.token);
  await request(web,'/api/me/incidencias/'+incident.id_incidencia+'/seguimiento','GET',other.token,null,404);
  await waitEvent(us,'incidencia:actualizada',incident.id_incidencia);
  await request(web,'/api/notificaciones','GET',user.token);
  await request(web,'/api/atencion','POST',user.token,{categoria:'Consulta sintética',asunto:marker,descripcion:'Prueba local de atención sin datos personales.'},201);
  ok('Incidencias, fotografía íntegra/protegida, seguimiento idempotente, aviso interno/Socket.IO y atención');
  const logs=kube(['logs','deployment/backend','--tail=1000']);
  for(const secret of [...Object.values(accounts).map(a=>a.password),admin.token,user.token,other.token])assert.ok(!logs.includes(secret),'Logs sin secretos del ensayo');
  report.status='passed';ok('Logs sin contraseñas ni JWT del ensayo');
 }finally{sockets.forEach(s=>s.close());}
})().catch(e=>{report.status='failed';report.error=e.message;console.error(e.message);process.exitCode=1;}).finally(()=>fs.writeFileSync(path.join(state,'verification-120.json'),JSON.stringify(report,null,2),{mode:0o600}));
