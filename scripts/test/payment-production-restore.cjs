'use strict';
// Requiere respaldo privado verificado. Solo usa Docker local marcado, sin red/puertos.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
function docker(args,options={}){return execFileSync('docker',args,{encoding:'utf8',maxBuffer:8*1024*1024,stdio:['pipe','pipe','pipe'],...options});}
function psql(container,database,source){return docker(['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','hm_restore_owner','-d',database,'-At'],{input:source});}
(async()=>{
 const backup=fs.realpathSync(process.env.HIDRO_COMPAT_BACKUP_DIR||'');assert.ok(!backup.startsWith(root+path.sep),'Respaldo fuera del repositorio');
 assert.equal(fs.statSync(backup).mode&0o077,0);const summary=JSON.parse(fs.readFileSync(path.join(backup,'result.json')));assert.equal(summary.restoreVerified,true);
 const dump=path.join(backup,'production.dump');assert.equal(crypto.createHash('sha256').update(fs.readFileSync(dump)).digest('hex'),summary.sha256);
 assert.ok(fs.statfsSync(root).bavail*fs.statfsSync(root).bsize>512*1024*1024,'Conservar al menos512MB libres; no limpiar automáticamente.');
 const container=process.env.HIDRO_COMPAT_PG_CONTAINER||'hm-release120-restore',state=JSON.parse(docker(['inspect',container]))[0];assert.equal(state.Config.Labels['hidromejora.release'],'120-private-restore');assert.equal(state.HostConfig.NetworkMode,'none');assert.ok(!state.HostConfig.PortBindings||!Object.keys(state.HostConfig.PortBindings).length);
 const configFile=fs.realpathSync(process.env.HIDRO_COMPAT_PG_ENV||'');assert.equal(fs.statSync(configFile).mode&0o077,0);
 const config=Object.fromEntries(fs.readFileSync(configFile,'utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));assert.equal(config.POSTGRES_USER,'hm_restore_owner');assert.ok(config.POSTGRES_PASSWORD);
 fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});const output=fs.mkdtempSync(path.join(root,'artifacts/production-payments-compat-'));fs.chmodSync(output,0o700);
 const suffix=crypto.randomBytes(6).toString('hex'),database='hm_production_compat_'+suffix;
 const report={result:'preparing',productionAccess:false,backupUnmodified:true,migrations:[],applicationsEach:2,container,postgresInitiallyRunning:state.State.Running};
 if(!state.State.Running)docker(['start',container]);
 let ready=false;for(let i=0;i<60;i++){
  try{if(psql(container,'hm_restore_120','SELECT 1;').trim()==='1'){ready=true;break;}}catch(_){}await new Promise(r=>setTimeout(r,250));
 }assert.ok(ready,'PostgreSQL privado disponible');
 docker(['exec',container,'createdb','-U','hm_restore_owner',database]);
 const restored=execFileSync('docker',['exec','-i',container,'pg_restore','--no-owner','--no-privileges','--single-transaction','--exit-on-error','-U','hm_restore_owner','-d',database],{input:fs.readFileSync(dump),encoding:'utf8',stdio:['pipe','pipe','pipe']});
 fs.writeFileSync(path.join(output,'restore.log'),restored,{mode:0o600});
 const fingerprint=JSON.parse(fs.readFileSync(path.join(backup,'snapshot-fingerprint.private.json')));const columns={};for(const c of fingerprint.columns)(columns[c.table_name]||=[]).push(c.column_name);
 fs.writeFileSync(path.join(output,'original-columns.private.json'),JSON.stringify(columns),{mode:0o600});
 const quote=s=>'"'+s.replaceAll('"','""')+'"';
 function checkOriginal(){for(const [table,cols]of Object.entries(columns)){
  const data=JSON.parse(psql(container,database,"SELECT json_build_object('n',count(*)::text,'digest',md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),''))) FROM (SELECT "+cols.map(quote).join(',')+' FROM public.'+quote(table)+')t;'));
  assert.deepEqual(data,fingerprint.tables[table],'Filas previas conservadas');
 }}checkOriginal();
 const route=['007_usuario_2fa.sql','008_operaciones_pago.sql','011_recuperacion_clave.sql','012_notificaciones_push.sql','013_seguimiento_incidencias.sql','014_compatibilidad_operaciones_produccion.sql'];
 let migrationLog='';for(const name of route){for(let n=0;n<2;n++)migrationLog+=psql(container,database,fs.readFileSync(path.join(root,'Base-de-Datos/migrations',name),'utf8'));report.migrations.push(name.slice(0,3));}
 fs.writeFileSync(path.join(output,'migrations.log'),migrationLog,{mode:0o600});checkOriginal();report.originalDataChecksumsMatch=true;
 assert.equal(psql(container,database,"SELECT to_regclass('public.control_piloto_yape') IS NULL;").trim(),'t');
 assert.equal(psql(container,database,"SELECT convalidated FROM pg_constraint WHERE conname='chk_operacion_produccion_sin_piloto' AND conrelid='public.operaciones_pago'::regclass;").trim(),'t');
 report.noPilotControlTable=true;
 const env={NODE_ENV:'production',DB_HOST:'127.0.0.1',DB_PORT:'5432',POSTGRES_DB:database,POSTGRES_USER:'hm_restore_owner',POSTGRES_PASSWORD:config.POSTGRES_PASSWORD,AUTH_TOKEN_SECRET:crypto.randomBytes(32).toString('hex'),CORS_ALLOWED_ORIGINS:'https://localhost,https://admin.compat.fixture',EMAIL_REGISTRATION_ENABLED:'0',EMAIL_WORKER_ENABLED:'0',PASSWORD_RECOVERY_ENABLED:'0',PASSWORD_RECOVERY_WORKER_ENABLED:'0',PUSH_ENABLED:'0',PUSH_WORKER_ENABLED:'0',PUSH_REAL_DELIVERY_ALLOWED:'0',PUSH_REMINDERS_ENABLED:'0',TOTP_ENROLLMENT_ENABLED:'0',TOTP_ADMIN_ENROLLMENT_ENABLED:'0',PAYMENTS_MANUAL_ENABLED:'0',YAPE_PILOT_ENABLED:'0',HIDRO_PRODUCTION_COMPAT_FIXTURE:'1',HIDRO_PAYMENT_SOURCE_SHA256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'Backend/payment-operations.js'))).digest('hex')};
 const envFile=path.join(output,'runtime.private.env');fs.writeFileSync(envFile,Object.entries(env).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600});
 const image=process.env.HIDRO_COMPAT_IMAGE||'hidro-mejora-api:release-120-preparation';assert.equal(JSON.parse(docker(['image','inspect',image]))[0].Config.Labels['hidromejora.release'],'120-preparation');
 const name='hm-payment-compat-'+suffix;
 docker(['run','--pull=never','-d','--name',name,'--label','hidromejora.release=120-payment-compat','--network','container:'+container,'--read-only','--user',process.getuid()+':'+process.getgid(),'--cap-drop','ALL','--security-opt','no-new-privileges','--log-driver','none','--env-file',envFile,'--mount','type=bind,src='+output+',dst=/evidence','--mount','type=bind,src='+path.join(root,'scripts/test/payment-production-runtime.cjs')+',dst=/checks/runtime.cjs,readonly','--entrypoint','node',image,'/checks/runtime.cjs']);
 report.apiContainer=name;report.database=database;
 for(let i=0;i<120;i++){
  if(fs.existsSync(path.join(output,'ready.json'))){report.result='passed';break;}
  if(!JSON.parse(docker(['inspect',name]))[0].State.Running)break;
  await new Promise(r=>setTimeout(r,250));
 }
 fs.writeFileSync(path.join(output,'restore-result.json'),JSON.stringify(report,null,2),{mode:0o600});assert.equal(report.result,'passed','Prueba REST: revisar informe privado');
 console.log('Ruta productiva restaurada y REST aprobados. Evidencia: '+output);
})().catch(()=>{console.error('Compatibilidad detenida; no se muestran datos ni credenciales. Conservar evidencias y revisar los recursos propios.');process.exitCode=1;});
