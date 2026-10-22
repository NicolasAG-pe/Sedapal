'use strict';
// Ejecutar por stdin exclusivamente en el backend del clúster avance19.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{Pool}=require('pg');
(async()=>{let raw='';for await(const data of process.stdin)raw+=data;
 const accounts=JSON.parse(raw),pool=new Pool({host:process.env.DB_HOST,port:process.env.DB_PORT,
 database:process.env.POSTGRES_DB,user:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD});
 try{
  assert.equal((await pool.query('select current_database() db')).rows[0].db,'hm_avance19');
  for(const table of ['registros_correo_pendientes','registros_correo_envios','correo_outbox'])assert.equal((await pool.query('select to_regclass($1)::text t',[table])).rows[0].t,table);
  await pool.query('BEGIN');
  for(const [role,a]of Object.entries(accounts)){
   assert.ok(a.correo.endsWith('@fixture.invalid'));assert.match(a.numero_suministro,/^90000190[123]$/);
   const old=(await pool.query('select u.clave_hash,u.rol,s.numero_suministro from usuarios u join suministros s using(id_usuario) where correo=$1',[a.correo])).rows[0];
   const expected=role==='admin'?'admin':'usuario';
   if(old){const [,salt,hash]=old.clave_hash.split('$');assert.equal(crypto.scryptSync(a.password,salt,64).toString('hex'),hash);assert.equal(old.rol,expected);assert.equal(old.numero_suministro,a.numero_suministro);continue;}
   const salt=crypto.randomBytes(16).toString('hex'),hash='scrypt$'+salt+'$'+crypto.scryptSync(a.password,salt,64).toString('hex');
   const id=(await pool.query('insert into usuarios(correo,clave_hash,rol) values($1,$2,$3) returning id_usuario',[a.correo,hash,expected])).rows[0].id_usuario;
   await pool.query('insert into suministros(numero_suministro,id_usuario) values($1,$2)',[a.numero_suministro,id]);
  }
  await pool.query('COMMIT');console.log('OK: cuentas sintéticas verificadas en hm_avance19; esquema OTP/outbox presente.');
 }catch(e){await pool.query('ROLLBACK');throw e;}finally{await pool.end();}
})().catch(()=>{console.error('No se pudo provisionar el fixture; revisar destino/esquema privadamente.');process.exitCode=1;});
