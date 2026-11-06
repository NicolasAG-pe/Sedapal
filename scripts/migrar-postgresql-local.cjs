'use strict';
// Solo se autoriza explícitamente un PostgreSQL local identificado. No imprime credenciales.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Client}=require('../Backend/node_modules/pg');
const migrations=[
 ['003','003_verificacion_correo.sql',['registros_correo_pendientes','registros_correo_envios']],
 ['004','004_retencion_correo.sql',['idx_registro_vencimiento']],
 ['005','005_integridad_recibos.sql',[]],
 ['006','006_correo_outbox.sql',['correo_outbox']],
 ['007','007_usuario_2fa.sql',['usuario_2fa','usuario_2fa_recuperacion','desafios_2fa']],
 ['008','008_operaciones_pago.sql',['operaciones_pago','operaciones_pago_historial','eventos_pago_proveedor']],
 ['013','013_seguimiento_incidencias.sql',['incidencia_eventos','incidencia_cambios']]
];
async function run(){
 const env=process.env,db=env.HIDRO_MIGRATION_DATABASE,port=Number(env.HIDRO_MIGRATION_PORT);
 if(env.HIDRO_MIGRATION_LOCAL_CONFIRM!=='1'||!db||!env.HIDRO_MIGRATION_USER||!env.HIDRO_MIGRATION_PASSWORD||!Number.isInteger(port)||port<1||port>65535||env.NODE_ENV==='production')throw Error('Falta configuración local explícita o el entorno es de producción.');
 const c=new Client({host:'127.0.0.1',port,user:env.HIDRO_MIGRATION_USER,password:env.HIDRO_MIGRATION_PASSWORD,database:db,connectionTimeoutMillis:5000});
 await c.connect();
 try{
  const verified=await c.query('SELECT current_database() AS db, inet_server_addr() AS host');
  if(verified.rows[0].db!==db)throw Error('Base inesperada.');
  await c.query('SELECT pg_advisory_lock(7399120,5)');
  for(const [id,name,expectedAbsent] of migrations){
   const file=path.join(__dirname,'../Base-de-Datos/migrations',name),sql=fs.readFileSync(file,'utf8');
   const hash=crypto.createHash('sha256').update(sql).digest('hex');
   const begin=/^BEGIN;\s*$/m,commit=/^COMMIT;\s*$/m;
   if((sql.match(/^BEGIN;\s*$/gm)||[]).length!==1||(sql.match(/^COMMIT;\s*$/gm)||[]).length!==1)throw Error('Envoltura de transacción inesperada en '+id);
   const body=sql.replace(begin,'').replace(commit,'');
   await c.query('BEGIN');
   try{
    await c.query("SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='30s'");
    await c.query('CREATE TABLE IF NOT EXISTS public.hidro_migraciones_locales (version text PRIMARY KEY, archivo text NOT NULL, sha256 text NOT NULL, aplicada_en timestamptz NOT NULL DEFAULT clock_timestamp())');
    const previous=await c.query('SELECT archivo,sha256 FROM public.hidro_migraciones_locales WHERE version=$1',[id]);
    if(previous.rowCount){
     if(previous.rows[0].sha256!==hash||previous.rows[0].archivo!==name)throw Error('La migración registrada difiere: '+id);
     await c.query('COMMIT');console.log(id+': ya registrada, checksum correcto');continue;
    }
    for(const table of expectedAbsent){const exists=await c.query('SELECT to_regclass($1) IS NOT NULL AS existe',['public.'+table]);if(exists.rows[0].existe)throw Error('Objeto previo sin registro; requiere revisión: '+table);}
    if(id==='003'){
     const col=await c.query("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='usuarios' AND column_name='correo_verificado_en') AS existe");
     if(col.rows[0].existe)throw Error('Columna previa sin registro; requiere revisión: usuarios.correo_verificado_en');
    }
    await c.query(body);
    await c.query('INSERT INTO public.hidro_migraciones_locales(version,archivo,sha256) VALUES ($1,$2,$3)',[id,name,hash]);
    await c.query('COMMIT');console.log(id+': aplicada y registrada');
   }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}
  }
 }finally{await c.end();}
}
if(require.main===module)run().catch(e=>{console.error('Migración detenida:',e.message);process.exitCode=1});
module.exports={run};
