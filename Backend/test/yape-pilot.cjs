'use strict';
const{test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),QRCode=require('qrcode');
const{iniciar}=require('./email-api.cjs'),{crearOperacionesPago,pngSeguro}=require('../payment-operations'),{fingerprint,loadPilot}=require('../yape-pilot'),{sql}=require('./email-schema.cjs');
let ctx,p,dir,service,accounts=[],n=1;
const body=(reference='PILOT-'+crypto.randomUUID())=>({id_recibo:p.receipt_id,solicitud_id:crypto.randomUUID(),metodo:'yape_manual',referencia:reference});
const decision=(r,more={})=>({accion:'confirmar',motivo:'Comprobación sintética, sin transferencia externa',movimiento_comprobado:true,receptor_comprobado:true,monto_recibido:'1.00',referencia_comprobada:r.referencia,recibido_en:new Date(Date.now()-1000).toISOString(),...more});
async function req(method,url,token,data){const r=await fetch(ctx.base+url,{method,headers:{'Content-Type':'application/json','X-Forwarded-For':'192.0.2.'+(n++%230+1),...(token?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})});return{status:r.status,data:await r.json()};}
before(async()=>{
 ctx=await iniciar({databasePrefix:'yape_pilot'});fs.mkdirSync(path.resolve('artifacts/yape-piloto-120'),{recursive:true,mode:0o700});dir=fs.mkdtempSync(path.resolve('artifacts/yape-piloto-120/fixture-'));fs.chmodSync(dir,0o700);
 for(let i=0;i<3;i++){const a=ctx.registro(8800+i),q=(await ctx.request('register',a,202)).data,u=(await ctx.request('verify-email',ctx.verificar(q.registro_id,ctx.codigo(a.correo)),201)).data;
 if(i===1)await ctx.db.query("UPDATE usuarios SET rol='admin' WHERE id_usuario=$1",[u.usuario.id_usuario]);
 accounts.push({...u.suministro,id_usuario:u.usuario.id_usuario,token:(await ctx.request('login',{numero_suministro:a.numero_suministro,password:a.password},200)).data.token});}
 const id=(await ctx.db.query("INSERT INTO recibos(id_suministro,periodo,fecha_emision,fecha_vencimiento,monto,consumo_m3,estado) VALUES($1,'Piloto sintético',CURRENT_DATE,CURRENT_DATE+7,1.00,0,'Pendiente') RETURNING id_recibo",[accounts[0].id_suministro])).rows[0].id_recibo;
 const qr=pngSeguro(await QRCode.toBuffer('HIDRO-MEJORA ENSAYO SIN CUENTA YAPE'));const qrFile=path.join(dir,'qr.png');fs.writeFileSync(qrFile,qr,{mode:0o600});
 p={version:1,id:crypto.randomUUID(),user_id:accounts[0].id_usuario,admin_id:accounts[1].id_usuario,receipt_id:id,synthetic:true,max_amount:'1.00',starts_at:new Date(Date.now()-60000).toISOString(),expires_at:new Date(Date.now()+3600000).toISOString(),qr_hash:fingerprint(qr)};
 fs.writeFileSync(path.join(dir,'pilot.json'),JSON.stringify(p),{mode:0o600});
 await ctx.db.query('INSERT INTO control_piloto_yape(piloto_id,habilitado,ensayo_sintetico,id_recibo,id_usuario,id_admin,qr_hash,monto_maximo,inicio_en,vence_en) VALUES($1,true,$2,$3,$4,$5,$6,$7,$8,$9)',[p.id,p.synthetic,p.receipt_id,p.user_id,p.admin_id,p.qr_hash,p.max_amount,p.starts_at,p.expires_at]);
 Object.assign(process.env,{YAPE_PILOT_ENABLED:'1',YAPE_PILOT_CONFIG_FILE:path.join(dir,'pilot.json'),YAPE_QR_FILE:qrFile,PAYMENTS_MANUAL_ENABLED:'1'});service=crearOperacionesPago({pool:ctx.db});
});
after(async()=>{if(ctx)await ctx.close();for(const k of ['YAPE_PILOT_ENABLED','YAPE_PILOT_CONFIG_FILE','YAPE_QR_FILE','PAYMENTS_MANUAL_ENABLED'])delete process.env[k];});
async function cancel(o){await service.cancel(o.id,accounts[0]);}
test('piloto cerrado por defecto, producción/DB remota rechazadas y QR solo para participante',async()=>{
 assert.equal(loadPilot({}),null);
 for(const patch of [{NODE_ENV:'production'},{DATABASE_URL:'postgresql://fixture.invalid/db'},{DB_HOST:'db.remote.invalid'},{POSTGRES_DB:'neondb'}])assert.throws(()=>loadPilot({...process.env,...patch}),/aislada/);
 assert.equal((await req('GET','/api/pagos/config',accounts[0].token)).data.entorno,'piloto_manual');
 const other=(await req('GET','/api/pagos/config',accounts[2].token)).data;assert.equal(other.yape_manual,false);assert.equal(Object.hasOwn(other,'recibo_piloto'),false);
 assert.equal((await fetch(ctx.base+'/api/pagos/yape/qr',{headers:{Authorization:'Bearer '+accounts[0].token}})).status,200);
 assert.equal((await fetch(ctx.base+'/api/pagos/yape/qr',{headers:{Authorization:'Bearer '+accounts[2].token}})).status,503);
});
test('migración 009 aditiva repetible y simulaciones conservadas sin convertirse en transferencias reales',async()=>{
 const demo=await service.create({...body(),metodo:'demostrativo'},accounts[0]);assert.equal(demo.operacion.entorno,'simulado');
 const previous=(await ctx.db.query('SELECT row_to_json(o) FROM operaciones_pago o')).rows;await ctx.db.query(sql('migrations/009_yape_piloto_local.sql'));await ctx.db.query(sql('migrations/008_operaciones_pago.sql'));await ctx.db.query(sql('migrations/009_yape_piloto_local.sql'));
 assert.deepEqual((await ctx.db.query('SELECT row_to_json(o) FROM operaciones_pago o')).rows,previous);
});
test('declarada pero no recibida: pendiente, sin evidencia acreditada; rechazo auditable',async()=>{
 const{operacion:o}=await service.create(body(),accounts[0]);assert.equal(o.estado,'pendiente_verificacion');assert.equal(o.piloto_ensayo,true);assert.equal(o.recibido_en,null);assert.equal(o.acreditacion_financiera,false);await assert.rejects(service.qr(accounts[0]),{status:409});
 const rejected=await service.review(o.id,{accion:'rechazar',motivo:'No existe recepción en el movimiento receptor'},accounts[1]);assert.equal(rejected.estado,'rechazada');assert.equal(rejected.recibido_en,null);await assert.rejects(service.qr(accounts[0]),{status:409});
});
test('referencia, importe, receptor y fecha deben cotejarse; otro usuario no puede confirmar',async()=>{
 const{operacion:o}=await service.create(body(),accounts[0]);
 for(const patch of [{referencia_comprobada:'INCORRECTA'},{monto_recibido:'0.01'},{receptor_comprobado:false},{recibido_en:'2030-01-01T00:00:00Z'},{recibido_en:'2020-01-01T00:00:00Z'}])await assert.rejects(service.review(o.id,decision(o,patch),accounts[1]),{status:400});
 assert.equal((await req('POST','/api/admin/operaciones-pago/'+o.id+'/revisar',accounts[0].token,decision(o))).status,403);
 await cancel(o);
});
test('tipo voluntario exige declaración explícita y no confirma dinero en este ensayo',async()=>{
 const file=process.env.YAPE_PILOT_CONFIG_FILE;const original=fs.readFileSync(file);fs.writeFileSync(file,JSON.stringify({...p,synthetic:false}));await ctx.db.query('UPDATE control_piloto_yape SET ensayo_sintetico=false');
 try{await assert.rejects(service.create(body(),accounts[0]),{status:400});const r=await service.create({...body(),declaracion_voluntaria:true},accounts[0]);assert.equal(r.operacion.piloto_ensayo,false);assert.equal(r.operacion.estado,'pendiente_verificacion');await cancel(r.operacion);}
 finally{fs.writeFileSync(file,original);await ctx.db.query('UPDATE control_piloto_yape SET ensayo_sintetico=true');}
});
test('respuesta perdida/repetición conserva UUID y dos confirmaciones concurrentes solo registran una',async()=>{
 const b=body(),first=await service.create(b,accounts[0]),again=await service.create(b,accounts[0]);assert.equal(first.operacion.id,again.operacion.id);assert.equal(again.repetida,true);
 const results=await Promise.allSettled([1,2].map(()=>service.review(first.operacion.id,decision(first.operacion),accounts[1])));
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.status,409);
 const final=await service.detail(first.operacion.id,accounts[0]);assert.ok(final.recibido_en);assert.equal(final.monto_recibido,'1.00');assert.equal(final.historial.filter(x=>x.estado==='verificada_manual').length,1);assert.ok(!JSON.stringify(final).includes(p.qr_hash));
 assert.equal((await ctx.db.query('SELECT estado FROM recibos WHERE id_recibo=$1',[p.receipt_id])).rows[0].estado,'Pendiente');assert.equal((await ctx.db.query('SELECT 1 FROM pagos')).rowCount,0);
});
test('otro recibo, QR alterado, ventana cerrada y confirmación modificada quedan bloqueados',async()=>{
 await assert.rejects(service.create({...body(),id_recibo:9999},accounts[0]),{status:403});
 const original=fs.readFileSync(process.env.YAPE_QR_FILE);fs.writeFileSync(process.env.YAPE_QR_FILE,await QRCode.toBuffer('OTRO RECEPTOR SINTETICO'));await assert.rejects(service.qr(accounts[0]),{status:503});fs.writeFileSync(process.env.YAPE_QR_FILE,original);
 await ctx.db.query('UPDATE control_piloto_yape SET habilitado=false');await assert.rejects(service.qr(accounts[0]),{status:403});await assert.rejects(service.create(body(),accounts[0]),{status:403});
 const id=(await ctx.db.query("SELECT id FROM operaciones_pago WHERE estado='verificada_manual'")).rows[0].id;await assert.rejects(ctx.db.query("UPDATE operaciones_pago SET motivo='Reescrito posteriormente' WHERE id=$1",[id]));
});

test('upgrade 008 a 009 conserva operaciones/pagos previos y no habilita una base ajena',async()=>{
 const{nuevaBase}=require('./email-schema.cjs'),{pool:db}=await nuevaBase('pilot_upgrade');
 try{
  await db.query(sql('init.sql').split('-- Piloto local:')[0]);
  const u=(await db.query("INSERT INTO usuarios(correo,clave_hash,rol) VALUES('upgrade@example.invalid','fixture-no-login','usuario') RETURNING id_usuario")).rows[0].id_usuario;
  const s=(await db.query("INSERT INTO suministros(numero_suministro,id_usuario) VALUES('980000099',$1) RETURNING id_suministro",[u])).rows[0].id_suministro;
  const r=(await db.query("INSERT INTO recibos(id_suministro,periodo,fecha_emision,fecha_vencimiento,monto,consumo_m3,estado) VALUES($1,'Historia',CURRENT_DATE,CURRENT_DATE,1,0,'Pagado') RETURNING id_recibo",[s])).rows[0].id_recibo;
  await db.query("INSERT INTO pagos(id_recibo,monto,metodo,codigo_operacion) VALUES($1,1,'Histórico','LEGACY-TEST')",[r]);
  await db.query("INSERT INTO operaciones_pago(id,solicitud_id,id_usuario,id_recibo,monto,entorno,metodo,estado,payload_hash) VALUES($1,$2,$3,$4,1,'simulado','demostrativo','demostrativa',$5)",[crypto.randomUUID(),crypto.randomUUID(),u,r,'a'.repeat(64)]);
  const before=(await db.query('SELECT row_to_json(o) AS row FROM operaciones_pago o')).rows[0].row,paid=(await db.query('SELECT row_to_json(p) AS row FROM pagos p')).rows;
  await db.query(sql('migrations/009_yape_piloto_local.sql'));await db.query(sql('migrations/009_yape_piloto_local.sql'));
  const after=(await db.query('SELECT row_to_json(o) AS row FROM operaciones_pago o')).rows[0].row;
  for(const[key,value]of Object.entries(before))assert.deepEqual(after[key],value);
  for(const key of['piloto_id','piloto_ensayo','receptor_huella','recibido_en','monto_recibido','receptor_comprobado'])assert.equal(after[key],null);
  assert.deepEqual((await db.query('SELECT row_to_json(p) AS row FROM pagos p')).rows,paid);
  const admin=(await db.query("INSERT INTO usuarios(correo,clave_hash,rol) VALUES('upgrade-admin@example.invalid','fixture-no-login','admin') RETURNING id_usuario")).rows[0].id_usuario;
  await assert.rejects(db.query('INSERT INTO control_piloto_yape(piloto_id,ensayo_sintetico,id_recibo,id_usuario,id_admin,qr_hash,monto_maximo,inicio_en,vence_en) VALUES($1,true,$2,$3,$4,$5,1,NOW(),NOW()+INTERVAL \'1 hour\')',[crypto.randomUUID(),r,u,admin,'a'.repeat(64)]),{code:'23514'});
 }finally{await db.end();}
});
