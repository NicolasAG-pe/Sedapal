'use strict';
// API auténtica, nueva base sintética y sin workers/proveedores externos.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {Pool}=require('../Backend/node_modules/pg');
const root=path.resolve(__dirname,'..'),CONTAINER='hm-physical-120-pg',LABEL='android-physical-120';
const directory=path.join(os.homedir(),'.local/share/hidromejora/android-lab-120/private');
const stateFile=path.join(directory,'backend-state.json');
const random=()=>crypto.randomBytes(32).toString('base64');
function save(file,value){fs.writeFileSync(file,JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});}
function inspect(){
 const c=JSON.parse(execFileSync('docker',['inspect',CONTAINER],{encoding:'utf8'}))[0];
 const ports=c.NetworkSettings.Ports?.['5432/tcp'];
 if(c.Config.Labels?.['hidromejora.lab']!==LABEL||!Array.isArray(ports)||ports.length!==1||ports[0].HostIp!=='127.0.0.1'||ports[0].HostPort!=='45680')throw Error('Contenedor o puerto ajeno al laboratorio.');
 if(!c.State.Running)throw Error('PostgreSQL LAB está detenido. Inícialo explícitamente sin recrearlo.');
 return c;
}
async function initialize(){
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 if(fs.existsSync(stateFile))throw Error('Existe estado LAB; se conserva. Usa --start.');
 // Nunca reemplazar contenedor/volumen con el mismo nombre.
 if(execFileSync('docker',['ps','-a','--filter','name=^/'+CONTAINER+'$','--format','{{.Names}}'],{encoding:'utf8'}).trim())throw Error('Contenedor existente: no se reemplaza.');
 if(execFileSync('docker',['volume','ls','--filter','name=^hm-physical-120-pg-data$','--format','{{.Name}}'],{encoding:'utf8'}).trim())throw Error('Volumen existente: no se reutiliza sin revisar.');
 const adminPassword=random();
 const envFile=path.join(directory,'postgres-bootstrap.env');
 fs.writeFileSync(envFile,'POSTGRES_USER=hm_lab_owner\nPOSTGRES_PASSWORD='+adminPassword+'\nPOSTGRES_DB=hm_lab_control\n',{mode:0o600,flag:'wx'});
 execFileSync('docker',['run','--pull=never','-d','--name',CONTAINER,'--label','hidromejora.lab='+LABEL,'--env-file',envFile,'-p','127.0.0.1:45680:5432','--mount','type=volume,source=hm-physical-120-pg-data,target=/var/lib/postgresql','postgres:18'],{stdio:'pipe'});
 const owner={host:'127.0.0.1',port:45680,user:'hm_lab_owner',password:adminPassword,database:'hm_lab_control'};
 let ready=false;for(let i=0;i<60;i++){const p=new Pool(owner);try{await p.query('SELECT 1');ready=true;break;}catch(_){}finally{await p.end();}await new Promise(r=>setTimeout(r,500));}if(!ready)throw Error('PostgreSQL no inició; contenedor conservado.');
 inspect();
 const database='hm_physical_'+crypto.randomBytes(8).toString('hex'),appPassword=crypto.randomBytes(32).toString('hex');
 const admin=new Pool(owner);await admin.query('CREATE DATABASE '+database);await admin.end();
 const db=new Pool({...owner,database});
 try{
  await db.query(fs.readFileSync(path.join(root,'Base-de-Datos/init.sql'),'utf8'));
  for(const f of fs.readdirSync(path.join(root,'Base-de-Datos/migrations')).filter(f=>/^0(?:07|08|09|10|11|12|13)_/.test(f)).sort())await db.query(fs.readFileSync(path.join(root,'Base-de-Datos/migrations',f),'utf8'));
  const password=crypto.randomBytes(18).toString('base64url');
  const accounts=[];
  for(let i=1;i<=3;i++){
   const salt=crypto.randomBytes(16).toString('hex'),hash='scrypt$'+salt+'$'+crypto.scryptSync(password,salt,64).toString('hex');
   const id=(await db.query('INSERT INTO usuarios(correo,clave_hash,rol,correo_verificado_en) VALUES($1,$2,$3,now()) RETURNING id_usuario',['lab'+i+'@example.invalid',hash,i===3?'admin':'usuario'])).rows[0].id_usuario;
   const supply='90000800'+i;
   await db.query("INSERT INTO suministros(numero_suministro,id_usuario,distrito,zona) VALUES($1,$2,'Laboratorio','Zona sintética')",[supply,id]);
   accounts.push({supply,password,role:i===3?'admin':'usuario'});
  }
  await db.query("CREATE ROLE hm_lab_app LOGIN PASSWORD '"+appPassword+"' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS");
  await db.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO hm_lab_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO hm_lab_app; GRANT USAGE,SELECT,UPDATE ON ALL SEQUENCES IN SCHEMA public TO hm_lab_app');
  const state={database,user:'hm_lab_app',password:appPassword,accounts,AUTH_TOKEN_SECRET:random(),EMAIL_OTP_SECRET:random(),EMAIL_OUTBOX_KEY:random(),TOTP_ENCRYPTION_KEY:random(),PUSH_TOKEN_KEY:random(),PASSWORD_RECOVERY_SECRET:random(),PASSWORD_RECOVERY_OUTBOX_KEY:random()};
  save(stateFile,state);save(path.join(directory,'lab-accounts.json'),accounts);
 }finally{await db.end();}
 console.log('Base nueva preparada; cuentas sintéticas únicamente en el archivo privado local.');
}
function environment(state){
 const env={PATH:process.env.PATH,HOME:os.homedir(),NODE_ENV:'test',PORT:'45679',DATABASE_URL:'',DB_HOST:'127.0.0.1',DB_PORT:'45680',POSTGRES_DB:state.database,POSTGRES_USER:state.user,POSTGRES_PASSWORD:state.password,CORS_ALLOWED_ORIGINS:'http://localhost,http://127.0.0.1:45681',EMAIL_PROVIDER:'resend',RESEND_FROM:'lab@example.invalid',EMAIL_REGISTRATION_ENABLED:'1',PASSWORD_RECOVERY_ENABLED:'1',TOTP_ENROLLMENT_ENABLED:'1',PUSH_ENABLED:'1',PUSH_PROVIDER:'mock',PUSH_REAL_DELIVERY_ALLOWED:'0',PUSH_WORKER_ENABLED:'0',PUSH_REMINDERS_ENABLED:'0',HM_PUSH_ANDROID_ENABLED:'0',PAYMENTS_MANUAL_ENABLED:'0'};
 for(const k of ['AUTH_TOKEN_SECRET','EMAIL_OTP_SECRET','EMAIL_OUTBOX_KEY','TOTP_ENCRYPTION_KEY','PUSH_TOKEN_KEY','PASSWORD_RECOVERY_SECRET','PASSWORD_RECOVERY_OUTBOX_KEY'])env[k]=state[k];return env;
}
async function start(){
 inspect();const stat=fs.statSync(stateFile);if(stat.mode&0o077)throw Error('Estado privado requiere modo 600.');
 const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));if(!/^hm_physical_[a-f0-9]{16}$/.test(state.database)||state.user!=='hm_lab_app')throw Error('Base ajena a LAB.');
 const env=environment(state);for(const k of Object.keys(process.env))delete process.env[k];Object.assign(process.env,env);
 // Sin credenciales reales y con barrera de red adicional para adaptadores fetch.
 const original=global.fetch;global.fetch=(url,opt)=>{const u=new URL(typeof url==='string'?url:url.url);if(u.hostname!=='127.0.0.1'||u.port!=='45679'||u.protocol!=='http:')throw Error('Salida externa bloqueada en LAB.');return original(url,opt);};
 const backend=require('../Backend/server');
 await new Promise((resolve,reject)=>{backend.httpServer.once('error',reject);backend.httpServer.listen(45679,'127.0.0.1',resolve);});
 let closing=false;async function close(){if(closing)return;closing=true;await new Promise(r=>backend.io.close(r));await backend.pool.end();}
 process.once('SIGINT',()=>close());process.once('SIGTERM',()=>close());
 console.log('LAB 1.2.0: API 127.0.0.1:45679; PostgreSQL dedicado, entregas reales bloqueadas.');
 return {backend,state,close};
}
if(require.main===module){const action=process.argv[2];(action==='--init'?initialize():action==='--start'?start():Promise.reject(Error('Usa --init (una vez) o --start.'))).catch(()=>{console.error('Laboratorio detenido; revisa contenedor/estado local privado. No se eliminó nada.');process.exitCode=1;});}
module.exports={environment,start,initialize,inspect};
