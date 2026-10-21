'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {iniciar}=require('./email-api.cjs');const jwt=require('jsonwebtoken');
test('Restauración consulta estado/rol reales, conserva cuentas previas y no renueva JWT',async()=>{
 const ctx=await iniciar();try{
  const account=ctx.registro(701),pending=(await ctx.request('register',account,202)).data;
  await ctx.request('verify-email',ctx.verificar(pending.registro_id,ctx.codigo(account.correo)),201);
  await ctx.db.query('UPDATE usuarios SET correo_verificado_en=NULL WHERE correo=$1',[account.correo]);
  const login=(await ctx.request('login',{numero_suministro:account.numero_suministro,password:account.password},200)).data;
  const claims=jwt.decode(login.token);assert.equal(claims.exp-claims.iat,8*3600);
  async function session(token,status){const r=await fetch(ctx.base+'/api/auth/session',{headers:token?{Authorization:'Bearer '+token}:{}});assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');return r.json();}
  await session(null,401);await session(login.token+'.invalid',401);
  const expired=jwt.sign({...claims,exp:Math.floor(Date.now()/1000)-1},process.env.AUTH_TOKEN_SECRET);await session(expired,401);
  const before=(await ctx.db.query('SELECT to_jsonb(u) AS row FROM usuarios u')).rows;
  const restored=await session(login.token,200);assert.equal(restored.usuario.rol,'usuario');assert.equal(restored.usuario.correo,account.correo);assert.equal(restored.suministro.numero_suministro,account.numero_suministro);assert.equal(restored.token,undefined);
  assert.deepEqual((await ctx.db.query('SELECT to_jsonb(u) AS row FROM usuarios u')).rows,before);
  await ctx.db.query('UPDATE usuarios SET activo=false WHERE correo=$1',[account.correo]);await session(login.token,403);
  await ctx.db.query("UPDATE usuarios SET activo=true,rol='admin' WHERE correo=$1",[account.correo]);await session(login.token,403);
  await ctx.db.query("UPDATE usuarios SET rol='usuario' WHERE correo=$1",[account.correo]);await session(login.token,200);
 }finally{await ctx.close();}
});
