'use strict';
const{test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),OTPAuth=require('otpauth');
const{iniciar}=require('./email-api.cjs'),{crearCifradoTotp}=require('../totp-crypto');
let ctx,n=900,ip=1;
before(async()=>{process.env.TOTP_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');process.env.TOTP_ENROLLMENT_ENABLED='1';process.env.TOTP_ADMIN_ENROLLMENT_ENABLED='1';ctx=await iniciar();});
after(async()=>{if(ctx)await ctx.close();for(const k of ['TOTP_ENCRYPTION_KEY','TOTP_ENROLLMENT_ENABLED','TOTP_ADMIN_ENROLLMENT_ENABLED'])delete process.env[k];});
async function req(path,body,token,status){const r=await fetch(ctx.base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':'203.0.113.'+ip++,...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const d=await r.json();assert.equal(r.status,status,d.mensaje);return d;}
async function admin(){const a=ctx.registro(++n),p=(await ctx.request('register',a,202)).data,u=(await ctx.request('verify-email',ctx.verificar(p.registro_id,ctx.codigo(a.correo)),201)).data;await ctx.db.query("UPDATE usuarios SET rol='admin' WHERE id_usuario=$1",[u.usuario.id_usuario]);return{...a,id:u.usuario.id_usuario,token:(await ctx.request('login',{numero_suministro:a.numero_suministro,password:a.password},200)).data.token};}
test('Admin mantiene login anterior sin factor y solo administra su propio 2FA',async()=>{
 const a=await admin();await req('/api/admin/resumen',undefined,a.token,200);
 const setup=await req('/api/auth/2fa/setup',{password:a.password},a.token,200);assert.ok(setup.qr);
 const m=(await ctx.db.query('SELECT pendiente_secreto FROM usuario_2fa WHERE id_usuario=$1',[a.id])).rows[0];
 const secret=crearCifradoTotp(process.env).decrypt(m.pendiente_secreto,a.id),totp=new OTPAuth.TOTP({secret:OTPAuth.Secret.fromBase32(secret)});
 const enabled=await req('/api/auth/2fa/confirm',{codigo:totp.generate()},a.token,200);
 await req('/api/admin/resumen',undefined,a.token,401);
 const d=(await ctx.request('login',{numero_suministro:a.numero_suministro,password:a.password},202)).data;assert.equal(d.rol,'admin');assert.ok(!d.token);
 await req('/api/admin/resumen',undefined,d.desafio,401);
 const logged=await req('/api/auth/2fa/login',{desafio:d.desafio,codigo:totp.generate({timestamp:Date.now()+30000})},null,200);assert.equal(logged.usuario.rol,'admin');
 await req('/api/admin/resumen',undefined,logged.token,200);await req('/api/auth/session',undefined,logged.token,403);
 process.env.TOTP_ADMIN_ENROLLMENT_ENABLED='0';
 try{
  const next=(await ctx.request('login',{numero_suministro:a.numero_suministro,password:a.password},202)).data;
  await req('/api/auth/2fa/login',{desafio:next.desafio,codigo:enabled.codigos_recuperacion[0]},null,200);
  const disabled=await req('/api/auth/2fa/disable',{password:a.password,codigo:enabled.codigos_recuperacion[1]},logged.token,200);
  await req('/api/admin/resumen',undefined,disabled.token,200);
  await req('/api/auth/2fa/setup',{password:a.password},disabled.token,503);
 }finally{process.env.TOTP_ADMIN_ENROLLMENT_ENABLED='1';}
});
test('Una cuenta de usuario no modifica un factor administrativo mediante id en el cuerpo',async()=>{
 const a=await admin(),user=ctx.registro(++n),p=(await ctx.request('register',user,202)).data,u=(await ctx.request('verify-email',ctx.verificar(p.registro_id,ctx.codigo(user.correo)),201)).data;
 await req('/api/auth/2fa/setup',{password:user.password,id_usuario:a.id},u.token,200);
 assert.equal((await ctx.db.query('SELECT pendiente_secreto FROM usuario_2fa WHERE id_usuario=$1',[a.id])).rows[0].pendiente_secreto,null);
 await req('/api/admin/usuarios',undefined,u.token,403);
});
test('Promover un usuario protegido conserva su factor y exige login nuevo antes de Admin',async()=>{
 const a=ctx.registro(++n),p=(await ctx.request('register',a,202)).data,u=(await ctx.request('verify-email',ctx.verificar(p.registro_id,ctx.codigo(a.correo)),201)).data;
 await req('/api/auth/2fa/setup',{password:a.password},u.token,200);
 const m=(await ctx.db.query('SELECT pendiente_secreto FROM usuario_2fa WHERE id_usuario=$1',[u.usuario.id_usuario])).rows[0],secret=crearCifradoTotp(process.env).decrypt(m.pendiente_secreto,u.usuario.id_usuario);
 const factor=await req('/api/auth/2fa/confirm',{codigo:new OTPAuth.TOTP({secret:OTPAuth.Secret.fromBase32(secret)}).generate()},u.token,200);
 await ctx.db.query("UPDATE usuarios SET rol='admin' WHERE id_usuario=$1",[u.usuario.id_usuario]);
 await req('/api/admin/resumen',undefined,factor.token,401);
 const d=(await ctx.request('login',{numero_suministro:a.numero_suministro,password:a.password},202)).data;assert.equal(d.rol,'admin');
 const fresh=await req('/api/auth/2fa/login',{desafio:d.desafio,codigo:factor.codigos_recuperacion[0]},null,200);
 await req('/api/admin/resumen',undefined,fresh.token,200);
});
test('Comprobación de candidato acepta contrato actual y rechaza respuesta antigua sin desplegar',async()=>{
 const{comprobarCandidato}=require('../../scripts/check-auth-candidate.cjs');assert.equal((await comprobarCandidato(ctx.base)).compatible,true);
 await assert.rejects(comprobarCandidato('https://old.fixture.invalid',{fetchImpl:async()=>Response.json({estado:'ok'})}),/incompatible/);
 await assert.rejects(comprobarCandidato('http://remote.fixture.invalid',{fetchImpl:async()=>Response.json({})}),/HTTPS/);
});
