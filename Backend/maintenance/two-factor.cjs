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
module.exports={limpiarDosFactores};
