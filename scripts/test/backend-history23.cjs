'use strict';
// Opt-in: solo el PostgreSQL 18 nuevo del avance 23; nunca lee .env o DATABASE_URL.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {Pool}=require('../../Backend/node_modules/pg');
const state=path.resolve(__dirname,'../../artifacts/avance-23');
const fixture=JSON.parse(fs.readFileSync(path.join(state,'fixture-private.json')));
const db=fixture.api.POSTGRES_DB;
assert.match(db,/^hm23_history(?:_[a-f0-9]+)?$/);
assert.equal(process.env.HIDRO_EMAIL_TEST_DB_PORT,'5432','Ejecutar solo en la red del PostgreSQL sintético dedicado.');
const config={host:'127.0.0.1',port:5432,user:'hm_fixture',password:fixture.api.POSTGRES_PASSWORD};
const sql=name=>fs.readFileSync(path.resolve(__dirname,'../../Base-de-Datos',name),'utf8');
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const file=name=>path.join(state,name+'.json');
const write=(name,value)=>fs.writeFileSync(file(name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
async function snapshot(pool,tables){
 const rows={};for(const table of tables){assert.match(table,/^[a-z_]+$/);rows[table]=(await pool.query(`SELECT to_jsonb(t)-'correo_verificado_en' AS row FROM public.${table} t ORDER BY (to_jsonb(t)-'correo_verificado_en')::text`)).rows;}
 return rows;
}
async function main(){
 const phase=process.argv[2];let pool;
 if(phase==='seed'){
  const parent=new Pool({...config,database:'hm_email_test'});
  try{assert.equal((await parent.query('SELECT current_database() db')).rows[0].db,'hm_email_test');assert.match((await parent.query('SELECT version() v')).rows[0].v,/PostgreSQL 18\./);await parent.query(`CREATE DATABASE "${db}"`);}finally{await parent.end();}
 }
 const target=phase==='restore-check'?process.argv[3]:db;
 assert.ok(target===db || /^hm23_restore_(?:before|after)$/.test(target));
 pool=new Pool({...config,database:target});
 try{
  assert.equal((await pool.query('SELECT current_database() db')).rows[0].db,target);
  if(phase==='seed'){
   await pool.query(fs.readFileSync(path.join(state,'schema-before.sql'),'utf8'));
   const client=await pool.connect();
   try{
    await client.query('BEGIN');
    const ids={};
    for(const [role,account] of Object.entries(fixture.accounts)){
     assert.ok(account.correo.endsWith('@fixture.invalid'));assert.match(account.numero_suministro,/^90000230[123]$/);
     const salt=crypto.randomBytes(16).toString('hex'),hash='scrypt$'+salt+'$'+crypto.scryptSync(account.password,salt,64).toString('hex');
     const u=(await client.query('INSERT INTO usuarios(correo,clave_hash,rol) VALUES ($1,$2,$3) RETURNING id_usuario',[account.correo,hash,role==='admin'?'admin':'usuario'])).rows[0];
     ids[role]=(await client.query("INSERT INTO suministros(numero_suministro,id_usuario,distrito,zona) VALUES ($1,$2,'Fixture','Avance 23') RETURNING id_suministro",[account.numero_suministro,u.id_usuario])).rows[0].id_suministro;
    }
    const add=async(period,status,amount=45)=>(await client.query("INSERT INTO recibos(id_suministro,periodo,fecha_emision,fecha_vencimiento,monto,consumo_m3,estado) VALUES ($1,$2,'2026-10-01','2030-11-01',$3,11,$4) RETURNING id_recibo",[ids.user,period,amount,status])).rows[0].id_recibo;
    const paid=await add('H23-Pagado','Pagado',10);await add('H23-Emitido','Emitido');await add('H23-Anulado','Anulado',12);
    await client.query("INSERT INTO pagos(id_recibo,monto,metodo,codigo_operacion) VALUES ($1,10,'Fixture histórico','HM23-HISTORY')",[paid]);
    await client.query("INSERT INTO incidencias(id_suministro,tipo,descripcion,referencia,latitud,longitud) VALUES ($1,'Fixture','Incidencia histórica sintética','Solo laboratorio',-12.05,-77.03)",[ids.user]);
    await client.query('COMMIT');
   }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
   const tables=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(x=>x.tablename);
   const rows=await snapshot(pool,tables);
   const foreignKeys=(await pool.query("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace ORDER BY conname")).rows;
   const sequences=(await pool.query("SELECT sequencename,last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")).rows;
   write('history-before',{database:db,tables,rows,foreignKeys,sequences,sha256:digest(rows)});
   console.log('OK: esquema del commit desplegado y datos sintéticos históricos sembrados en base nueva.');
  }else if(phase==='migrate'){
   const before=JSON.parse(fs.readFileSync(file('history-before')));
   const checks=(await pool.query(sql('checks/005_integridad_recibos.sql'))).rows;assert.ok(checks.every(x=>Number(x.grupos)===0));
   const client=await pool.connect();
   try{for(let repeat=0;repeat<2;repeat++)for(const migration of ['003_verificacion_correo.sql','004_retencion_correo.sql','005_integridad_recibos.sql','006_correo_outbox.sql'])await client.query(sql('migrations/'+migration));}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
   const rows=await snapshot(pool,before.tables);assert.deepEqual(rows,before.rows);
   const fks=(await pool.query("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace ORDER BY conname")).rows;
   for(const old of before.foreignKeys)assert.deepEqual(fks.find(f=>f.conname===old.conname),old);
   assert.deepEqual((await pool.query("SELECT sequencename,last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")).rows,before.sequences);
   assert.equal(Number((await pool.query('SELECT count(*) n FROM usuarios WHERE correo_verificado_en IS NULL')).rows[0].n),3);
   for(const table of ['registros_correo_pendientes','registros_correo_envios','correo_outbox'])assert.equal((await pool.query('SELECT to_regclass($1)::text t',[table])).rows[0].t,table);
   const unique=(await pool.query("SELECT conname FROM pg_constraint WHERE conname IN ('uq_recibos_suministro_periodo','uq_pagos_recibo') AND contype='u' AND convalidated AND NOT condeferrable")).rows;assert.equal(unique.length,2);
   write('history-migration',{status:'passed',database:db,tablesPreserved:before.tables,legacyRowsSha256:digest(rows),foreignKeysPreserved:true,sequencesPreserved:true,legacyUnverifiedUsers:3,migrationsRuns:2,checks,uniqueConstraints:unique});
   console.log('OK: 003–006 repetidas; filas, cuentas sin verificación, claves, FKs y secuencias conservadas; nuevas constraints/outbox presentes.');
  }else if(phase==='restore-check'){
   const before=JSON.parse(fs.readFileSync(file('history-before')));assert.deepEqual(await snapshot(pool,before.tables),before.rows);
   const fks=(await pool.query("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace ORDER BY conname")).rows;
   for(const old of before.foreignKeys)assert.deepEqual(fks.find(f=>f.conname===old.conname),old);
   assert.deepEqual((await pool.query("SELECT sequencename,last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")).rows,before.sequences);
   if(target==='hm23_restore_after'){
    for(const table of ['registros_correo_pendientes','registros_correo_envios','correo_outbox'])assert.equal((await pool.query('SELECT to_regclass($1)::text t',[table])).rows[0].t,table);
    assert.equal((await pool.query("SELECT conname FROM pg_constraint WHERE conname IN ('uq_recibos_suministro_periodo','uq_pagos_recibo')")).rowCount,2);
   }
   write('restore-'+target,{status:'passed',target,legacyRowsSha256:before.sha256,foreignKeysAndSequencesPreserved:true});console.log('OK: respaldo restaurado en base nueva con filas, FKs y secuencias idénticas: '+target);
  }else if(phase==='preserved-subset'){
   const before=JSON.parse(fs.readFileSync(file('history-before'))),now=await snapshot(pool,before.tables);
   for(const table of before.tables){const rows=new Set(now[table].map(JSON.stringify));for(const row of before.rows[table])assert.ok(rows.has(JSON.stringify(row)),table+': fila histórica conservada');}
   assert.equal(Number((await pool.query('SELECT count(*) n FROM usuarios')).rows[0].n),3);
   assert.equal(Number((await pool.query('SELECT count(*) n FROM correo_outbox')).rows[0].n),0);
   write('history-after-business',{status:'passed',legacyRowsPreserved:true,newSyntheticBusinessRowsAllowed:true,users:3,mainOutbox:0});
   console.log('OK: después de pruebas UI/API se conservan todas las filas históricas originales; altas principales sin usuarios/eventos nuevos.');
  }else throw Error('Fase requerida: seed, migrate, restore-check o preserved-subset.');
 }finally{await pool.end();}
}
main().catch(()=>{console.error('Falló la validación histórica aislada; revisar el fixture y esquema local sin publicar datos.');process.exitCode=1;});
