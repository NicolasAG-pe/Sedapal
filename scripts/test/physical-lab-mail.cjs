'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
test('LAB: OTP y recuperación auténticos con adapter local, sin correo real',async()=>{
 const directory=path.join(os.homedir(),'.local/share/hidromejora/android-lab-120/private');
 const state=JSON.parse(fs.readFileSync(path.join(directory,'backend-state.json'),'utf8'));
 const {Pool}=require('../../Backend/node_modules/pg'),db=new Pool({host:'127.0.0.1',port:45680,user:state.user,password:state.password,database:state.database});
 const account={correo:'physical-'+crypto.randomBytes(5).toString('hex')+'@example.invalid',numero_suministro:'98'+String(crypto.randomInt(1000000,9999999)),password:'LabSynthetic'+crypto.randomBytes(8).toString('hex')};
 const api=async(route,body)=>{const r=await fetch('http://127.0.0.1:45679/api/auth/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Hidro-Auth-Contract':'otp-outbox-v1'},body:JSON.stringify(body)});return{status:r.status,data:await r.json()};};
 const simulate=()=>{
  const old=new Set(fs.readdirSync(directory));execFileSync(process.execPath,['scripts/android-lab-private-operations.cjs','simulate-mail'],{cwd:path.resolve(__dirname,'../..'),stdio:'pipe'});
  const name=fs.readdirSync(directory).find(f=>!old.has(f)&&fs.existsSync(path.join(directory,f,'simulated-mail.json')));assert.ok(name);return JSON.parse(fs.readFileSync(path.join(directory,name,'simulated-mail.json'),'utf8'));
 };
 try{
  const pending=await api('otp/register',{...account,solicitud_id:crypto.randomUUID()});assert.equal(pending.status,202);
  const code=simulate().find(m=>m.email===account.correo)?.text.match(/\d{6}/)?.[0];assert.ok(code,'Código solo en adapter privado');
  const verified=await api('verify-email',{registro_id:pending.data.registro_id,codigo:code});assert.equal(verified.status,201);assert.ok(verified.data.token);
  const recovery=await api('password-recovery/request',{correo:account.correo,solicitud_id:crypto.randomUUID()});assert.equal(recovery.status,202);
  const recoveryCode=simulate().find(m=>m.email===account.correo)?.text.match(/\d{8}/)?.[0];assert.ok(recoveryCode,'Recuperación solo local');
  const validated=await api('password-recovery/verify',{solicitud_id:recovery.data.solicitud_id,codigo:recoveryCode});assert.equal(validated.status,200);
  for(const table of ['correo_outbox','recuperacion_clave_outbox']){
   const n=(await db.query('SELECT count(*)::int n FROM '+table+" WHERE estado='aceptado' AND proveedor_id NOT LIKE 'local-simulation-%'")).rows[0].n;assert.equal(n,0,'Sin aceptación de proveedor real');
  }
 }finally{await db.end();}
});
