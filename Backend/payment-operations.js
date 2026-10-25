'use strict';
const crypto=require('node:crypto'),fs=require('node:fs');
const {PNG}=require('pngjs');
const{loadPilot,guardPilot,privateFile,fingerprint}=require('./yape-pilot');
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
 o.piloto_ensayo,o.recibido_en,o.monto_recibido,
 o.creado_en AS fecha_pago,o.actualizado_en,o.revisado_por,o.revisado_en,o.motivo,o.proveedor_id,
 (o.comprobante IS NOT NULL) AS tiene_comprobante,r.periodo,s.numero_suministro,
 false AS acreditacion_financiera`;
const duplicateColumn=admin=>admin?`EXISTS(SELECT 1 FROM operaciones_pago otra WHERE otra.referencia_hash=o.referencia_hash AND otra.id<>o.id) AS referencia_repetida`:'false AS referencia_repetida';
function crearOperacionesPago({pool,env=process.env,proveedor=null}){
 const enabled=()=>env.PAYMENTS_MANUAL_ENABLED==='1'&&env.NODE_ENV!=='production';
 function pilot(){try{const p=loadPilot(env);if(p&&fingerprint(pngSeguro(privateFile(env.YAPE_QR_FILE,1048576)))!==p.qr_hash)throw Error('QR discordante');return p;}catch(_){fail(503,'Piloto local no habilitado o configuración inválida.');}}
 async function guard(c,p,u,a=false,opts){try{return await guardPilot(c,p,u,a,opts);}catch(_){fail(403,'Piloto cerrado o no autorizado para esta cuenta/recibo.');}}
 function config(user){
  let p;try{p=pilot();}catch(_){return{entorno:'cerrado',cobros_reales:false,yape_manual:false,mensaje:'Piloto local bloqueado. Consulta al titular.'};}
  const allowed=!p||String(user?.id_usuario)===String(p.user_id);
  if(!allowed)return{entorno:'cerrado',cobros_reales:false,yape_manual:false,mensaje:'Piloto no habilitado para esta cuenta.'};
  return{recibo_piloto:p?.receipt_id||null,importe_piloto:p?.max_amount||null,entorno:p?'piloto_manual':'simulado',piloto_ensayo:p?.synthetic??null,cobros_reales:false,yape_manual:enabled()&&!!env.YAPE_QR_FILE&&allowed,
   mensaje:p?(p.synthetic?'Ensayo sintético del piloto. No envíes dinero real.':'Piloto voluntario: recibo sintético, no es una deuda de agua. Transferencia externa y comprobación manual; Hidro-Mejora no ejecuta cobros.'):'Pruebas de verificación manual. No transfieras dinero real. Una captura no acredita un pago.'};
 }
 async function overview(user){
  const result=config(user);
  if(result.recibo_piloto){
   const {rows}=await pool.query(`SELECT ${publicColumns},false AS referencia_repetida FROM operaciones_pago o JOIN recibos r USING(id_recibo) JOIN suministros s USING(id_suministro) WHERE o.id_recibo=$1 AND s.id_usuario=$2 AND s.id_suministro=$3 AND o.metodo='yape_manual' ORDER BY o.creado_en DESC LIMIT 1`,[result.recibo_piloto,user.id_usuario,user.id_suministro]);
   if(rows.length){result.operacion_existente=rows[0];result.yape_manual=false;result.mensaje='Ya existe una declaración. Consulta el estado e historial; no hagas otra transferencia.';}
  }
  return result;
 }
 async function page(user,query){
  const number=Math.max(1,Math.min(100000,Number.parseInt(query.page,10)||1)),size=10;
  const categories={pendientes:"o.estado='pendiente_verificacion'",confirmadas:"o.estado IN ('verificada_manual','acreditada_proveedor')",rechazadas:"o.estado='rechazada'",simulaciones:"(o.entorno='simulado' OR o.piloto_ensayo IS TRUE)",historial:'true'};
  const tab=Object.hasOwn(categories,query.tab)?query.tab:'pendientes';
  const q=String(query.q||'').trim().slice(0,100),method=['yape_manual','demostrativo','proveedor_simulado'].includes(query.metodo)?query.metodo:'';
  const from='FROM operaciones_pago o JOIN recibos r USING(id_recibo) JOIN suministros s USING(id_suministro)';
  const search="($1='' OR position(lower($1) in lower(concat_ws(' ',o.referencia,s.numero_suministro,r.periodo,o.id_recibo::text,o.id::text)))>0) AND ($2='' OR o.metodo=$2)";
  return tx(async c=>{
   // Una sola instantánea para contadores, total y página ante revisiones concurrentes.
   await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
   const counts=(await c.query(`SELECT ${Object.entries(categories).map(([k,v])=>`count(*) FILTER (WHERE ${v})::int AS ${k}`).join(',')} ${from} WHERE ${search}`,[q,method])).rows[0];
   const total=counts[tab],pages=Math.max(1,Math.ceil(total/size)),current=Math.min(number,pages);
   const {rows}=await c.query(`SELECT ${publicColumns},${duplicateColumn(true)} ${from} WHERE ${search} AND ${categories[tab]} ORDER BY o.creado_en DESC,o.id DESC LIMIT $3 OFFSET $4`,[q,method,size,(current-1)*size]);
   return{operaciones:rows,contadores:counts,total,pagina:current,paginas:pages};
  });
 }
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
  const p=method==='yape_manual'?pilot():null;
  if(method==='yape_manual'&&!config(user).yape_manual)fail(503,'QR de pruebas no configurado.');
  let reference=null,proof=null;
  if(method==='yape_manual'){
   reference=String(body.referencia||'').normalize('NFKC').trim().toUpperCase();
   if(!/^[A-Z0-9 -]{4,100}$/.test(reference)||reference.replace(/[ -]/g,'').length<4)fail(400,'Referencia: entre 4 y 100 letras, números, espacios o guiones.');
   if(body.comprobante!==undefined&&body.comprobante!==null&&body.comprobante!==''){
    if(typeof body.comprobante!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(body.comprobante)||body.comprobante.length>1400000)fail(400,'Adjunta un PNG de hasta 1 MB.');
    proof=pngSeguro(Buffer.from(body.comprobante.split(',')[1],'base64'));
   }
  }
  const payload=[id,method,reference,proof?digest(proof):null];if(p)payload.push(p.id);
  const payloadHash=digest(JSON.stringify(payload));
  const opid=crypto.randomUUID();
  return tx(async c=>{
   if(p){await guard(c,p,user,false,{receipt:id});if(!p.synthetic&&body.declaracion_voluntaria!==true)fail(400,'Confirma que declaras voluntariamente una transferencia externa para este piloto.');}
   const{rows:[s]}=await c.query('SELECT * FROM suministros WHERE id_suministro=$1 AND id_usuario=$2 FOR NO KEY UPDATE',[user.id_suministro,user.id_usuario]);
   if(!s)fail(404,'Recibo no encontrado.');
   const{rows:[r]}=await c.query('SELECT * FROM recibos WHERE id_recibo=$1 AND id_suministro=$2 FOR UPDATE',[id,s.id_suministro]);
   if(!r)fail(404,'Recibo no encontrado.');
   const{rows:[previous]}=await c.query('SELECT id,payload_hash FROM operaciones_pago WHERE id_usuario=$1 AND solicitud_id=$2',[user.id_usuario,key]);
   if(previous){if(previous.payload_hash!==payloadHash)fail(409,'La solicitud ya se utilizó con otros datos.');return{operacion:await get(c,previous.id,user),repetida:true};}
   if(p&&(await c.query("SELECT 1 FROM operaciones_pago WHERE piloto_id=$1 AND id_recibo=$2 AND metodo='yape_manual' LIMIT 1",[p.id,id])).rowCount)fail(409,'Ya existe una declaración para este piloto. Consulta el estado e historial; no hagas otra transferencia.');
   if(['Anulado','Pagado'].includes(r.estado)||(await c.query('SELECT 1 FROM pagos WHERE id_recibo=$1',[id])).rowCount)fail(409,'El recibo no admite otra operación.');
   if((await c.query('SELECT 1 FROM recibos WHERE id_suministro=$1 AND periodo=$2 AND id_recibo<>$3 LIMIT 1',[r.id_suministro,r.periodo,id])).rowCount)fail(409,'El histórico requiere conciliación antes de registrar otra operación.');
   if(Number(r.monto)<=0)fail(409,'Importe no válido para esta operación.');
   if(p&&Number(r.monto)>Number(p.max_amount))fail(409,'El importe supera el límite de este piloto.');
   const state=method==='demostrativo'?'demostrativa':'declarada';
   await c.query(`INSERT INTO operaciones_pago(id,solicitud_id,id_usuario,id_recibo,monto,metodo,estado,referencia,referencia_hash,payload_hash,comprobante,comprobante_hash,entorno,piloto_id,piloto_ensayo,receptor_huella)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,[opid,key,user.id_usuario,id,r.monto,method,state,reference,reference?digest((p?'piloto:'+p.qr_hash:'simulado')+':yape:'+reference.replace(/[ -]/g,'')):null,payloadHash,proof,proof?digest(proof):null,p?'piloto_manual':'simulado',p?.id||null,p?p.synthetic:null,p?.qr_hash||null]);
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
  return tx(async c=>{
   const r=await locked(c,id,user,true);
   if(r.metodo!=='yape_manual'||r.estado!=='pendiente_verificacion')fail(409,'La operación ya fue revisada o no admite revisión manual.');
   const synthetic=r.entorno==='simulado'||r.piloto_ensayo===true;
   if(state==='verificada_manual'&&(synthetic?body.ensayo_confirmado!==true:body.movimiento_comprobado!==true))fail(400,synthetic?'Confirma que revisas un ensayo sintético sin dinero.':'Comprueba el movimiento por separado. La captura no demuestra la recepción.');
   let received=null,verifiedAmount=null;
   if(r.entorno==='piloto_manual'){
    const p=pilot();if(!p)fail(503,'El piloto local está desactivado.');await guard(c,p,user,true,{receipt:r.id_recibo});
    const bound=(await c.query('SELECT piloto_id,piloto_ensayo,receptor_huella FROM operaciones_pago WHERE id=$1',[id])).rows[0];
    if(bound.piloto_id!==p.id||bound.piloto_ensayo!==p.synthetic||bound.receptor_huella!==p.qr_hash)fail(409,'El receptor configurado no coincide con la declaración original.');
    if(state==='verificada_manual'&&!synthetic){
     const amount=String(body.monto_recibido||'');const reference=String(body.referencia_comprobada||'').normalize('NFKC').trim().toUpperCase().replace(/[ -]/g,'');
     if(!/^\d+\.\d{2}$/.test(amount)||amount!==r.monto||reference!==r.referencia.replace(/[ -]/g,'')||body.receptor_comprobado!==true)fail(400,'Contrasta importe exacto, referencia y receptor en el movimiento recibido.');
     if(body.recibido_en!=null&&body.recibido_en!==''&&(typeof body.recibido_en!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/.test(body.recibido_en)||!Number.isFinite(Date.parse(body.recibido_en))||Date.parse(body.recibido_en)<Math.floor(Date.parse(p.starts_at)/60000)*60000||Date.parse(body.recibido_en)>Date.now()))fail(400,'La fecha comprobada debe pertenecer a la ventana del piloto y no estar en el futuro.');
     received=body.recibido_en||null;verifiedAmount=r.monto;
    }
   }
   if((await c.query('SELECT 1 FROM operaciones_pago WHERE id=$1 AND id_usuario=$2',[id,user.id_usuario])).rowCount)fail(403,'Otra persona administradora debe revisar su propia operación.');
   const{rows:[receipt]}=await c.query('SELECT monto,estado FROM recibos WHERE id_recibo=$1',[r.id_recibo]);
   if(receipt.monto!==r.monto||['Pagado','Anulado'].includes(receipt.estado))fail(409,'El recibo cambió. Se requiere conciliación.');
   await c.query('UPDATE operaciones_pago SET estado=$2,motivo=$3,revisado_por=$4,revisado_en=clock_timestamp(),actualizado_en=clock_timestamp(),recibido_en=$5,monto_recibido=$6,receptor_comprobado=$7 WHERE id=$1',[id,state,reason,user.id_usuario,received,verifiedAmount,verifiedAmount?true:null]);
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
 return{config,overview,page,create,list,get:(id,u,a=false)=>get(pool,id,u,a),review,cancel,event,
  async detail(id,user,admin=false){const r=await get(pool,id,user,admin);return{...r,historial:(await pool.query('SELECT estado,actor_id,motivo,fecha FROM operaciones_pago_historial WHERE operacion_id=$1 ORDER BY id',[id])).rows};},
  async proof(id,user,admin=false){await get(pool,id,user,admin);const{rows:[r]}=await pool.query('SELECT comprobante FROM operaciones_pago WHERE id=$1',[id]);if(!r.comprobante)fail(404,'Comprobante no disponible.');return r.comprobante;},
  async qr(user){if(!config(user).yape_manual)fail(503,'QR no disponible.');try{
   const p=pilot();if(p){await guard(pool,p,user);const active=await pool.query("SELECT 1 FROM operaciones_pago WHERE id_recibo=$1 AND entorno='piloto_manual' AND metodo='yape_manual' LIMIT 1",[p.receipt_id]);if(active.rowCount)fail(409,'Ya existe una declaración para este piloto. Consulta el historial; no hagas otra transferencia.');}
   const bytes=pngSeguro(privateFile(env.YAPE_QR_FILE,1048576));
   if(p&&fingerprint(bytes)!==p.qr_hash)fail(503,'El QR cambió. El titular debe revisar la configuración del piloto.');return bytes;
  }catch(e){if(e instanceof ErrorPago)throw e;fail(503,'QR privado no disponible.');}}

 };
}
function responderErrorPago(res,error){if(!(error instanceof ErrorPago))console.error('Fallo interno de operación de pago.');return res.set('Cache-Control','no-store').status(error instanceof ErrorPago?error.status:500).json({mensaje:error instanceof ErrorPago?error.message:'No se pudo procesar la operación.'});}
module.exports={crearOperacionesPago,responderErrorPago,pngSeguro};
