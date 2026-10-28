'use strict';
// Biblioteca explícita, sin conexión ni ejecución al importar. No se inicia con la API.
async function limpiarDosFactores({pool,expectedDatabase,limit=100,retentionDays=30}){
 if(!expectedDatabase || !Number.isInteger(limit)||limit<1||limit>1000 || !Number.isInteger(retentionDays)||retentionDays<7)throw Error('Parámetros de mantenimiento inválidos.');
 const c=await pool.connect();let discard;
 try{
  await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='2s'");await c.query("SET LOCAL statement_timeout='10s'");
  if((await c.query('SELECT current_database() db')).rows[0].db!==expectedDatabase)throw Error('Destino de mantenimiento inesperado.');
  const pending=await c.query(`WITH batch AS (SELECT id_usuario FROM usuario_2fa WHERE pendiente_hasta<clock_timestamp()
   ORDER BY id_usuario FOR UPDATE SKIP LOCKED LIMIT $1)
   UPDATE usuario_2fa m SET pendiente_secreto=NULL,pendiente_hasta=NULL,reautenticado_en=NULL
   FROM batch b WHERE b.id_usuario=m.id_usuario`,[limit]);
  const challenges=await c.query(`WITH batch AS (SELECT id_hash FROM desafios_2fa
   WHERE vence_en<clock_timestamp()-make_interval(days=>$2) ORDER BY id_hash FOR UPDATE SKIP LOCKED LIMIT $1)
   DELETE FROM desafios_2fa d USING batch b WHERE d.id_hash=b.id_hash`,[limit,retentionDays]);
  const recovery=await c.query(`WITH batch AS (SELECT id_usuario,codigo_hash FROM usuario_2fa_recuperacion
   WHERE usado_en<clock_timestamp()-make_interval(days=>$2) ORDER BY id_usuario,codigo_hash FOR UPDATE SKIP LOCKED LIMIT $1)
   DELETE FROM usuario_2fa_recuperacion r USING batch b WHERE r.id_usuario=b.id_usuario AND r.codigo_hash=b.codigo_hash`,[limit,retentionDays]);
  await c.query('COMMIT');return{pending:pending.rowCount,challenges:challenges.rowCount,recovery:recovery.rowCount};
 }catch(e){await c.query('ROLLBACK').catch(()=>{discard=Error('Conexión de mantenimiento inválida.');});throw e;}
 finally{c.release(discard);}
}
async function rotarClaveTotp({pool,env,expectedDatabase,dryRun=true,maxRows=1000}){
 const cipher=require('../totp-crypto').crearCifradoTotp(env);
 if(!expectedDatabase||!cipher.available()||!Number.isInteger(maxRows)||maxRows<1||maxRows>10000)throw Error('Parámetros de rotación inválidos.');
 const c=await pool.connect();let discard;
 try{
  await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='2s'");await c.query("SET LOCAL statement_timeout='30s'");
  if((await c.query('SELECT current_database() db')).rows[0].db!==expectedDatabase)throw Error('Destino de rotación inesperado.');
  await c.query('SELECT pg_advisory_xact_lock(7402,1)');
  const{rows}=await c.query('SELECT id_usuario,secreto,pendiente_secreto FROM usuario_2fa ORDER BY id_usuario FOR UPDATE');
  if(rows.length>maxRows)throw Error('Volumen fuera del límite de rotación autorizado.');
  let changed=0;
  for(const row of rows){
   const values={};
   for(const field of ['secreto','pendiente_secreto'])if(row[field]){
    const clear=cipher.decrypt(row[field],row.id_usuario);
    if(!row[field].startsWith('v2.'+cipher.currentId()+'.')){values[field]=cipher.encrypt(clear,row.id_usuario);changed++;}
   }
   if(!dryRun&&Object.keys(values).length)await c.query('UPDATE usuario_2fa SET secreto=$2,pendiente_secreto=$3 WHERE id_usuario=$1',[row.id_usuario,values.secreto||row.secreto,values.pendiente_secreto||row.pendiente_secreto]);
  }
  await c.query(dryRun?'ROLLBACK':'COMMIT');return{dryRun,rows:rows.length,fields:changed};
 }catch(e){await c.query('ROLLBACK').catch(()=>{discard=Error('Conexión de rotación inválida.');});throw e;}
 finally{c.release(discard);}
}
module.exports={limpiarDosFactores,rotarClaveTotp};
