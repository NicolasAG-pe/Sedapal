'use strict';
const crypto=require('node:crypto');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
// Contrato de proveedor: iniciar(idempotencia, importe en céntimos, moneda), consultar(id), verificarEvento(raw, firma).
// Solo un simulador inyectable. Ningún adaptador comercial ni endpoint de aprobación pública.
function crearProveedorSimulado({secret,now=Date.now}={}) {
 if(!secret || Buffer.byteLength(secret)<32)throw Error('Clave de simulador insuficiente.');
 const operaciones=new Map();
 return {
  nombre:'simulado',
  async iniciar({idempotencia,importe,moneda}) {
   if(!Number.isSafeInteger(importe)||importe<=0||moneda!=='PEN')throw Error('Importe o moneda inválidos.');
   const previous=operaciones.get(idempotencia);
   if(previous){if(previous.importe!==importe||previous.moneda!==moneda)throw Error('Idempotencia incompatible.');return{...previous};}
   const r={id:'sim_'+crypto.randomUUID(),idempotencia,importe,moneda,estado:'pendiente'};operaciones.set(idempotencia,r);return{...r};
  },
  async consultar(id){const r=[...operaciones.values()].find(x=>x.id===id);if(!r)throw Error('Operación no encontrada.');return{...r};},
  // Exclusivo del laboratorio, sin ruta HTTP que lo exponga.
  resolver(id,estado){const r=[...operaciones.values()].find(x=>x.id===id);if(!r||!['aprobada','rechazada','cancelada','timeout','reembolsada'].includes(estado))throw Error('Estado inválido.');r.estado=estado;},
  firmar(payload){const raw=JSON.stringify({...payload,ts:now()});return{raw,firma:crypto.createHmac('sha256',secret).update(raw).digest('hex')};},
  verificarEvento(raw,firma){
   if(typeof raw!=='string'||Buffer.byteLength(raw)>4096||!/^\w{64}$/.test(firma||''))throw Error('Evento inválido.');
   const expected=crypto.createHmac('sha256',secret).update(raw).digest(),actual=Buffer.from(firma,'hex');
   if(actual.length!==expected.length||!crypto.timingSafeEqual(expected,actual))throw Error('Evento inválido.');
   const event=JSON.parse(raw);if(!Number.isFinite(event.ts)||Math.abs(now()-event.ts)>300000||!event.id||String(event.id).length>100)throw Error('Evento vencido o inválido.');
   return{...event,hash:hash(raw)};
  }
 };
}
module.exports={crearProveedorSimulado};
