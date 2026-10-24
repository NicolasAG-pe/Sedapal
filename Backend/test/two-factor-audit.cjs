'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {iniciar}=require('./email-api.cjs'),OTPAuth=require('otpauth');
global.WebSocket=require('ws');const {io}=require('../../Frontend/assets/vendor/socket.io.min.js');
let ctx,n=870,ip=1;const key=crypto.randomBytes(32);
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
before(async()=>{process.env.TOTP_ENCRYPTION_KEY=key.toString('base64');process.env.TOTP_ENROLLMENT_ENABLED='1';ctx=await iniciar();});
after(async()=>{if(ctx)await ctx.close();delete process.env.TOTP_ENCRYPTION_KEY;delete process.env.TOTP_ENROLLMENT_ENABLED;});
async function request(path,body,token){const r=await fetch(ctx.base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':'198.51.100.'+ip++,...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:r.status,data:await r.json()};}
async function account(){const a=ctx.registro(++n),p=(await ctx.request('register',a,202)).data;const d=(await ctx.request('verify-email',ctx.verificar(p.registro_id,ctx.codigo(a.correo)),201)).data;return{...a,id:d.usuario.id_usuario,token:d.token};}
async function pendingCode(a){const m=(await ctx.db.query('SELECT pendiente_secreto FROM usuario_2fa WHERE id_usuario=$1',[a.id])).rows[0];const[,iv,text,tag]=m.pendiente_secreto.split('.'),d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64'));d.setAAD(Buffer.from('hidro-totp-v1:'+a.id));d.setAuthTag(Buffer.from(tag,'base64'));const secret=Buffer.concat([d.update(Buffer.from(text,'base64')),d.final()]).toString();return new OTPAuth.TOTP({secret:OTPAuth.Secret.fromBase32(secret)}).generate();}
test('Un JWT emitido antes de un cambio de rol no adquiere privilegios administrativos',async()=>{
 const a=await account();await ctx.db.query("UPDATE usuarios SET rol='admin' WHERE id_usuario=$1",[a.id]);
 assert.equal((await request('/api/admin/usuarios',undefined,a.token)).status,401);
 await ctx.db.query("UPDATE usuarios SET rol='usuario' WHERE id_usuario=$1",[a.id]);
 assert.equal((await request('/api/auth/session',undefined,a.token)).status,401,'Volver al rol original no revive el JWT');
});
test('Retención elimina solo material temporal y no revive versiones ni pasos TOTP',async()=>{
 const a=await account();await request('/api/auth/2fa/setup',{password:a.password},a.token);
 const confirmed=await request('/api/auth/2fa/confirm',{codigo:await pendingCode(a)},a.token);assert.equal(confirmed.status,200);
 const before=(await ctx.db.query('SELECT version,activo,secreto,ultimo_paso FROM usuario_2fa WHERE id_usuario=$1',[a.id])).rows[0];
 const c=(await ctx.request('login',{numero_suministro:a.numero_suministro,password:a.password},202)).data;
 await ctx.db.query("UPDATE desafios_2fa SET vence_en=clock_timestamp()-INTERVAL '31 days' WHERE id_usuario=$1",[a.id]);
 await ctx.db.query("UPDATE usuario_2fa_recuperacion SET usado_en=clock_timestamp()-INTERVAL '31 days' WHERE id_usuario=$1 AND codigo_hash=(SELECT min(codigo_hash) FROM usuario_2fa_recuperacion WHERE id_usuario=$1)",[a.id]);
 const {limpiarDosFactores}=require('../maintenance/two-factor.cjs');
 await assert.rejects(limpiarDosFactores({pool:ctx.db,expectedDatabase:'wrong-fixture'}),/Destino/);
 const result=await limpiarDosFactores({pool:ctx.db,expectedDatabase:ctx.connection.database});assert.ok(result.challenges>=1);assert.ok(result.recovery>=1);
 assert.deepEqual((await ctx.db.query('SELECT version,activo,secreto,ultimo_paso FROM usuario_2fa WHERE id_usuario=$1',[a.id])).rows[0],before);
 assert.equal((await request('/api/auth/2fa/login',{desafio:c.desafio,codigo:confirmed.data.codigos_recuperacion[0]})).status,401);
 assert.equal((await request('/api/auth/session',undefined,a.token)).status,401);
});
test('Una petición validada antes de cambiar la versión MFA no modifica el estado posterior',async()=>{
 const a=await account(),read=deferred(),release=deferred(),original=ctx.pool.query;let held=false;
 ctx.pool.query=async function(sql,args){const result=await original.call(this,sql,args);if(!held&&typeof sql==='string'&&sql.includes('COALESCE(m.version')&&String(args?.[0])===String(a.id)){held=true;read.resolve();await release.promise;}return result;};
 try{
  const operation=request('/api/auth/2fa/setup',{password:a.password},a.token);await read.promise;
  await ctx.db.query('INSERT INTO usuario_2fa(id_usuario,version) VALUES ($1,1)',[a.id]);release.resolve();
  assert.equal((await operation).status,401);
  assert.equal((await ctx.db.query('SELECT pendiente_secreto FROM usuario_2fa WHERE id_usuario=$1',[a.id])).rows[0].pendiente_secreto,null);
 }finally{release.resolve();ctx.pool.query=original;}
});
test('Un handshake leído antes de activar MFA no entra en rooms privadas tras la revocación',async t=>{
 const a=await account(),read=deferred(),release=deferred(),original=ctx.pool.query;let held=false;
 ctx.pool.query=async function(sql,args){const result=await original.call(this,sql,args);if(!held&&typeof sql==='string'&&sql.includes('COALESCE(m.version')&&String(args?.[0])===String(a.id)){held=true;read.resolve();await release.promise;}return result;};
 const s=io(ctx.base,{auth:{token:a.token},transports:['websocket'],reconnection:false,timeout:4000});t.after(()=>s.close());
 try{
  await read.promise;assert.equal((await request('/api/auth/2fa/setup',{password:a.password},a.token)).status,200);
  assert.equal((await request('/api/auth/2fa/confirm',{codigo:await pendingCode(a)},a.token)).status,200);
  const ended=new Promise(resolve=>{s.once('disconnect',resolve);s.once('connect_error',resolve);});release.resolve();
  let timer;try{await Promise.race([ended,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Handshake antiguo mantuvo conexión')),2000);})]);}finally{clearTimeout(timer);}
  assert.equal(ctx.io.sockets.adapter.rooms.get('usuario:'+a.id)?.size||0,0);
 }finally{release.resolve();ctx.pool.query=original;}
});
