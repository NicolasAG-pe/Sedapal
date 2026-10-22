'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),state=path.join(root,'artifacts/kubernetes-avance-19/state');
const kube=(args,input)=>execFileSync('bash',[path.join(__dirname,'kube.sh'),...args],{encoding:'utf8',input,maxBuffer:8*1024*1024,timeout:60000});
const report={date:new Date().toISOString(),cluster:'hidro-avance19',checks:[],endpoints:[]};
const save=()=>fs.writeFileSync(path.join(state,'verification.json'),JSON.stringify(report,null,2),{mode:0o600});
const ok=label=>{report.checks.push(label);save();console.log('OK: '+label);};
const web='http://localhost:8084',adminBase='http://localhost:8085';
async function request(base,endpoint,method='GET',token,body,status=200){
 const r=await fetch(base+endpoint,{method,headers:{Origin:base,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 report.endpoints.push({method,endpoint: endpoint.replace(/\/\d+(?=\/|$)/g,'/:id'),status:r.status});assert.equal(r.status,status,method+' '+endpoint);return r.json();
}
(async()=>{
 const nodes=JSON.parse(kube(['get','nodes','-o','json']));assert.equal(nodes.items.length,1);assert.equal(nodes.items[0].metadata.name,'hidro-avance19-control-plane');
 fs.mkdirSync(state,{recursive:true,mode:0o700});
 const file=path.join(state,'accounts.json');
 if(!fs.existsSync(file)){
  const accounts=Object.fromEntries(['admin','user','other'].map((role,i)=>[role,{correo:role+'19@fixture.invalid',numero_suministro:String(900001901+i),password:'Fixture19-'+crypto.randomBytes(18).toString('hex')}]))
  fs.writeFileSync(file,JSON.stringify(accounts),{mode:0o600,flag:'wx'});
 }
 const accounts=JSON.parse(fs.readFileSync(file));
 // El programa y sus datos se transmiten separados; nunca contraseñas en argv/log.
 const source=fs.readFileSync(path.join(__dirname,'seed.cjs'),'utf8');
 // node -e contiene solo código público. Los datos privados viajan exclusivamente por stdin.
 console.log(kube(['exec','-i','deployment/backend','--','node','-e',source],JSON.stringify(accounts)).trim());
 ok('DNS db y PostgreSQL desde Pod backend: esquema vigente y cuentas de ambos roles');
 for(const base of [web,adminBase]){
  assert.equal((await fetch(base)).status,200);assert.equal((await request(base,'/api/health')).estado,'ok');
 }
 ok('Frontend/Admin accesibles por NodePort loopback; ambos proxies REST llegan a SQL');
 const admin=await request(adminBase,'/api/auth/login','POST',null,accounts.admin);
 const user=await request(web,'/api/auth/login','POST',null,accounts.user);
 const other=await request(web,'/api/auth/login','POST',null,accounts.other);
 const session=await request(web,'/api/auth/session','GET',user.token);assert.equal(session.suministro.numero_suministro,accounts.user.numero_suministro);
 await request(web,'/api/auth/session','GET',null,null,401);
 ok('Login real y /api/auth/session validan identidad actual; sin token responde 401');
 await request(web,'/api/auth/register','POST',null,{},426);
 const blocked=await fetch(web+'/api/auth/otp/register',{method:'POST',headers:{'Content-Type':'application/json','X-Hidro-Auth-Contract':'otp-outbox-v1'},body:JSON.stringify({solicitud_id:crypto.randomUUID(),correo:'blocked19@fixture.invalid',numero_suministro:'900001909',password:'Synthetic19Only'}),signal:AbortSignal.timeout(10000)});
 assert.equal(blocked.status,503);ok('Registro legacy 426 y OTP 503 con altas cerradas por defecto');
 const preflight=await fetch(web+'/api/auth/otp/register',{method:'OPTIONS',headers:{Origin:web,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-hidro-auth-contract'}});
 assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),web);assert.ok(preflight.headers.get('access-control-allow-headers').toLowerCase().includes('x-hidro-auth-contract'));
 ok('Preflight CORS del contrato OTP atraviesa el proxy con origen y cabecera autorizados');
 const marker='K19-'+Date.now().toString().slice(-10);
 const receipt=await request(adminBase,'/api/admin/recibos','POST',admin.token,{numero_suministro:accounts.user.numero_suministro,periodo:marker,fecha_emision:'2026-10-01',fecha_vencimiento:'2030-11-01',monto:45,consumo_m3:15},201);
 const id=receipt.recibo.id_recibo;
 assert.ok((await request(web,'/api/me/recibos','GET',user.token)).recibos.some(r=>String(r.id_recibo)===String(id)));
 assert.ok(!(await request(web,'/api/me/recibos','GET',other.token)).recibos.some(r=>String(r.id_recibo)===String(id)));
 await request(web,'/api/pagos','POST',other.token,{id_recibo:id,metodo:'fixture Kubernetes'},404);
 await request(web,'/api/pagos','POST',user.token,{id_recibo:id,metodo:'fixture Kubernetes'},201);
 await request(web,'/api/pagos','POST',user.token,{id_recibo:id,metodo:'fixture Kubernetes'},409);
 const payments=await request(web,'/api/me/pagos','GET',user.token);assert.equal(payments.pagos.filter(p=>String(p.id_recibo)===String(id)).length,1);
 ok('Recibo admin→usuario, aislamiento entre cuentas, pago único y duplicado 409');
 await request(web,'/api/incidencias','POST',user.token,{tipo:'Prueba Kubernetes',descripcion:'Incidencia sintética '+marker,referencia:'Clúster avance19'},201);
 assert.ok((await request(web,'/api/me/incidencias','GET',user.token)).incidencias.some(x=>x.descripcion.includes(marker)));
 await request(web,'/api/admin/usuarios','GET',user.token,null,403);
 await request(adminBase,'/api/admin/usuarios','GET',admin.token);
 ok('Incidencia persistida y permisos usuario/admin conservados');
 const checks=fs.readFileSync(path.join(root,'scripts/check-admin-local.cjs'),'utf8');
 console.log(kube(['exec','-i','deployment/backend','--','env','TEST_WEB_ORIGIN='+web,'TEST_ADMIN_ORIGIN='+adminBase,'node'],checks).trim());
 ok('DNS web/admin, 19 rutas administrativas protegidas, CORS y Socket.IO autenticado por ambos proxies');
 const logs=kube(['logs','deployment/backend','--tail=1000']);
 for(const secret of [...Object.values(accounts).map(a=>a.password),admin.token,user.token,other.token])assert.ok(!logs.includes(secret),'Logs sin credenciales del flujo');
 ok('Logs backend sin contraseñas ni JWT usados por el harness');
 report.receiptId=id;report.marker=marker;report.status='passed';save();
})().catch(e=>{report.status='failed';report.error=e.message;save();console.error(e.message);process.exitCode=1;});
