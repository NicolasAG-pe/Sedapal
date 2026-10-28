'use strict';
// Ejecutado solo en el contenedor aislado del harness; ninguna credencial real.
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
assert.equal(process.env.HIDRO_PRODUCTION_COMPAT_FIXTURE,'1');assert.match(process.env.POSTGRES_DB,/^hm_production_compat_[a-f0-9]{12}$/);assert.equal(process.env.DB_HOST,'127.0.0.1');
assert.equal(crypto.createHash('sha256').update(fs.readFileSync('/app/payment-operations.js')).digest('hex'),process.env.HIDRO_PAYMENT_SOURCE_SHA256);
const backend=require('/app/server'),db=backend.pool;const report={checks:[],realCharges:false,realPush:false,realEmail:false};const output='/evidence';
const ok=name=>report.checks.push(name);const quote=s=>'"'+s.replaceAll('"','""')+'"';
async function originalRows(){
 const expected=JSON.parse(fs.readFileSync(output+'/original-columns.private.json','utf8')),result={};
 for(const name of Object.keys(expected))result[name]=(await db.query('SELECT md5(to_jsonb(t)::text) h FROM (SELECT '+expected[name].map(quote).join(',')+' FROM public.'+quote(name)+') t ORDER BY h')).rows.map(r=>r.h);
 return result;
}
function subset(old,next){const frequency=new Map();for(const h of next)frequency.set(h,(frequency.get(h)||0)+1);for(const h of old){assert.ok(frequency.get(h)>0,'Fila previa alterada');frequency.set(h,frequency.get(h)-1);}}
(async()=>{
 const before=await originalRows();const fixtures=[];
 for(let i=0;i<3;i++){
  const password='SyntheticCompat123',salt=crypto.randomBytes(16).toString('hex'),hash='scrypt$'+salt+'$'+crypto.scryptSync(password,salt,64).toString('hex');
  const id=(await db.query('INSERT INTO usuarios(correo,clave_hash,rol,correo_verificado_en) VALUES($1,$2,$3,now()) RETURNING id_usuario',['compat-'+crypto.randomUUID()+'@example.invalid',hash,i===2?'admin':'usuario'])).rows[0].id_usuario;
  let supply;for(;;){supply=String(crypto.randomInt(980000000,999999999));if(!(await db.query('SELECT 1 FROM suministros WHERE numero_suministro=$1',[supply])).rowCount)break;}
  const s=(await db.query("INSERT INTO suministros(numero_suministro,id_usuario,distrito,zona) VALUES($1,$2,'Compatibilidad','Solo sintético') RETURNING id_suministro",[supply,id])).rows[0];fixtures.push({id_usuario:id,id_suministro:s.id_suministro,supply,password});
 }
 async function receipt(label,state='Pendiente'){return(await db.query("INSERT INTO recibos(id_suministro,periodo,fecha_emision,fecha_vencimiento,monto,consumo_m3,estado) VALUES($1,$2,CURRENT_DATE,CURRENT_DATE+10,45.80,3,$3) RETURNING id_recibo",[fixtures[0].id_suministro,label,state])).rows[0].id_recibo;}
 const period='Compat UI '+crypto.randomBytes(3).toString('hex');const browserReceipt=await receipt(period),id=await receipt('Compat API '+crypto.randomBytes(3).toString('hex')),historical=await receipt('Hist '+crypto.randomBytes(3).toString('hex'),'Pagado');
 await db.query("INSERT INTO pagos(id_recibo,monto,metodo,codigo_operacion) VALUES($1,45.80,'Prototipo','COMPAT-HISTORICO')",[historical]);
 const paymentsBefore=(await db.query('SELECT count(*)::int n FROM pagos')).rows[0].n;
 const socket=output+'/api.sock';await new Promise((res,rej)=>{backend.httpServer.once('error',rej);backend.httpServer.listen(socket,res);});fs.chmodSync(socket,0o600);
 // El mismo servidor se consulta por loopback dentro del namespace sin red externa.
 const http=require('node:http');async function api(route,{token,body,method}={}){
  return new Promise((resolve,reject)=>{const req=http.request({socketPath:socket,path:route,method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json','X-Forwarded-For':'192.0.2.71',...(token?{Authorization:'Bearer '+token}:{})}},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(text)}));});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});
 }
 const tokens=[];for(const f of fixtures){const r=await api('/api/auth/login',{body:{numero_suministro:f.supply,password:f.password}});assert.equal(r.status,200);tokens.push(r.data.token);}
 ok('Login REST de dos clientes y Admin sobre ruta productiva exacta');
 const config=(await api('/api/pagos/config',{token:tokens[0]})).data;assert.equal(config.cobros_reales,false);assert.equal(config.yape_manual,false);
 const body={id_recibo:id,metodo:'demostrativo',solicitud_id:crypto.randomUUID(),monto:0.01,estado:'acreditada_proveedor'};
 const first=await api('/api/me/operaciones-pago',{token:tokens[0],body});assert.equal(first.status,201);assert.equal(first.data.operacion.estado,'demostrativa');assert.equal(first.data.operacion.monto,'45.80');assert.equal(first.data.operacion.acreditacion_financiera,false);const op=first.data.operacion.id;
 for(const field of ['piloto_ensayo','recibido_en','monto_recibido'])assert.equal(first.data.operacion[field],null);
 const repeat=await Promise.all([api('/api/me/operaciones-pago',{token:tokens[0],body}),api('/api/me/operaciones-pago',{token:tokens[0],body})]);assert.ok(repeat.every(r=>r.status===200&&r.data.operacion.id===op));
 ok('Demostración e idempotencia concurrente sin pagos ni importes impuestos por cliente');
 for(const [route,token,status]of [['/api/me/operaciones-pago/'+op,tokens[0],200],['/api/me/operaciones-pago/'+op,tokens[1],404],['/api/me/operaciones-pago/'+op,null,401],['/api/admin/operaciones-pago',tokens[0],403],['/api/admin/operaciones-pago/'+op,tokens[2],200]])assert.equal((await api(route,{token})).status,status);
 assert.equal((await api('/api/me/operaciones-pago/'+op,{token:tokens[0]})).data.historial.length,1);
 for(const tab of ['pendientes','confirmadas','rechazadas','simulaciones','historial']){const r=await api('/api/admin/operaciones-pago?page=1&tab='+tab,{token:tokens[2]});assert.equal(r.status,200);assert.ok(Number.isInteger(r.data.total));}
 assert.equal((await api('/api/admin/operaciones-pago?page=99&tab=historial&q='+encodeURIComponent(fixtures[0].supply)+'&metodo=demostrativo',{token:tokens[2]})).data.total,1);
 ok('Historial propietario/Admin, paginación/filtros y aislamiento401/403/404');
 for(const metodo of ['yape_manual','proveedor_simulado'])assert.equal((await api('/api/me/operaciones-pago',{token:tokens[0],body:{...body,metodo,solicitud_id:crypto.randomUUID()}})).status,503);
 assert.equal((await api('/api/pagos/yape/qr',{token:tokens[0]})).status,503);assert.equal((await api('/api/admin/operaciones-pago/'+op+'/revisar',{token:tokens[2],body:{accion:'confirmar',motivo:'No hay recepción de fondos',ensayo_confirmado:true}})).status,503);
 ok('Yape, proveedor, QR y revisión manual cerrados en producción');
 assert.equal((await db.query('SELECT count(*)::int n FROM pagos')).rows[0].n,paymentsBefore);assert.equal((await db.query('SELECT estado FROM recibos WHERE id_recibo=$1',[id])).rows[0].estado,'Pendiente');
 assert.equal((await db.query("SELECT to_regclass('public.control_piloto_yape') t")).rows[0].t,null);
 const after=await originalRows();for(const table of Object.keys(before))subset(before[table],after[table]);ok('Todas las filas previas conservadas; recibos/históricos sin acreditación ni control piloto');
 fs.writeFileSync(output+'/fixtures.private.json',JSON.stringify({accounts:fixtures,period,browserReceipt}),{mode:0o600});report.result='passed';fs.writeFileSync(output+'/api-result.json',JSON.stringify(report,null,2),{mode:0o600});fs.writeFileSync(output+'/ready.json',JSON.stringify({ready:true}),{mode:0o600});
 async function stop(){await new Promise(r=>backend.io.close(r));await db.end();}process.once('SIGTERM',()=>stop());process.once('SIGINT',()=>stop());
 console.log('Compatibilidad productiva REST aprobada; socket privado listo para UI.');
})().catch(error=>{fs.writeFileSync(output+'/failure.private.txt',String(error.stack||error),{mode:0o600});fs.writeFileSync(output+'/api-result.json',JSON.stringify({...report,result:'failed'}),{mode:0o600});console.error('Prueba privada falló; no se muestran datos ni credenciales.');process.exitCode=1;backend.io.close(()=>db.end());});
