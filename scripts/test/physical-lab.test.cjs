'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {environment}=require('../android-physical-lab-server.cjs'),{privateSigning}=require('../build-android-physical-lab.cjs'),{buildWeb}=require('../build-web');
test('LAB impone loopback, proveedores simulados y no hereda secretos remotos',()=>{
 const env=environment({database:'hm_physical_synthetic',user:'hm_lab_app',password:'synthetic-only'});
 assert.equal(env.CORS_ALLOWED_ORIGINS,'http://localhost,http://127.0.0.1:45681');assert.equal(env.DB_HOST,'127.0.0.1');assert.equal(env.DB_PORT,'45680');assert.equal(env.PORT,'45679');assert.equal(env.DATABASE_URL,'');assert.equal(env.PUSH_REAL_DELIVERY_ALLOWED,'0');assert.equal(env.PUSH_WORKER_ENABLED,'0');assert.equal(env.PUSH_REMINDERS_ENABLED,'0');assert.equal(env.PUSH_PROVIDER,'mock');assert.equal(env.PAYMENTS_MANUAL_ENABLED,'0');
 for(const key of ['GOOGLE_APPLICATION_CREDENTIALS','GOOGLE_OAUTH_ACCESS_TOKEN','RESEND_API_KEY','GMAIL_CREDENTIALS_FILE'])assert.equal(env[key],undefined);
});
test('Runtime LAB identifica entorno y rechaza API externa; oficial conserva identidad',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hm-physical-runtime-'));
 buildWeb('android',{API_BASE_URL:'http://127.0.0.1:45679',HM_ANDROID_LAB:'1'},dir);
 const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');assert.match(html,/LAB · 1.2.0 · Datos sintéticos/);assert.match(html,/data-hm-laboratory="true"/);
 assert.throws(()=>buildWeb('android',{API_BASE_URL:'https://outside.example.invalid',HM_ANDROID_LAB:'1'},fs.mkdtempSync(path.join(os.tmpdir(),'hm-physical-denied-'))),/USB/);
 const official=fs.mkdtempSync(path.join(os.tmpdir(),'hm-official-runtime-'));buildWeb('android',{API_BASE_URL:'https://api.example.invalid'},official);assert.ok(!fs.readFileSync(path.join(official,'index.html'),'utf8').includes('data-hm-laboratory="true"'));
});
test('Firma privada exige modo 600 y rechaza datos incompletos',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hm-physical-sign-')),file=path.join(dir,'signing.json');fs.writeFileSync(file,'{}',{mode:0o644});assert.throws(()=>privateSigning(file),/600/);fs.chmodSync(file,0o600);assert.throws(()=>privateSigning(file),/incompleta/);
});
test('API/PG reales de la candidata: permisos mínimos, aislamiento, CORS y fondos ausentes',{skip:process.env.HIDRO_PHYSICAL_LAB_INTEGRATION!=='1'},async()=>{
 const state=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.local/share/hidromejora/android-lab-120/private/backend-state.json'),'utf8'));
 const {Pool}=require('../../Backend/node_modules/pg'),pool=new Pool({host:'127.0.0.1',port:45680,database:state.database,user:state.user,password:state.password});
 const api=async(route,{token,body,origin='http://localhost',method}={})=>fetch('http://127.0.0.1:45679'+route,{method:method||(body?'POST':'GET'),headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 try{
  const role=(await pool.query('SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];assert.ok(Object.values(role).every(v=>v===false));await assert.rejects(pool.query('CREATE TABLE forbidden_ddl(id int)'),{code:'42501'});
  const tokens=[];for(const a of state.accounts){const r=await api('/api/auth/login',{body:{numero_suministro:a.supply,password:a.password}});assert.equal(r.status,200);tokens.push((await r.json()).token);}
  assert.equal((await api('/api/auth/session',{token:tokens[0]})).status,200);assert.equal((await api('/api/admin/resumen',{token:tokens[0]})).status,403);assert.equal((await api('/api/admin/resumen',{token:tokens[2]})).status,200);
  const incident=await api('/api/incidencias',{token:tokens[0],body:{tipo:'Fuga',descripcion:'Prueba física sintética aislada',referencia:'USB laboratorio'}});assert.equal(incident.status,201);const data=await incident.json(),id=data.incidencia.id_incidencia;
  assert.equal((await api('/api/me/incidencias/'+id+'/seguimiento',{token:tokens[0]})).status,200);assert.equal((await api('/api/me/incidencias/'+id+'/seguimiento',{token:tokens[1]})).status,404);assert.equal((await api('/api/me/incidencias/'+id+'/seguimiento')).status,401);
  const adminOrigin=await api('/api/auth/session',{token:tokens[0],origin:'http://127.0.0.1:45681'});assert.equal(adminOrigin.headers.get('access-control-allow-origin'),'http://127.0.0.1:45681');
  const cors=await api('/api/auth/session',{token:tokens[0],origin:'https://outside.example.invalid'});assert.equal(cors.headers.get('access-control-allow-origin'),null);
  for(const name of ['pagos','operaciones_pago','push_entregas','push_dispositivos'])assert.equal((await pool.query('SELECT count(*)::int n FROM '+name)).rows[0].n,0);
 }finally{await pool.end();}
});
