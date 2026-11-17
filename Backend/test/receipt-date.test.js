'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {prepareValue}=require('pg/lib/utils');
const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
const validation=source.slice(source.indexOf('function validarReciboAdmin('),source.indexOf('function filaReciboAdmin('));
const validate=vm.runInNewContext(validation+'\nvalidarReciboAdmin;');
test('las fechas SQL de recibos conservan el día al serializar en UTC y America/Lima',()=>{
 const previous=process.env.TZ;
 try{
  for(const zone of ['UTC','America/Lima']){
   process.env.TZ=zone;
   const result=validate({numero_suministro:'900000002',periodo:'Octubre 2026',fecha_emision:'2026-10-01',fecha_vencimiento:'2026-11-01',monto:45,consumo_m3:15});
   assert.equal(result.error,undefined);assert.equal(prepareValue(result.emision),'2026-10-01');assert.equal(prepareValue(result.vencimiento),'2026-11-01');
  }
 }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
test('el validador conserva las restricciones existentes de fecha y orden',()=>{
 const base={numero_suministro:'900000002',periodo:'Fecha fixture',fecha_emision:'2026-10-01',fecha_vencimiento:'2026-11-01',monto:45,consumo_m3:15};
 assert.ok(validate({...base,fecha_emision:'incorrecta'}).error);
 assert.ok(validate({...base,fecha_vencimiento:'2026-09-01'}).error);
});
test('el validador rechaza años mal escritos y vencimientos de más de un año',()=>{
 const base={numero_suministro:'900000002',periodo:'Fecha fixture',fecha_emision:'2026-10-01',fecha_vencimiento:'2026-11-01',monto:45,consumo_m3:15};
 assert.match(validate({...base,fecha_emision:'0206-10-28'}).error,/2000 y 2100/);
 assert.match(validate({...base,fecha_vencimiento:'20266-11-01'}).error,/2000 y 2100/);
 assert.match(validate({...base,fecha_vencimiento:'2028-11-01'}).error,/un año/);
 assert.equal(validate({...base,fecha_vencimiento:'2027-10-01'}).error,undefined);
});
test('los avisos de corte rechazan años fuera de rango y conservan el orden inicio/fin',()=>{
 const helper=source.slice(source.indexOf('// Compartida con validarCorteAdmin.'),source.indexOf('function filaReciboAdmin('));
 const corte=vm.runInNewContext(source.slice(source.indexOf('function validarCorteAdmin('),source.indexOf('function filaCorteAdmin('))+helper+'\nvalidarCorteAdmin;');
 const base={alcance:'Zona',distrito:'Laboratorio',zona:'Zona sintética',motivo:'Mantenimiento',fecha_inicio:'2026-11-20T14:00:00.000Z',fecha_fin:'2026-11-20T20:00:00.000Z'};
 assert.equal(corte(base).error,undefined);
 assert.match(corte({...base,fecha_inicio:'0206-11-20T14:00:00.000Z'}).error,/2000 y 2100/);
 assert.match(corte({...base,fecha_fin:'2026-11-20T10:00:00.000Z'}).error,/posterior/);
});
