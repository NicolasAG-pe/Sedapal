'use strict';
const crypto=require('node:crypto'),fs=require('node:fs');
const {PNG}=require('pngjs');
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
class ErrorPago extends Error {constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new ErrorPago(status,message);};
function pngSeguro(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<24||bytes.length>1048576||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')fail(400,'Adjunta una imagen PNG de hasta 1 MB.');
 const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);
 if(!w||!h||w>2048||h>2048||w*h>4000000)fail(400,'La imagen supera las dimensiones permitidas (2048 píxeles).');
 try{const decoded=PNG.sync.read(bytes,{checkCRC:true}),clean=PNG.sync.write(decoded);if(clean.length>1048576)fail(400,'La imagen supera 1 MB.');return clean;}catch(error){if(error instanceof ErrorPago)throw error;fail(400,'No se pudo leer el PNG.');}
}
const publicColumns=`o.id,o.id AS codigo_operacion,o.id_recibo,o.monto,o.moneda,o.entorno,o.metodo,o.estado,o.referencia,
 o.creado_en AS fecha_pago,o.actualizado_en,o.revisado_por,o.revisado_en,o.motivo,o.proveedor_id,
 (o.comprobante IS NOT NULL) AS tiene_comprobante,r.periodo,s.numero_suministro,
 false AS acreditacion_financiera`;
const duplicateColumn=admin=>admin?`EXISTS(SELECT 1 FROM operaciones_pago otra WHERE otra.referencia_hash=o.referencia_hash AND otra.id<>o.id) AS referencia_repetida`:'false AS referencia_repetida';
function crearOperacionesPago({pool,env=process.env,proveedor=null}){
 const enabled=()=>env.PAYMENTS_MANUAL_ENABLED==='1'&&env.NODE_ENV!=='production';
 const config=()=>({entorno:'simulado',cobros_reales:false,yape_manual:enabled()&&!!env.YAPE_QR_FILE,
  mensaje:'Pruebas de verificación manual. No transfieras dinero real. Una captura no acredita un pago.'});
 async function tx(fn){const c=await pool.connect();try{await c.query("BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='5s'");const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK').catch(()=>{});if(e.code==='23505')fail(409,'Ya existe una operación o referencia. Consulta el historial antes de reintentar.');if(['55P03','40P01','40001'].includes(e.code))fail(409,'Otra operación está en curso. Actualiza e intenta nuevamente.');throw e;}finally{c.release();}}
 async function audit(c,id,estado,actor,motivo){await c.query('INSERT INTO operaciones_pago_historial(operacion_id,estado,actor_id,motivo) VALUES($1,$2,$3,$4)',[id,estado,actor,motivo]);}
 async function get(c,id,user,admin=false){
  if(!uuid(id))fail(404,'Operación no encontrada.');
  const{rows:[r]}=await c.query(`SELECT ${publicColumns},${duplicateColumn(admin)} FROM operaciones_pago o JOIN recibos r USING(id_recibo)
   JOIN suministros s USING(id_suministro) WHERE o.id=$1 AND ($2::boolean OR (s.id_usuario=$3 AND s.id_suministro=$4))`,[id,admin,user.id_usuario,user.id_suministro||null]);
  if(!r)fail(404,'Operación no encontrada.');return r;
 }
 async function locked(c,id,user,admin=false){
  const r=await get(c,id,user,admin);
  // Mismo orden que el servicio de recibos: suministro -> recibo -> operación.
  await c.query('SELECT 1 FROM suministros WHERE numero_suministro=$1 FOR NO KEY UPDATE',[r.numero_suministro]);
  await c.query('SELECT 1 FROM recibos WHERE id_recibo=$1 FOR UPDATE',[r.id_recibo]);
  await c.query('SELECT 1 FROM operaciones_pago WHERE id=$1 FOR UPDATE',[id]);return get(c,id,user,admin);
 }
 async function create(body,user,legacy=false){
  const id=Number(body.id_recibo),method=legacy?'demostrativo':body.metodo,key=body.solicitud_id;
  if(!Number.isSafeInteger(id)||id<=0||!uuid(key))fail(400,'Recibo y solicitud UUID obligatorios.');
  if(!['demostrativo','yape_manual','proveedor_simulado'].includes(method))fail(400,'Método no disponible.');
  if(method!=='demostrativo'&&!enabled())fail(503,'Las pruebas de pagos están deshabilitadas.');
  if(method==='proveedor_simulado'&&!proveedor)fail(503,'Proveedor de pruebas no configurado.');
  if(method==='yape_manual'&&!config().yape_manual)fail(503,'QR de pruebas no configurado.');
  let reference=null,proof=null;
  if(method==='yape_manual'){
   reference=String(body.referencia||'').normalize('NFKC').trim().toUpperCase();
   if(!/^[A-Z0-9 -]{4,100}$/.test(reference)||reference.replace(/[ -]/g,'').length<4)fail(400,'Referencia: entre 4 y 100 letras, números, espacios o guiones.');
   if(body.comprobante!==undefined&&body.comprobante!==null&&body.comprobante!==''){
    if(typeof body.comprobante!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(body.comprobante)||body.comprobante.length>1400000)fail(400,'Adjunta un PNG de hasta 1 MB.');
    proof=pngSeguro(Buffer.from(body.comprobante.split(',')[1],'base64'));
   }
  }
  const payloadHash=digest(JSON.stringify([id,method,reference,proof?digest(proof):null]));
  const opid=crypto.randomUUID();
  return tx(async c=>{
   const{rows:[s]}=await c.query('SELECT * FROM suministros WHERE id_suministro=$1 AND id_usuario=$2 FOR NO KEY UPDATE',[user.id_suministro,user.id_usuario]);
   if(!s)fail(404,'Recibo no encontrado.');
   const{rows:[r]}=await c.query('SELECT * FROM recibos WHERE id_recibo=$1 AND id_suministro=$2 FOR UPDATE',[id,s.id_suministro]);
   if(!r)fail(404,'Recibo no encontrado.');
   const{rows:[previous]}=await c.query('SELECT id,payload_hash FROM operaciones_pago WHERE id_usuario=$1 AND solicitud_id=$2',[user.id_usuario,key]);
   if(previous){if(previous.payload_hash!==payloadHash)fail(409,'La solicitud ya se utilizó con otros datos.');return{operacion:await get(c,previous.id,user),repetida:true};}
   if(['Anulado','Pagado'].includes(r.estado)||(await c.query('SELECT 1 FROM pagos WHERE id_recibo=$1',[id])).rowCount)fail(409,'El recibo no admite otra operación.');
   if((await c.query('SELECT 1 FROM recibos WHERE id_suministro=$1 AND periodo=$2 AND id_recibo<>$3 LIMIT 1',[r.id_suministro,r.periodo,id])).rowCount)fail(409,'El histórico requiere conciliación antes de registrar otra operación.');
   if(Number(r.monto)<=0)fail(409,'Importe no válido para esta operación.');
   const state=method==='demostrativo'?'demostrativa':'declarada';
   await c.query(`INSERT INTO operaciones_pago(id,solicitud_id,id_usuario,id_recibo,monto,entorno,metodo,estado,referencia,referencia_hash,payload_hash,comprobante,comprobante_hash)
    VALUES($1,$2,$3,$4,$5,'simulado',$6,$7,$8,$9,$10,$11,$12)`,[opid,key,user.id_usuario,id,r.monto,method,state,reference,reference?digest('simulado:yape:'+reference.replace(/[ -]/g,'')):null,payloadHash,proof,proof?digest(proof):null]);
   await audit(c,opid,state,user.id_usuario,method==='demostrativo'?'Operación demostrativa sin acreditación financiera':'Transferencia declarada; recepción sin comprobar');
   if(state==='declarada'){
    await c.query("UPDATE operaciones_pago SET estado='pendiente_verificacion',actualizado_en=clock_timestamp() WHERE id=$1",[opid]);
    await audit(c,opid,'pendiente_verificacion',user.id_usuario,'Pendiente de verificación independiente');
   }
   // Los proveedores deben usar esta UUID como idempotencia. El simulador no hace I/O externo.
   if(method==='proveedor_simulado'){
    const p=await proveedor.iniciar({idempotencia:opid,importe:Math.round(Number(r.monto)*100),moneda:'PEN'});
    await c.query('UPDATE operaciones_pago SET proveedor_id=$2 WHERE id=$1',[opid,p.id]);
   }
   return{operacion:await get(c,opid,user),repetida:false};
  });
 }
 async function list(user,admin=false){
  const{rows}=await pool.query(`SELECT ${publicColumns},${duplicateColumn(admin)} FROM operaciones_pago o JOIN recibos r USING(id_recibo) JOIN suministros s USING(id_suministro)
   WHERE ($1::boolean OR (s.id_usuario=$2 AND s.id_suministro=$3)) ORDER BY CASE WHEN $1 AND o.estado='pendiente_verificacion' THEN 0 ELSE 1 END,o.creado_en DESC,o.id DESC LIMIT 200`,[admin,user.id_usuario,user.id_suministro||null]);return rows;
 }
 async function review(id,body,user){
  if(!enabled())fail(503,'Revisión de pruebas deshabilitada.');
  const state=body.accion==='confirmar'?'verificada_manual':body.accion==='rechazar'?'rechazada':null;
  const reason=typeof body.motivo==='string'?body.motivo.trim():'';
  if(!state||reason.length<8||reason.length>500)fail(400,'Indica una decisión y un motivo de 8 a 500 caracteres.');
  if(state==='verificada_manual'&&body.movimiento_comprobado!==true)fail(400,'Comprueba el movimiento por separado. La captura no demuestra la recepción.');
  return tx(async c=>{
   const r=await locked(c,id,user,true);
   if(r.metodo!=='yape_manual'||r.estado!=='pendiente_verificacion')fail(409,'La operación ya fue revisada o no admite revisión manual.');
   if((await c.query('SELECT 1 FROM operaciones_pago WHERE id=$1 AND id_usuario=$2',[id,user.id_usuario])).rowCount)fail(403,'Otra persona administradora debe revisar su propia operación.');
   const{rows:[receipt]}=await c.query('SELECT monto,estado FROM recibos WHERE id_recibo=$1',[r.id_recibo]);
   if(receipt.monto!==r.monto||['Pagado','Anulado'].includes(receipt.estado))fail(409,'El recibo cambió. Se requiere conciliación.');
   await c.query('UPDATE operaciones_pago SET estado=$2,motivo=$3,revisado_por=$4,revisado_en=clock_timestamp(),actualizado_en=clock_timestamp() WHERE id=$1',[id,state,reason,user.id_usuario]);
   await audit(c,id,state,user.id_usuario,reason);return get(c,id,user,true);
  });
 }
 async function cancel(id,user){return tx(async c=>{
  const r=await locked(c,id,user);if(r.estado!=='pendiente_verificacion')fail(409,'La operación no se puede cancelar.');
  if(r.metodo==='proveedor_simulado')fail(409,'La cancelación del proveedor requiere conciliación.');
  await c.query("UPDATE operaciones_pago SET estado='cancelada',actualizado_en=clock_timestamp() WHERE id=$1",[id]);await audit(c,id,'cancelada',user.id_usuario,'Cancelada por la persona solicitante');return get(c,id,user);
 });}
 async function event(raw,signature){
  if(!proveedor||!enabled())fail(503,'Proveedor deshabilitado.');
  let e;try{e=proveedor.verificarEvento(raw,signature);}catch(_){fail(401,'Evento no válido.');}
  return tx(async c=>{
   const r=await locked(c,e.operacion_id,{},true);
   const seen=(await c.query('SELECT payload_hash FROM eventos_pago_proveedor WHERE evento_id=$1',[String(e.id)])).rows[0];
   if(seen){if(seen.payload_hash!==e.hash)fail(409,'Identificador de evento incompatible.');return r;}
   if(r.metodo!=='proveedor_simulado')fail(409,'Proveedor incompatible.');
   // Webhook es señal, nunca prueba suficiente: consultar proveedor y comprobar importe/moneda/id.
   const p=await proveedor.consultar(r.proveedor_id);
   if(p.importe!==Math.round(Number(r.monto)*100)||p.moneda!==r.moneda||p.idempotencia!==r.id)fail(409,'Importe o identidad no coinciden.');
   const state={aprobada:'acreditada_proveedor',rechazada:'rechazada',cancelada:'cancelada',reembolsada:'reembolsada'}[p.estado];
   if(!state)return r; // timeout conserva pendiente, permite conciliación tardía con evento nuevo.
   if(r.estado!==state){
    if(!(r.estado==='pendiente_verificacion'||(r.estado==='acreditada_proveedor'&&state==='reembolsada')))fail(409,'Se requiere conciliación; no se cambia una operación finalizada.');
    await c.query('UPDATE operaciones_pago SET estado=$2,actualizado_en=clock_timestamp() WHERE id=$1',[r.id,state]);
    await audit(c,r.id,state,null,'Estado consultado al proveedor simulado; sin movimiento financiero');
   }
   await c.query('INSERT INTO eventos_pago_proveedor(evento_id,operacion_id,payload_hash) VALUES($1,$2,$3)',[String(e.id),r.id,e.hash]);return get(c,r.id,{},true);
  });
 }
 return{config,create,list,get:(id,u,a=false)=>get(pool,id,u,a),review,cancel,event,
  async detail(id,user,admin=false){const r=await get(pool,id,user,admin);return{...r,historial:(await pool.query('SELECT estado,actor_id,motivo,fecha FROM operaciones_pago_historial WHERE operacion_id=$1 ORDER BY id',[id])).rows};},
  async proof(id,user,admin=false){await get(pool,id,user,admin);const{rows:[r]}=await pool.query('SELECT comprobante FROM operaciones_pago WHERE id=$1',[id]);if(!r.comprobante)fail(404,'Comprobante no disponible.');return r.comprobante;},
  qr(){if(!config().yape_manual)fail(503,'QR no disponible.');try{const fd=fs.openSync(env.YAPE_QR_FILE,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const st=fs.fstatSync(fd);if(!st.isFile()||st.size>1048576||(st.mode&0o077))fail(503,'QR privado no configurado correctamente.');return pngSeguro(fs.readFileSync(fd));}finally{fs.closeSync(fd);}}catch(e){if(e instanceof ErrorPago)throw e;fail(503,'QR no disponible.');}}
 };
}
function responderErrorPago(res,error){if(!(error instanceof ErrorPago))console.error('Fallo interno de operación de pago.');return res.status(error instanceof ErrorPago?error.status:500).json({mensaje:error instanceof ErrorPago?error.message:'No se pudo procesar la operación.'});}
module.exports={crearOperacionesPago,responderErrorPago,pngSeguro};
