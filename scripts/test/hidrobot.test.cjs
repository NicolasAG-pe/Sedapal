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

function consumo(recibos) {
  const context = vm.createContext({
    recibos,
    hbHuboErrorCarga: () => false,
    supplyLabel: { textContent: '900000001' },
    createBotAction: label => label,
  });
  for (const name of ['reciboNoAnulado', 'ultimos6', 'promedio6', 'promedioGasto6', 'handleBotIntent']) {
    const start = html.indexOf('  function ' + name + '(');
    assert.ok(start >= 0, name);
    const lineEnd = html.indexOf('\n', start);
    const end = html.slice(start, lineEnd).trimEnd().endsWith('}')
      ? lineEnd
      : html.indexOf('\n  }', start) + 4;
    vm.runInContext(html.slice(start, end), context);
  }
  return {
    labels: Array.from(context.ultimos6(), r => r.etiqueta),
    average: context.promedio6(),
    averageAmount: context.promedioGasto6(),
    bot: context.handleBotIntent({ intent: 'consumption' }).text,
  };
}

test('gráficos y consumo de HidroBot excluyen anulados antes de elegir los seis recientes', () => {
  const older = Array.from({ length: 7 }, (_, i) => ({
    etiqueta: String(i), estado: i === 0 ? 'Emitido' : 'Pagado', consumoM3: 11 + i, monto: 25 + i,
  }));
  const result = consumo([{ etiqueta: 'Anulado', estado: 'Anulado', consumoM3: 96, monto: 99 }, ...older]);
  assert.deepEqual(result.labels, ['5', '4', '3', '2', '1', '0']);
  assert.equal(result.average, 13.5);
  assert.equal(result.averageAmount, 27.5);
  assert.match(result.bot, /último consumo registrado es de 11 m³/);
});

test('HidroBot y los gráficos tratan como vacío un suministro con solo recibos anulados', () => {
  const result = consumo([{ etiqueta: 'Anulado', estado: 'Anulado', consumoM3: 96, monto: 99 }]);
  assert.deepEqual(result.labels, []);
  assert.equal(result.average, 0);
  assert.equal(result.averageAmount, 0);
  assert.match(result.bot, /no hay información de consumo disponible/);
});
