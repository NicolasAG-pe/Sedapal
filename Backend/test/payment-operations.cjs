'use strict';
const{test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),{PNG}=require('pngjs');
const{iniciar}=require('./email-api.cjs'),{crearOperacionesPago,pngSeguro}=require('../payment-operations'),{crearProveedorSimulado}=require('../payment-provider'),{sql}=require('./email-schema.cjs');
let ctx,users=[],seq=1,provider,service,qrPath;
const headers=token=>({'Content-Type':'application/json','X-Forwarded-For':'198.51.100.'+(seq++%240+1),...(token?{Authorization:'Bearer '+token}:{})});
async function req(method,url,token,body){const r=await fetch(ctx.base+url,{method,headers:headers(token),...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json()};}
async function receipt(n=++seq){return(await ctx.db.query("INSERT INTO recibos(id_suministro,periodo,fecha_emision,fecha_vencimiento,monto,consumo_m3,estado) VALUES($1,$2,'2026-10-01','2026-11-01',123.45,12.3,'Pendiente') RETURNING id_recibo",[users[0].id_suministro,'P-'+n])).rows[0].id_recibo;}
const body=(id,more={})=>({id_recibo:id,metodo:'yape_manual',solicitud_id:crypto.randomUUID(),referencia:'SIM-'+crypto.randomUUID(),...more});
before(async()=>{
 process.env.PAYMENTS_MANUAL_ENABLED='1';ctx=await iniciar();
 qrPath=path.resolve('artifacts/pagos-pdf-120/qr-fixture.png');fs.mkdirSync(path.dirname(qrPath),{recursive:true});
 const png=new PNG({width:2,height:2});png.data.fill(255);fs.writeFileSync(qrPath,PNG.sync.write(png),{mode:0o600});process.env.YAPE_QR_FILE=qrPath;
 for(let n=0;n<3;n++){
  const a=ctx.registro(7000+n),pending=(await ctx.request('register',a,202)).data,u=(await ctx.request('verify-email',ctx.verificar(pending.registro_id,ctx.codigo(a.correo)),201)).data;
  if(n===2)await ctx.db.query("UPDATE usuarios SET rol='admin' WHERE id_usuario=$1",[u.usuario.id_usuario]);
  const token=(await ctx.request('login',{numero_suministro:a.numero_suministro,password:a.password},200)).data.token;
  const s=(await ctx.db.query('SELECT * FROM suministros WHERE id_usuario=$1',[u.usuario.id_usuario])).rows[0];users.push({...s,token});
 }
 provider=crearProveedorSimulado({secret:crypto.randomBytes(32).toString('hex')});service=crearOperacionesPago({pool:ctx.db,env:process.env,proveedor:provider});
});
after(async()=>{if(ctx)await ctx.close();delete process.env.YAPE_QR_FILE;delete process.env.PAYMENTS_MANUAL_ENABLED;});
test('008 aditiva y repetible conserva históricos y no atribuye acreditación bancaria',async()=>{
 const id=await receipt();await ctx.db.query("INSERT INTO pagos(id_recibo,monto,metodo,codigo_operacion) VALUES($1,123.45,'prototipo','HISTORICO')",[id]);
 const before=(await ctx.db.query('SELECT row_to_json(p) AS row FROM pagos p')).rows;await ctx.db.query(sql('migrations/008_operaciones_pago.sql'));await ctx.db.query(sql('migrations/008_operaciones_pago.sql'));
 assert.deepEqual((await ctx.db.query('SELECT row_to_json(p) AS row FROM pagos p')).rows,before);
 await assert.rejects(service.create(body(id),users[0]),{status:409});
});
test('demostración no inserta pagos ni marca recibo Pagado; UUID recupera una respuesta perdida',async()=>{
 const id=await receipt(),b=body(id,{metodo:'demostrativo'});const first=await req('POST','/api/me/operaciones-pago',users[0].token,b);assert.equal(first.status,201);assert.equal(first.data.operacion.estado,'demostrativa');assert.equal(first.data.operacion.acreditacion_financiera,false);
 const again=await req('POST','/api/me/operaciones-pago',users[0].token,b);assert.equal(again.status,200);assert.equal(again.data.operacion.id,first.data.operacion.id);
 assert.equal((await ctx.db.query('SELECT estado FROM recibos WHERE id_recibo=$1',[id])).rows[0].estado,'Pendiente');assert.equal((await ctx.db.query('SELECT * FROM pagos WHERE id_recibo=$1',[id])).rowCount,0);
 assert.equal((await req('POST','/api/me/operaciones-pago',users[0].token,{...b,metodo:'yape_manual'})).status,409);
});
test('propiedad, roles y desafíos no acceden a pagos privados ni comprobantes',async()=>{
 const id=await receipt(),r=await service.create(body(id,{comprobante:'data:image/png;base64,'+fs.readFileSync(qrPath).toString('base64')}),users[0]),op=r.operacion.id;
 for(const token of [null,'opaque-challenge'])assert.equal((await req('GET','/api/me/operaciones-pago/'+op,token)).status,401);
 assert.equal((await req('GET','/api/me/operaciones-pago/'+op,users[1].token)).status,404);
 assert.equal((await req('POST','/api/me/operaciones-pago',users[1].token,body(id))).status,404);
 assert.equal((await req('GET','/api/admin/operaciones-pago',users[0].token)).status,403);
 assert.equal((await req('POST','/api/admin/operaciones-pago/'+op+'/revisar',users[0].token,{accion:'confirmar',motivo:'Movimiento comprobado',movimiento_comprobado:true})).status,403);
 const own=await fetch(ctx.base+'/api/me/operaciones-pago/'+op+'/comprobante',{headers:headers(users[0].token)});assert.equal(own.status,200);assert.equal(own.headers.get('cache-control'),'no-store');assert.equal(own.headers.get('content-type'),'image/png');
 assert.equal((await fetch(ctx.base+'/api/me/operaciones-pago/'+op+'/comprobante',{headers:headers(users[1].token)})).status,404);
 const detail=await service.detail(op,users[2],true);assert.deepEqual(detail.historial.map(x=>x.estado),['declarada','pendiente_verificacion']);
});
test('revisión exige movimiento independiente y motivo; decisiones concurrentes son únicas y auditadas',async()=>{
 const id=await receipt(),{operacion:o}=await service.create(body(id),users[0]);
 const route='/api/admin/operaciones-pago/'+o.id+'/revisar';
 assert.equal((await req('POST',route,users[2].token,{accion:'confirmar',motivo:'Captura presentada'})).status,400);
 assert.equal((await req('POST',route,users[2].token,{accion:'confirmar',movimiento_comprobado:true,motivo:'ok'})).status,400);
 const results=await Promise.all(['confirmar','rechazar'].map(accion=>req('POST',route,users[2].token,{accion,motivo:'Movimiento sintético revisado',movimiento_comprobado:true})));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const final=await service.detail(o.id,users[0]);assert.ok(final.revisado_por);assert.ok(final.revisado_en);assert.equal(final.historial.length,3);
 assert.equal((await ctx.db.query('SELECT estado FROM recibos WHERE id_recibo=$1',[id])).rows[0].estado,'Pendiente');
 await assert.rejects(ctx.db.query("UPDATE operaciones_pago SET estado='declarada' WHERE id=$1",[o.id]));
 await assert.rejects(ctx.db.query("UPDATE operaciones_pago_historial SET motivo='Reescrito' WHERE operacion_id=$1",[o.id]));
});
test('idempotencia, doble declaración y referencias repetidas bajo concurrencia',async()=>{
 const id=await receipt(),b=body(id);const results=await Promise.all([service.create(b,users[0]),service.create(b,users[0])]);assert.equal(results[0].operacion.id,results[1].operacion.id);
 await assert.rejects(service.create(body(id),users[0]),{status:409});
 await assert.rejects(service.create(body(await receipt(),{referencia:b.referencia.toLowerCase()}),users[0]),{status:409});
 await service.cancel(results[0].operacion.id,users[0]);assert.equal((await service.get(results[0].operacion.id,users[0])).estado,'cancelada');
 await service.create(body(id),users[0]);
});
test('declaraciones impiden modificar monto o anular hasta resolverlas',async()=>{
 const id=await receipt();await service.create(body(id),users[0]);
 for(const url of ['/api/admin/recibos/'+id,'/api/admin/recibos/'+id+'/anular'])assert.equal((await req('PATCH',url,users[2].token,{periodo:'cambio',fecha_emision:'2026-10-01',fecha_vencimiento:'2026-11-01',monto:999,consumo_m3:1})).status,409);
});
test('configuración cerrada en producción, QR privado, imágenes y sin acreditación directa del cliente',async()=>{
 const id=await receipt(),closed=crearOperacionesPago({pool:ctx.db,env:{NODE_ENV:'production',PAYMENTS_MANUAL_ENABLED:'1',YAPE_QR_FILE:qrPath}});assert.equal(closed.config().yape_manual,false);assert.equal(closed.config().cobros_reales,false);
 await assert.rejects(closed.create(body(id),users[0]),{status:503});
 await assert.rejects(service.create(body(id,{comprobante:'data:image/svg+xml;base64,AAAA'}),users[0]),{status:400});
 assert.throws(()=>pngSeguro(Buffer.from('invalid')),/PNG/);
 const r=await service.create(body(id,{estado:'acreditada_proveedor',monto:0.01,revisado_por:users[2].id_usuario}),users[0]);assert.equal(r.operacion.estado,'pendiente_verificacion');assert.equal(r.operacion.monto,'123.45');
 assert.ok(!JSON.stringify(r).includes('comprobante_hash'));
});
test('simulador: firma, aprobación, duplicado, importe, timeout y conciliación tardía; nunca cancela deuda',async()=>{
 const id=await receipt(),{operacion:o}=await service.create(body(id,{metodo:'proveedor_simulado'}),users[0]);
 const deliver=async(eventId)=>{const e=provider.firmar({id:eventId,operacion_id:o.id});return service.event(e.raw,e.firma);};
 provider.resolver(o.proveedor_id,'timeout');assert.equal((await deliver('timeout')).estado,'pendiente_verificacion');
 provider.resolver(o.proveedor_id,'aprobada');const e=provider.firmar({id:'approved',operacion_id:o.id});
 await assert.rejects(service.event(e.raw,'0'.repeat(64)),{status:401});
 const both=await Promise.all([service.event(e.raw,e.firma),service.event(e.raw,e.firma)]);assert.ok(both.every(r=>r.estado==='acreditada_proveedor'));
 assert.equal((await service.detail(o.id,users[0])).historial.filter(x=>x.estado==='acreditada_proveedor').length,1);
 assert.equal((await ctx.db.query('SELECT estado FROM recibos WHERE id_recibo=$1',[id])).rows[0].estado,'Pendiente');
 provider.resolver(o.proveedor_id,'reembolsada');assert.equal((await deliver('refund')).estado,'reembolsada');
 for(const status of ['rechazada','cancelada']){const{operacion:p}=await service.create(body(await receipt(),{metodo:'proveedor_simulado'}),users[0]);provider.resolver(p.proveedor_id,status);const ev=provider.firmar({id:crypto.randomUUID(),operacion_id:p.id});assert.equal((await service.event(ev.raw,ev.firma)).estado,status);}
});
test('firma expirada y vinculación de evento a recibo/importe no admiten falsificación',async()=>{
 let now=Date.now();const p=crearProveedorSimulado({secret:'x'.repeat(32),now:()=>now});const event=p.firmar({id:'old'});now+=300001;assert.throws(()=>p.verificarEvento(event.raw,event.firma),/vencido/);
 const id=await receipt(),b=body(id,{metodo:'proveedor_simulado'}),{operacion:o}=await service.create(b,users[0]);
 const fake=crearProveedorSimulado({secret:'z'.repeat(32)});const wrong=crearOperacionesPago({pool:ctx.db,env:process.env,proveedor:{...fake,consultar:async()=>({importe:1,moneda:'PEN',idempotencia:o.id})}});
 const e=fake.firmar({id:'mismatch',operacion_id:o.id});await assert.rejects(wrong.event(e.raw,e.firma),{status:409});
});
