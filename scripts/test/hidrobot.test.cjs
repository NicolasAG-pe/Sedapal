'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('Frontend/index.html','utf8');
function bot(){
  const context = vm.createContext({window:{}, cortesGeneral:[]});
  vm.runInContext(fs.readFileSync('Frontend/assets/js/sedapal-knowledge.js','utf8'),context);
  for(const name of ['normalizeBotText','bw','districtHit','detectBotIntent','handleLocalBotMessage']){
    const start = html.indexOf('  function '+name+'(');
    const end = html.indexOf('\n  }',start)+4;
    vm.runInContext(html.slice(start,end),context);
  }
  context.handleBotIntent = found=>({intent:found.intent});
  return message=>context.handleLocalBotMessage(message);
}
test('responde consultas generales en español con fuente oficial',()=>{
  const answer = bot();
  const examples = [
    ['¿Qué es SEDAPAL?', 'alcantarillado'],
    ['Hola, ¿a qué se dedica Sedapal?', 'Callao'],
    ['¿Cuál es el teléfono de Sedapal?', '317 8000'],
    ['¿Dónde atiende Sedapal?', 'Lima'],
    ['¿Dónde quedan las oficinas?', 'directorio'],
    ['¿Cuál es mi número de suministro?', 'recibo'],
    ['¿Cómo presentar un reclamo?', 'reclamo formal'],
    ['Requisitos para una nueva conexión', 'evaluación'],
    ['¿Cómo ahorrar agua?', 'duchas'],
    ['¿Qué es Aquanet?', 'virtual'],
    ['¿Cómo usar la oficina virtual?', 'Aquanet']
  ];
  for(const [question, fragment] of examples){
    const result = answer(question);
    assert.ok(result.text.includes(fragment),question);
    assert.ok(result.source.startsWith('https://www.gob.pe/'),question);
  }
});
test('conserva las seis opciones predeterminadas',()=>{
  const answer = bot();
  for(const [question,intent] of [
    ['Ver último recibo','last_receipt'],['Recibos pendientes','pending_receipts'],
    ['Consultar consumo','consumption'],['Reportar incidencia','incident'],
    ['Cortes de servicio','cuts'],['Necesito ayuda','customer_service']
  ]) assert.equal(answer(question).intent,intent,question);
});
test('no sustituye consultas personales ni emergencias con orientación general',()=>{
  const answer = bot();
  for(const [question,intent] of [
    ['Mi último recibo de Sedapal','last_receipt'],
    ['Quiero pagar mi recibo de Sedapal','payment'],
    ['No tengo agua, ¿cómo contacto a Sedapal?','no_water'],
    ['Hay una fuga, necesito el teléfono','leak'],
    ['¿Cuándo vuelve el agua en Sedapal?','cuts_end'],
    ['<script>alert(1)</script>','unknown'],
    ['¿Cuál es el presidente de Francia?','unknown']
  ]) assert.equal(answer(question).intent,intent,question);
});
test('todos los scripts inline mantienen sintaxis válida',()=>{
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
    new vm.Script(match[1]);
  }
  assert.ok(html.includes('src="assets/js/sedapal-knowledge.js"'));
});
