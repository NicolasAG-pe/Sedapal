'use strict';
// Solo fixture nueva. Los contenedores se crean desde el host, en red interna.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const{nuevaBase,sql}=require('../../Backend/test/email-schema.cjs'),{crearCifradoTotp}=require('../../Backend/totp-crypto'),{comprobarCandidato}=require('../check-auth-candidate.cjs');
const dir=process.env.HIDRO_TOTP_LAB_DIR;if(!dir||(fs.statSync(dir).mode&0o077))throw Error('Laboratorio privado obligatorio.');
const file=n=>path.join(dir,n),save=(n,d)=>fs.writeFileSync(file(n),typeof d==='string'?d:JSON.stringify(d),{mode:0o600,flag:'wx'});
(async()=>{
 if(process.argv[2]==='prepare'){
  const{pool,connection}=await nuevaBase('downgrade');
  try{
   await pool.query(sql('init.sql'));const password='SyntheticDowngrade123',salt=crypto.randomBytes(16).toString('hex'),clave='scrypt$'+salt+'$'+crypto.scryptSync(password,salt,64).toString('hex');
   await pool.query("INSERT INTO usuarios(correo,clave_hash) VALUES ('downgrade@example.invalid',$1);",[clave]);await pool.query("INSERT INTO suministros(id_usuario,numero_suministro) VALUES (1,'987000099')");
   const env={TOTP_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64')},secret=new(require('../../Backend/node_modules/otpauth').Secret)({size:20}).base32;
   await pool.query('INSERT INTO usuario_2fa(id_usuario,activo,secreto,version) VALUES (1,TRUE,$1,1)',[crearCifradoTotp(env).encrypt(secret,1)]);
   const recovery='11111111-22222222-33333333-44444444';await pool.query('INSERT INTO usuario_2fa_recuperacion(id_usuario,codigo_hash) VALUES (1,$1)',[crypto.createHash('sha256').update('hidro-recovery-v1:1:'+recovery).digest('hex')]);
   save('api.env','DB_HOST=hm-2fa-audit-pg\nDB_PORT=5432\nPOSTGRES_DB='+connection.database+'\nPOSTGRES_USER=hm_fixture\nPOSTGRES_PASSWORD=fixture-only-not-production\nAUTH_TOKEN_SECRET='+crypto.randomBytes(32).toString('hex')+'\nTOTP_ENCRYPTION_KEY='+env.TOTP_ENCRYPTION_KEY+'\nNODE_ENV=production\nCORS_ALLOWED_ORIGINS=https://localhost\nEMAIL_REGISTRATION_ENABLED=0\nEMAIL_WORKER_ENABLED=0\nTOTP_ENROLLMENT_ENABLED=0\nTOTP_ADMIN_ENROLLMENT_ENABLED=0\n');
   save('fixture.json',{password,recovery,numero_suministro:'987000099'});console.log('Fixture de downgrade preparada, sin destino productivo.');
  }finally{await pool.end();}
 }else if(process.argv[2]==='verify'){
  const f=JSON.parse(fs.readFileSync(file('fixture.json'))),old='http://hm-2fa-old:3000',current='http://hm-2fa-current:3000';
  async function ready(base){for(let i=0;i<60;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch(_){}await new Promise(r=>setTimeout(r,200));}throw Error('API fixture no inició');}
  await ready(old);await ready(current);
  const login=async base=>{const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({numero_suministro:f.numero_suministro,password:f.password})});return{status:r.status,data:await r.json()};};
  const legacy=await login(old);assert.equal(legacy.status,200);assert.ok(legacy.data.token);
  const privateOld=await fetch(old+'/api/auth/session',{headers:{Authorization:'Bearer '+legacy.data.token}});assert.equal(privateOld.status,200);
  await assert.rejects(comprobarCandidato(old,{allowHttpFixture:true}),/incompatible/);assert.equal((await comprobarCandidato(current,{allowHttpFixture:true})).compatible,true);
  const safe=await login(current);assert.equal(safe.status,202);assert.ok(!safe.data.token);
  assert.equal((await fetch(current+'/api/auth/session',{headers:{Authorization:'Bearer '+legacy.data.token}})).status,401);
  const second=await fetch(current+'/api/auth/2fa/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({desafio:safe.data.desafio,codigo:f.recovery})});assert.equal(second.status,200);const full=await second.json();
  assert.equal((await fetch(current+'/api/auth/session',{headers:{Authorization:'Bearer '+full.token}})).status,200);
  save('result.json',{legacyPasswordOnlyLogin:200,legacyPrivateAccess:200,legacyRejectedByGate:true,currentFirstFactor:202,currentRequiresFactor:true,currentRejectsLegacyJwt:true,currentFullSession:200});
  console.log('OK: downgrade inseguro reproducido en aislamiento y candidato antiguo rechazado por la comprobación.');
 }else throw Error('Modo inválido.');
})().catch(()=>{console.error('Falló el laboratorio de downgrade; sin detalles privados.');process.exitCode=1;});
