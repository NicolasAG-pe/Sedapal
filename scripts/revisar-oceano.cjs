// Revisión local del cliente y el panel con la API real y PostgreSQL de pruebas.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const {execFileSync, spawn} = require('node:child_process');
const {Client} = require('../Backend/node_modules/pg');
const express = require('../Backend/node_modules/express');
const {buildWeb} = require('./build-web');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'artifacts/oceano/revision');
const container = 'hm-oceano-pg-local';
const database = 'hm_oceano_revision';
const host = '127.0.0.1';
const db = {host, port:45931, user:'hm_fixture', password:'fixture-only-not-production'};
const api = 'http://127.0.0.1:45689';
const docker = (...args) => execFileSync('docker',['--host','unix:///var/run/docker.sock',...args],{encoding:'utf8'}).trim();

async function prepareDatabase() {
  const names = docker('ps','-a','--filter','name=^/'+container+'$','--format','{{.Names}}');
  if (!names) {
    docker('run','-d','--pull','never','--name',container,'--label','proyecto=oceano-claro',
      '--tmpfs','/var/lib/postgresql:rw,size=512m','-p',host+':45931:5432','-e','POSTGRES_DB=hm_email_test',
      '-e','POSTGRES_USER='+db.user,'-e','POSTGRES_PASSWORD='+db.password,'postgres:18');
  }
  const [info] = JSON.parse(docker('inspect',container));
  const port = info.HostConfig.PortBindings['5432/tcp']?.[0];
  if (info.Config.Labels.proyecto !== 'oceano-claro' || port?.HostIp !== host || port.HostPort !== '45931')
    throw Error('El contenedor existente no corresponde al entorno de revisión.');
  if (!info.State.Running) docker('start',container);
  for (let i=0;i<60;i++) {
    try { docker('exec',container,'pg_isready','-U',db.user); break; }
    catch { await new Promise(resolve => setTimeout(resolve,300)); }
  }
  const parent = new Client({...db,database:'hm_email_test'});
  await parent.connect();
  try {
    const exists = await parent.query('SELECT 1 FROM pg_database WHERE datname=$1',[database]);
    if (!exists.rowCount) await parent.query('CREATE DATABASE hm_oceano_revision');
  } finally { await parent.end(); }
  const client = new Client({...db,database});
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(45931)');
    if (!(await client.query("SELECT to_regclass('public.usuarios') AS tabla")).rows[0].tabla) {
      await client.query(fs.readFileSync(path.join(root,'Base-de-Datos/init.sql'),'utf8'));
      for (const [supply,role] of [['900000002','usuario'],['900000001','admin']]) {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = 'scrypt$'+salt+'$'+crypto.scryptSync('Oceano-Prueba-2026',salt,64).toString('hex');
        const account = await client.query('INSERT INTO usuarios(correo,clave_hash,rol,correo_verificado_en) VALUES($1,$2,$3,now()) RETURNING id_usuario',[role+'@example.invalid',hash,role]);
        const service = await client.query('INSERT INTO suministros(numero_suministro,id_usuario,distrito,zona) VALUES($1,$2,$3,$4) RETURNING id_suministro',[supply,account.rows[0].id_usuario,'Ate','Santa Clara']);
        if (role !== 'usuario') continue;
        const id = service.rows[0].id_suministro;
        const months = ['Junio','Julio','Agosto','Septiembre','Octubre','Noviembre'];
        const volumes = [19,18,15,20,16,17], amounts = [72,70,61,80,64.4,68.4];
        for (const [i,label] of months.entries()) {
          const month = String(i+6).padStart(2,'0');
          await client.query('INSERT INTO recibos(id_suministro,periodo,fecha_emision,fecha_vencimiento,monto,consumo_m3,estado) VALUES($1,$2,$3,$4,$5,$6,$7)',
            [id,label+' 2026','2026-'+month+'-01','2026-'+month+'-28',amounts[i],volumes[i],i===5?'Emitido':'Pagado']);
        }
        await client.query("INSERT INTO incidencias(id_suministro,tipo,descripcion,referencia) VALUES($1,'Fuga de agua','Hay agua en la vereda junto al medidor.','Frente al suministro de prueba')",[id]);
        await client.query("INSERT INTO solicitudes_atencion(id_suministro,categoria,asunto,descripcion) VALUES($1,'Facturación','Consumo de octubre','Quisiera revisar el importe del periodo.')",[id]);
        await client.query("INSERT INTO notificaciones(id_suministro,titulo,mensaje) VALUES($1,'Recibo de noviembre','Tu recibo está disponible.')",[id]);
        await client.query("INSERT INTO cortes_servicio(alcance,distrito,zona,motivo,fecha_inicio,fecha_fin) VALUES('Zona','Ate','Santa Clara','Mantenimiento programado',now()+interval '2 days',now()+interval '2 days 2 hours')");
      }
    }
    await client.query(`INSERT INTO pagos(id_recibo,monto,metodo,codigo_operacion,fecha_pago)
      SELECT r.id_recibo,r.monto,'Histórico de prueba','LOCAL-HIST-' || r.id_recibo,r.fecha_emision + 10
      FROM recibos r JOIN suministros s USING(id_suministro)
      WHERE s.numero_suministro='900000002' AND r.estado='Pagado'
        AND r.periodo IN ('Junio 2026','Julio 2026','Agosto 2026','Septiembre 2026','Octubre 2026')
      ON CONFLICT (id_recibo) DO NOTHING`);
    await client.query('COMMIT');
    for(const file of ['011_recuperacion_clave.sql','012_notificaciones_push.sql']){
      await client.query(fs.readFileSync(path.join(root,'Base-de-Datos/migrations',file),'utf8'));
    }
  } finally { await client.end(); }
}

async function checkPorts() {
  for (const port of [45689,45932,45933]) {
    await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once('error', () => reject(Error('El puerto local '+port+' está ocupado. Si la revisión ya está abierta, usa http://127.0.0.1:45932/ o http://127.0.0.1:45933/.')));
      server.listen(port, host, () => server.close(resolve));
    });
  }
}

async function main() {
  await checkPorts();
  fs.mkdirSync(output,{recursive:true,mode:0o700});
  const keyFile = path.join(output,'local-keys.json');
  const names = ['AUTH_TOKEN_SECRET','TOTP_ENCRYPTION_KEY','EMAIL_OTP_SECRET','EMAIL_OUTBOX_KEY','PASSWORD_RECOVERY_SECRET','PASSWORD_RECOVERY_OUTBOX_KEY'];
  if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile,JSON.stringify(Object.fromEntries(names.map(n=>[n,crypto.randomBytes(32).toString('base64')]))),{flag:'wx',mode:0o600});
  await prepareDatabase();
  const qr = path.join(output,'qr-prueba.png');
  if(!fs.existsSync(qr)){
    const bytes = await require('../Backend/node_modules/qrcode').toBuffer('Hidro-Mejora: prueba local sin cuenta receptora');
    fs.writeFileSync(qr,bytes,{mode:0o600,flag:'wx'});
  }
  const systemPath = process.env.PATH;
  for (const name of Object.keys(process.env)) delete process.env[name];
  const mailbox = path.join(output,'buzon-local.jsonl');
  const connection = 'postgres://'+db.user+':'+db.password+'@'+host+':45931/'+database;
  Object.assign(process.env,JSON.parse(fs.readFileSync(keyFile)),{
    PATH:systemPath,PAYMENTS_MANUAL_ENABLED:'1',YAPE_QR_FILE:qr,NODE_ENV:'development',DB_HOST:host,DB_PORT:'45931',POSTGRES_USER:db.user,POSTGRES_PASSWORD:db.password,POSTGRES_DB:database,
    CORS_ALLOWED_ORIGINS:'http://127.0.0.1:45932,http://127.0.0.1:45933',CHAT_PROVIDER:'local',
    EMAIL_REGISTRATION_ENABLED:'1',EMAIL_WORKER_ENABLED:'1',EMAIL_WORKER_DATABASE_URL:connection,EMAIL_WORKER_EXPECTED_DATABASE:database,
    PASSWORD_RECOVERY_ENABLED:'1',PASSWORD_RECOVERY_WORKER_ENABLED:'1',PASSWORD_RECOVERY_DATABASE_URL:connection,PASSWORD_RECOVERY_EXPECTED_DATABASE:database,
    TOTP_ENROLLMENT_ENABLED:'1',TOTP_ADMIN_ENROLLMENT_ENABLED:'1',HIDRO_TEST_MAILBOX:mailbox,
    RESEND_FROM:'registro@example.invalid',RESEND_API_KEY:'local-fixture',PUSH_ENABLED:'0'
  });
  const fixture = path.join(__dirname,'revision-correo-local.cjs');
  require(fixture);
  const backend = require('../Backend/server');
  backend.httpServer.listen(45689,host);
  const workers = ['email-outbox','password-recovery'].map(name=>spawn(process.execPath,['--require',fixture,path.join(root,'Backend/workers',name+'.cjs'),'--run'],{stdio:'inherit'}));
  const servers = ['web','admin'].map((target,i)=>{
    const dir = buildWeb(target,{API_BASE_URL:api,HM_CHAT_LAB:'1'});
    const app = express();
    app.use(express.static(dir));
    return app.listen(45932+i,host);
  });
  console.log('Cliente http://127.0.0.1:45932/ · Admin http://127.0.0.1:45933/');
  function close(){
    workers.forEach(worker=>worker.kill('SIGTERM'));
    servers.forEach(server=>server.close());
    backend.io.close(()=>backend.pool.end());
  }
  process.once('SIGINT',close);
  process.once('SIGTERM',close);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
