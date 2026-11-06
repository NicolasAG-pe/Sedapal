'use strict';
// Manejo local de Compose; secretos descifrados únicamente en memoria.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {leerJsonPrivado,validarCredenciales}=require('../Backend/gmail-mail');
const root=path.resolve(__dirname,'..'),home=process.env.HOME,privateDir=path.join(home,'.config/hidro-mejora/gmail');
const dbOverride=path.join(home,'hidro-dbeaver/compose.dbeaver.yaml'),gmailOverride=path.join(home,'hidro-dbeaver/compose.gmail.preparado.yaml');
const base=['compose','--project-directory',root,'-p','sedapal','-f',path.join(root,'compose.yaml'),'-f',dbOverride];
function run(args,options={}){const r=spawnSync('/usr/bin/docker',args,{cwd:root,encoding:'utf8',...options});if(r.error||r.status!==0)throw Error('Docker Compose no pudo completar la operación.');return r.stdout}
function decrypt(name){const f=path.join(privateDir,name+'.cred'),st=fs.lstatSync(f);if(!st.isFile()||st.uid!==process.getuid()||(st.mode&0o077))throw Error('Credencial cifrada no protegida.');const r=spawnSync('/usr/bin/systemd-creds',['decrypt','--user','--name='+name,f,'-'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});if(r.error||r.status!==0||!r.stdout)throw Error('No se pudo descifrar una credencial local.');return r.stdout}
function environment(){
 const credentialsPath=path.join(privateDir,'credentials-renovada-20261104.json'),creds=leerJsonPrivado(credentialsPath),pin=leerJsonPrivado(path.join(privateDir,'authorized-sender.json'));
 validarCredenciales(creds,creds.sender);if(pin.sender!==creds.sender)throw Error('Remitente OAuth no coincide.');
 const app=decrypt('local-app-db'),worker=decrypt('local-mail-db');if(!/^[a-f0-9]{64}$/.test(app)||!/^[a-f0-9]{64}$/.test(worker))throw Error('Credencial de base inválida.');
 return {...process.env,HIDRO_APP_DB_USER:'hidro_app_login_120',HIDRO_APP_DB_PASSWORD:app,HIDRO_GMAIL_SENDER:creds.sender,HIDRO_GMAIL_CREDENTIALS_PATH:credentialsPath,
  HIDRO_EMAIL_OTP_SECRET:decrypt('local-otp'),HIDRO_EMAIL_OUTBOX_KEY:decrypt('local-outbox'),HIDRO_TOTP_ENCRYPTION_KEY:decrypt('local-totp'),
  HIDRO_EMAIL_REGISTRATION_ENABLED:'1',HIDRO_EMAIL_WORKER_SHARED_CONTAINER:'1',HIDRO_EMAIL_WORKER_ENABLED:'1',HIDRO_EMAIL_TEST_RECIPIENT:'',
  HIDRO_TOTP_ENROLLMENT_ENABLED:'1',HIDRO_TOTP_ADMIN_ENROLLMENT_ENABLED:'1',
  HIDRO_WORKER_DATABASE_URL:'postgres://hidro_correo_login_120:'+worker+'@db:5432/hidro_mejora'};
}
function validate(env){
 const cfg=JSON.parse(run([...base,'-f',gmailOverride,'config','--format','json'],{env,stdio:['ignore','pipe','pipe']}));
 const db=cfg.services.db,api=cfg.services.backend,e=api.environment,p=db.ports||[];
 if(cfg.name!=='sedapal'||cfg.volumes.postgres_data.name!=='sedapal_postgres_data'||p.length!==1||p[0].host_ip!=='127.0.0.1'||String(p[0].published)!=='5433'||Number(p[0].target)!==5432||e.POSTGRES_DB!=='hidro_mejora'||e.POSTGRES_USER!=='hidro_app_login_120'||e.EMAIL_PROVIDER!=='gmail'||e.EMAIL_WORKER_ENABLED!=='1'||e.EMAIL_REGISTRATION_ENABLED!=='1'||e.YAPE_PILOT_ENABLED!=='0'||e.PAYMENTS_MANUAL_ENABLED!=='0')throw Error('Configuración local no coincide con el destino previsto.');
 if(!api.volumes?.some(v=>v.target==='/run/hidro-gmail/credentials.json'&&v.read_only))throw Error('Montaje OAuth no protegido.');
}
function main(){
 const action=process.argv[2]||'check';if(!['check','up','start','rollback'].includes(action)||process.argv.length>3)throw Error('Usar check, up, start o rollback.');
 if(action==='rollback'){run([...base,'up','-d','--no-deps','--no-build','--wait','--wait-timeout','90','backend','web','admin'],{stdio:'inherit'});return}
 const env=environment();validate(env);if(action==='check'){console.log('Configuración local verificada sin mostrar secretos.');return}
 const args=action==='up'?['up','-d','--no-deps','--no-build','--wait','--wait-timeout','90','backend','web','admin']:['start','backend','web','admin'];
 run([...base,'-f',gmailOverride,...args],{env,stdio:'inherit'});
}
if(require.main===module){try{main()}catch(e){console.error('Operación local detenida: '+e.message);process.exitCode=1}}
module.exports={run};
