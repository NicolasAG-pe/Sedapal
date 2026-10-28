'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const{iniciar}=require('./email-api.cjs'),{crearCifradoTotp,respaldarClaves,restaurarClaves}=require('../totp-crypto'),{rotarClaveTotp}=require('../maintenance/two-factor.cjs');
test('Rotación SQL: dry-run, atomicidad, recuperación de clave, idempotencia y conservación',async()=>{
 const old={TOTP_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64')};process.env.TOTP_ENCRYPTION_KEY=old.TOTP_ENCRYPTION_KEY;process.env.TOTP_ENROLLMENT_ENABLED='1';
 const ctx=await iniciar();
 try{
  const users=[];for(const n of [891,892]){const a=ctx.registro(n),p=(await ctx.request('register',a,202)).data,d=(await ctx.request('verify-email',ctx.verificar(p.registro_id,ctx.codigo(a.correo)),201)).data;
   const r=await fetch(ctx.base+'/api/auth/2fa/setup',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+d.token},body:JSON.stringify({password:a.password})});assert.equal(r.status,200);await r.json();users.push(d.usuario.id_usuario);}
  const snapshot=async()=>(await ctx.db.query('SELECT * FROM usuario_2fa ORDER BY id_usuario')).rows;
  const before=await snapshot(),clear=crearCifradoTotp(old).decrypt(before[0].pendiente_secreto,users[0]);
  // También prueba un secreto activo y contadores/versión no triviales.
  await ctx.db.query('UPDATE usuario_2fa SET activo=TRUE,secreto=pendiente_secreto,version=7,ultimo_paso=12345 WHERE id_usuario=$1',[users[0]]);
  const baseline=await snapshot(),next={TOTP_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64'),TOTP_PREVIOUS_ENCRYPTION_KEYS:JSON.stringify([old.TOTP_ENCRYPTION_KEY])};
  const config={pool:ctx.db,expectedDatabase:ctx.connection.database,env:next};
  assert.equal((await rotarClaveTotp(config)).fields,3);assert.deepEqual(await snapshot(),baseline);
  await assert.rejects(rotarClaveTotp({...config,expectedDatabase:'wrong-fixture',dryRun:false}));assert.deepEqual(await snapshot(),baseline);
  await ctx.db.query("UPDATE usuario_2fa SET pendiente_secreto='invalid' WHERE id_usuario=$1",[users[1]]);
  const corrupt=await snapshot();await assert.rejects(rotarClaveTotp({...config,dryRun:false}));assert.deepEqual(await snapshot(),corrupt,'El primer recifrado también se revierte');
  await ctx.db.query('UPDATE usuario_2fa SET pendiente_secreto=$2 WHERE id_usuario=$1',[users[1],baseline[1].pendiente_secreto]);
  const changed=await rotarClaveTotp({...config,dryRun:false});assert.equal(changed.fields,3);assert.equal((await rotarClaveTotp({...config,dryRun:false})).fields,0);
  const after=await snapshot();for(let i=0;i<after.length;i++){const omit=r=>Object.fromEntries(Object.entries(r).filter(([k])=>!['secreto','pendiente_secreto'].includes(k)));assert.deepEqual(omit(after[i]),omit(baseline[i]));}
  const kek=crypto.randomBytes(32),restored=restaurarClaves(respaldarClaves(next,kek),kek);
  assert.equal(crearCifradoTotp(restored).decrypt(after[0].secreto,users[0]),clear);
  assert.equal((await ctx.db.query('SELECT count(*)::int n FROM usuarios')).rows[0].n,2);
 }finally{await ctx.close();delete process.env.TOTP_ENCRYPTION_KEY;delete process.env.TOTP_ENROLLMENT_ENABLED;}
});
test('CLI de claves: archivos 0600 exclusivos, sin secretos en salida, permisos/enlaces rechazados',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hm-totp-keys-')),key=path.join(dir,'recovery.key'),backup=path.join(dir,'backup.enc'),out=path.join(dir,'restored.json');
 const env={TOTP_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64')};fs.writeFileSync(key,crypto.randomBytes(32).toString('base64'),{mode:0o600});
 const{main}=require('../maintenance/totp-keys.cjs');
 const result=main(['backup','--recovery-key-file',key,'--output',backup],env);assert.ok(!JSON.stringify(result).includes(env.TOTP_ENCRYPTION_KEY));
 main(['restore','--recovery-key-file',key,'--backup-file',backup,'--output',out],{});assert.equal(JSON.parse(fs.readFileSync(out)).TOTP_ENCRYPTION_KEY,env.TOTP_ENCRYPTION_KEY);
 for(const f of [backup,out])assert.equal(fs.statSync(f).mode&0o777,0o600);
 assert.throws(()=>main(['backup','--recovery-key-file',key,'--output',backup],env));
 fs.chmodSync(key,0o644);assert.throws(()=>main(['backup','--recovery-key-file',key,'--output',path.join(dir,'unsafe')],env));fs.chmodSync(key,0o600);
 fs.symlinkSync(key,path.join(dir,'link'));assert.throws(()=>main(['backup','--recovery-key-file',path.join(dir,'link'),'--output',path.join(dir,'unsafe')],env));
});
