'use strict';
// Solo proxies loopback del laboratorio avance23, cuentas generadas, API en Docker Node 22.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const jwt=require('../../Backend/node_modules/jsonwebtoken');
const state=path.resolve(__dirname,'../../artifacts/avance-23');
const {accounts,api}=JSON.parse(fs.readFileSync(path.join(state,'fixture-private.json')));
assert.equal(api.POSTGRES_DB,'hm23_history');
const web='http://localhost:18024',adminBase='http://localhost:18025';
const apiContainer=process.env.HIDRO_BACKEND23_API_CONTAINER || 'hm23-api';
assert.match(apiContainer,/^hm23-api(?:-candidate)?$/);
// Verificar destino antes de cualquier HTTP/escritura; no basta un puerto abierto.
for(const name of [apiContainer,'hm23-web','hm23-admin','hm23-db']){
 const [container]=JSON.parse(execFileSync('docker',['inspect',name],{encoding:'utf8'}));
 assert.equal(container.Config.Labels['hidro.avance'],'23','Solo recursos del laboratorio 23');
 assert.equal(container.State.Running,true,'Contenedor de prueba en ejecución');
 assert.ok(container.NetworkSettings.Networks['hm23-isolated'],'Red aislada requerida');
 if(name===apiContainer){
  const environment=Object.fromEntries(container.Config.Env.map(value=>{const at=value.indexOf('=');return[value.slice(0,at),value.slice(at+1)];}));
  assert.equal(environment.POSTGRES_DB,'hm23_history');assert.equal(environment.DB_HOST,'db');
  assert.ok(!environment.DATABASE_URL,'No aceptar una URL externa que prevalezca sobre DB_HOST');
 }
}
const report={checks:[],endpoints:[],backendRuntime:'Docker Node 22',runnerRuntime:process.version};
const save=()=>fs.writeFileSync(path.join(state,'docker-verification.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
const ok=label=>{report.checks.push(label);save();console.log('OK: '+label);};
async function request(base,endpoint,method='GET',token,body,status=200,extra={}){
 const r=await fetch(base+endpoint,{method,headers:{Origin:base,...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...extra},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
 report.endpoints.push({method,endpoint:endpoint.replace(/\/\d+(?=\/|$)/g,'/:id'),status:r.status});assert.equal(r.status,status,method+' '+endpoint);return{r,data:await r.json()};
}
(async()=>{
 for(const base of [web,adminBase]){assert.equal((await fetch(base)).status,200);assert.equal((await request(base,'/api/health')).data.estado,'ok');}
 ok('Web/Admin por loopback y /api/health desde API Docker con PostgreSQL migrado');
 const caps=await request(web,'/api/auth/capabilities');assert.deepEqual(caps.data.contratos_registro,['otp-outbox-v1']);assert.equal(caps.r.headers.get('cache-control'),'no-store');
 await request(web,'/api/auth/session','GET',null,null,401);
 const logins={};for(const role of ['user','admin','other']){const account=accounts[role];logins[role]=(await request(role==='admin'?adminBase:web,'/api/auth/login','POST',null,{numero_suministro:account.numero_suministro,password:account.password})).data;}
 const user=logins.user,admin=logins.admin,other=logins.other;
 assert.equal(user.usuario.rol,'usuario');assert.equal(admin.usuario.rol,'admin');
 const claims=jwt.decode(user.token);assert.equal(claims.exp-claims.iat,8*3600);
 const restored=await request(web,'/api/auth/session','GET',user.token);assert.equal(restored.data.suministro.numero_suministro,accounts.user.numero_suministro);assert.equal(restored.data.token,undefined);assert.equal(restored.r.headers.get('cache-control'),'no-store');
 await request(web,'/api/auth/session','GET',user.token+'.invalid',null,401);
 const expired=jwt.sign({id_usuario:claims.id_usuario},api.AUTH_TOKEN_SECRET,{expiresIn:-60});await request(web,'/api/auth/session','GET',expired,null,401);
 await request(adminBase,'/api/auth/session','GET',admin.token,null,403);await request(adminBase,'/api/me/perfil','GET',admin.token);
 await request(web,'/api/admin/usuarios','GET',user.token,null,403);
 ok('Login legacy de usuario/Admin; sesión 1.1 validada sin renovar JWT, ocho horas, inválido/expirado/roles rechazados');
 const profile=(await request(web,'/api/me/perfil','GET',user.token)).data;assert.equal(profile.correo,accounts.user.correo);
 await request(web,'/api/auth/register','POST',null,{correo:'legacy23@fixture.invalid',numero_suministro:'900002399',password:crypto.randomBytes(20).toString('hex')},426);
 await request(web,'/api/auth/otp/register','POST',null,{solicitud_id:crypto.randomUUID(),correo:'blocked23@fixture.invalid',numero_suministro:'900002398',password:crypto.randomBytes(20).toString('hex')},503,{'X-Hidro-Auth-Contract':'otp-outbox-v1'});
 const preflight=await fetch(web+'/api/auth/otp/register',{method:'OPTIONS',headers:{Origin:'https://localhost','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-hidro-auth-contract'}});
 assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'https://localhost');assert.match(preflight.headers.get('access-control-allow-headers'),/X-Hidro-Auth-Contract/i);
 const denied=await fetch(web+'/api/health',{headers:{Origin:'https://untrusted.invalid'}});assert.equal(denied.headers.get('access-control-allow-origin'),null);
 ok('Android 1.0 conserva login/cuentas; registro legacy 426 y altas principales 503 sin worker; CORS del origen Capacitor/contrato correcto');
 const marker='H23-'+Date.now().toString().slice(-10);
 const receipt=(await request(adminBase,'/api/admin/recibos','POST',admin.token,{numero_suministro:accounts.user.numero_suministro,periodo:marker,fecha_emision:'2026-10-01',fecha_vencimiento:'2030-11-01',monto:47,consumo_m3:13},201)).data.recibo;
 assert.ok((await request(web,'/api/me/recibos','GET',user.token)).data.recibos.some(x=>String(x.id_recibo)===String(receipt.id_recibo)));
 assert.ok(!(await request(web,'/api/me/recibos','GET',other.token)).data.recibos.some(x=>String(x.id_recibo)===String(receipt.id_recibo)));
 await request(web,'/api/pagos','POST',other.token,{id_recibo:receipt.id_recibo,metodo:'Fixture aislado'},404);
 await request(web,'/api/pagos','POST',user.token,{id_recibo:receipt.id_recibo,metodo:'Fixture aislado'},201);
 await request(web,'/api/pagos','POST',user.token,{id_recibo:receipt.id_recibo,metodo:'Fixture aislado'},409);
 assert.equal((await request(web,'/api/me/pagos','GET',user.token)).data.pagos.filter(x=>String(x.id_recibo)===String(receipt.id_recibo)).length,1);
 ok('Recibos entre Admin/cliente, aislamiento de suministro, pago único y duplicado 409 en filas nuevas');
 await request(web,'/api/incidencias','POST',user.token,{tipo:'Fixture backend23',descripcion:'Incidencia sintética nueva '+marker,referencia:'Laboratorio aislado'},201);
 assert.ok((await request(web,'/api/me/incidencias','GET',user.token)).data.incidencias.some(x=>x.descripcion.includes(marker)));
 ok('Incidencia nueva persistida sin modificar la incidencia histórica');
 const logs=execFileSync('docker',['logs',apiContainer],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 for(const value of [api.AUTH_TOKEN_SECRET,api.EMAIL_OTP_SECRET,api.EMAIL_OUTBOX_KEY,api.POSTGRES_PASSWORD,...Object.values(accounts).map(x=>x.password),...Object.values(logins).map(x=>x.token)])assert.ok(!logs.includes(value),'Logs sin valores privados del fixture');
 report.marker=marker;report.status='passed';ok('Logs de API sin contraseñas, secretos ni JWT empleados por el harness');
})().catch(e=>{report.status='failed';report.error=e.message;save();console.error('Falló comprobación Docker: '+e.message);process.exitCode=1;});
