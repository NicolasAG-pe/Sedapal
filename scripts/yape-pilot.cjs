'use strict';
// Solo piloto nuevo de loopback. Nunca lee .env ni credenciales de servicios existentes.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),http=require('node:http');
const{execFileSync}=require('node:child_process'),{Pool}=require('../Backend/node_modules/pg'),QRCode=require('../Backend/node_modules/qrcode');
const{pngSeguro}=require('../Backend/payment-operations'),{privateFile,fingerprint,databasePattern,loadPilot,guardPilot}=require('../Backend/yape-pilot');
const root=path.resolve(__dirname,'..'),parent=path.join(os.homedir(),'.config/hidro-mejora/yape-pilot');
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
function localDocker(){if(process.env.DOCKER_HOST&&!process.env.DOCKER_HOST.startsWith('unix://'))throw Error('Se requiere Docker local.');const context=JSON.parse(docker('context','inspect'))[0];if(!context.Endpoints.docker.Host.startsWith('unix://'))throw Error('Se requiere Docker local.');}
const poolFor=s=>new Pool({host:'127.0.0.1',port:s.db_port,database:s.database,user:'hm_fixture',password:s.db_password});
function save(file,data){fs.writeFileSync(file,JSON.stringify(data,null,2),{mode:0o600,flag:'wx'});}
function read(file){return JSON.parse(privateFile(path.resolve(file),16384));}
function assertState(s){localDocker();if(s.version!==1||!databasePattern.test(s.database)||!/^hm-yape-pilot-[a-f0-9]{12}$/.test(s.container)||!Number.isInteger(s.db_port)||!path.isAbsolute(s.manifest))throw Error('Estado privado incompatible.');const d=JSON.parse(docker('inspect',s.container))[0];if(!d.State.Running||Number(d.NetworkSettings.Ports?.['5432/tcp']?.[0]?.HostPort)!==s.db_port||d.Config.Labels['hidro.pilot.id']!==s.id||d.Config.Labels['hidro.task']!=='yape-pilot-local'||d.HostConfig.PortBindings['5432/tcp'][0].HostIp!=='127.0.0.1')throw Error('Contenedor ajeno o sin aislamiento.');}
function args(){const a=process.argv.slice(3),o={};for(let i=0;i<a.length;i++){if(['--synthetic','--real-voluntary','--receiver-authorized'].includes(a[i]))o[a[i]]=true;else if(['--qr','--amount','--state'].includes(a[i])&&a[i+1])o[a[i]]=a[++i];else throw Error('Argumento no admitido.');}return o;}
async function prepare(o){
 localDocker();
 if(o['--synthetic']===!!o['--real-voluntary'])throw Error('Elige --synthetic o --real-voluntary.');
 if(o['--real-voluntary']&&(!o['--receiver-authorized']||!o['--qr']))throw Error('El modo voluntario requiere QR privado y --receiver-authorized del titular.');
 if(o['--real-voluntary']){const input=fs.realpathSync(path.resolve(o['--qr']));if(input===root||input.startsWith(root+path.sep))throw Error('El QR real debe estar fuera del repositorio.');}
 const amount=o['--amount']||'1.00';if(!/^\d+\.\d{2}$/.test(amount)||Number(amount)<=0||Number(amount)>5)throw Error('Importe del piloto: dos decimales, mayor que cero y máximo S/ 5.');
 fs.mkdirSync(parent,{recursive:true,mode:0o700});fs.chmodSync(parent,0o700);const id=crypto.randomUUID(),suffix=crypto.randomBytes(6).toString('hex'),dir=path.join(parent,suffix);fs.mkdirSync(dir,{mode:0o700});
 const qr=pngSeguro(o['--synthetic']?await QRCode.toBuffer('HIDRO-MEJORA ENSAYO SIN CUENTA RECEPTORA'):privateFile(path.resolve(o['--qr']),1048576));fs.writeFileSync(path.join(dir,'receptor.png'),qr,{mode:0o600,flag:'wx'});
 const s={version:1,id,container:'hm-yape-pilot-'+suffix,database:'hm_yape_pilot_'+suffix,db_password:crypto.randomBytes(32).toString('hex'),auth_secret:crypto.randomBytes(32).toString('hex'),manifest:path.join(dir,'pilot.json'),qr:path.join(dir,'receptor.png')};
 // No reutilizar nombres, volúmenes, puertos fijos ni bases existentes. Conservar al cerrar.
 docker('run','-d','--name',s.container,'--label','hidro.task=yape-pilot-local','--label','hidro.pilot.mode='+(o['--synthetic']?'synthetic':'real_voluntary'),'--label','hidro.pilot.id='+id,'-e','POSTGRES_USER=hm_fixture','-e','POSTGRES_PASSWORD='+s.db_password,'-e','POSTGRES_DB='+s.database,'-p','127.0.0.1::5432','postgres:18');
 s.db_port=Number(JSON.parse(docker('inspect',s.container))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort);save(path.join(dir,'state.json'),s);
 let db;for(let i=0;i<60;i++){db=poolFor(s);try{await db.query('SELECT 1');break;}catch(_){await db.end();db=null;await new Promise(r=>setTimeout(r,500));}}
 if(!db)throw Error('PostgreSQL no quedó disponible. Conserva el estado privado para revisión.');
 try{
  await db.query(fs.readFileSync(path.join(root,'Base-de-Datos/init.sql'),'utf8'));
  const credentials=[];
  await db.query('BEGIN');
  for(const role of ['usuario','admin']){
   const password=crypto.randomBytes(24).toString('base64url'),salt=crypto.randomBytes(16).toString('hex'),hash='scrypt$'+salt+'$'+crypto.scryptSync(password,salt,64).toString('hex');
   const{rows:[u]}=await db.query('INSERT INTO usuarios(correo,clave_hash,rol) VALUES($1,$2,$3) RETURNING id_usuario',[role+'.'+suffix+'@example.invalid',hash,role]);
   const supply='98'+String(crypto.randomInt(0,10000000)).padStart(7,'0');await db.query('INSERT INTO suministros(numero_suministro,id_usuario) VALUES($1,$2)',[supply,u.id_usuario]);credentials.push({role,supply,password,id_usuario:u.id_usuario});
  }
  const user=credentials[0],admin=credentials[1];
  const{rows:[receipt]}=await db.query("INSERT INTO recibos(id_suministro,periodo,fecha_emision,fecha_vencimiento,monto,consumo_m3,estado) SELECT id_suministro,'Piloto Yape local',CURRENT_DATE,CURRENT_DATE+1,$2,0,'Pendiente' FROM suministros WHERE id_usuario=$1 RETURNING id_recibo",[user.id_usuario,amount]);
  const windowStart=Date.now();const p={version:1,id,user_id:user.id_usuario,admin_id:admin.id_usuario,receipt_id:receipt.id_recibo,synthetic:!!o['--synthetic'],max_amount:amount,starts_at:new Date(windowStart).toISOString(),expires_at:new Date(windowStart+4*3600000).toISOString(),qr_hash:fingerprint(qr)};
  await db.query('INSERT INTO control_piloto_yape(piloto_id,habilitado,ensayo_sintetico,id_recibo,id_usuario,id_admin,qr_hash,monto_maximo,inicio_en,vence_en) VALUES($1,true,$2,$3,$4,$5,$6,$7,$8,$9)',[id,p.synthetic,p.receipt_id,p.user_id,p.admin_id,p.qr_hash,p.max_amount,p.starts_at,p.expires_at]);
  save(s.manifest,p);save(path.join(dir,'credentials.json'),{accounts:credentials.map(({id_usuario,...a})=>a)});await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{await db.end();}
 console.log('Piloto preparado; no se ejecutó transferencia. Estado privado: '+path.join(dir,'state.json'));
}
async function start(o){
 const s=read(o['--state']);assertState(s);
 // Limpiar entorno heredado: ninguna variable de Neon/Render/correo del usuario se reutiliza.
 const safe={PATH:process.env.PATH,HOME:os.homedir(),NODE_ENV:'development',PORT:'3000',DATABASE_URL:'',DB_HOST:'127.0.0.1',DB_PORT:String(s.db_port),POSTGRES_DB:s.database,POSTGRES_USER:'hm_fixture',POSTGRES_PASSWORD:s.db_password,AUTH_TOKEN_SECRET:s.auth_secret,
 EMAIL_REGISTRATION_ENABLED:'0',EMAIL_WORKER_ENABLED:'0',EMAIL_WORKER_SHARED_CONTAINER:'0',TOTP_ENROLLMENT_ENABLED:'0',TOTP_ADMIN_ENROLLMENT_ENABLED:'0',PAYMENTS_MANUAL_ENABLED:'1',YAPE_PILOT_ENABLED:'1',YAPE_PILOT_CONFIG_FILE:s.manifest,YAPE_QR_FILE:s.qr};
 for(const key of Object.keys(process.env))delete process.env[key];Object.assign(process.env,safe);
 const db=poolFor(s);try{await guardPilot(db,loadPilot(),{id_usuario:JSON.parse(privateFile(s.manifest)).user_id});}finally{await db.end();}
 const servers=[http.createServer(),http.createServer()];for(const server of servers)await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origins=servers.map(server=>'http://127.0.0.1:'+server.address().port);process.env.CORS_ALLOWED_ORIGINS=origins.join(',');
 const backend=require('../Backend/server');await new Promise(r=>backend.httpServer.listen(0,'127.0.0.1',r));const api='http://127.0.0.1:'+backend.httpServer.address().port;
 const{buildWeb}=require('./build-web'),express=require('../Backend/node_modules/express');
 fs.mkdirSync(path.join(root,'artifacts/yape-piloto-120'),{recursive:true});
 const runtime=fs.mkdtempSync(path.join(root,'artifacts/yape-piloto-120/runtime-'));
 for(const [i,target] of ['web','admin'].entries()){
  const directory=path.join(runtime,target);buildWeb(target,{API_BASE_URL:api},directory);const app=express();app.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});app.use(express.static(directory));servers[i].on('request',app);
 }
 console.log(JSON.stringify({api,client:origins[0],admin:origins[1],credentials:path.join(path.dirname(s.manifest),'credentials.json'),expiresAt:JSON.parse(privateFile(s.manifest)).expires_at}));
 let stopping=false;const stop=()=>{if(stopping)return;stopping=true;servers.forEach(server=>server.close());backend.io.close(()=>backend.pool.end().then(()=>process.exit(0)));setTimeout(()=>process.exit(1),10000).unref();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
async function close(o){const s=read(o['--state']);assertState(s);const db=poolFor(s);try{await db.query('UPDATE control_piloto_yape SET habilitado=false WHERE piloto_id=$1',[s.id]);}finally{await db.end();}console.log('Ventana cerrada; datos y contenedor conservados.');}
if(require.main===module)(async()=>{const o=args();if(process.argv[2]==='prepare')await prepare(o);else if(process.argv[2]==='start')await start(o);else if(process.argv[2]==='close')await close(o);else throw Error('Usa prepare, start o close.');})().catch(error=>{if(error.code)console.error('Diagnóstico local: '+String(error.code)+' '+String(error.constraint||''));console.error(['Argumento no admitido.','Usa prepare, start o close.'].includes(error.message)?error.message:'No se completó la operación local; revisa configuración, permisos, readiness o ventana. No se tocaron servicios productivos.');process.exitCode=1;});
module.exports={assertState};
