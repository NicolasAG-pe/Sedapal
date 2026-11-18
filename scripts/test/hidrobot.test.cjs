'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {createConversation} = require('../../Frontend/assets/js/hidrobot-conversation.js');

const html = fs.readFileSync('Frontend/index.html','utf8');
const fakeNow = Date.parse('2026-11-18T10:00:00Z');
const receipt = (id, label, iso, usage, amount, status='Emitido') => ({
  id_recibo:String(id), etiqueta:label, fechaEmisionISO:iso, consumoM3:usage, monto:amount, estado:status,
  fechaVencimientoISO:iso.slice(0,7)+'-28', vencimiento:'28/'+iso.slice(5,7)+'/'+iso.slice(0,4)
});
const latest = receipt(2,'Octubre 2026','2026-10-01',96,98.50,'Anulado');
const sep = receipt(1,'Septiembre 2026','2026-09-01',11,25);
const ago = receipt(3,'Agosto 2026','2026-08-01',13.75,17.42,'Pagado');
const data = {
  receipts:[latest,sep,ago], payments:[{monto:17.42,periodo:'Agosto 2026',codigo:'SIM-73'}],
  cuts:[{estado:'Programado',fecha:'18/11/2026 – 19/11/2026',fechaFinISO:'2026-11-19T01:05:00Z'}],
  incidents:[{id:7,code:'I-7',tipo:'Fuga de agua',estado:'En revisión'}]
};
const conversation = () => createConversation({clock:()=>fakeNow});
const empty = {receipts:[],payments:[],cuts:[],incidents:[]};

function extractFunction(name){
  const start = html.indexOf('  function '+name+'(');
  assert.ok(start>=0,name);
  const lineEnd = html.indexOf('\n',start);
  const end = html.slice(start,lineEnd).trimEnd().endsWith('}') ? lineEnd : html.indexOf('\n  }',start)+4;
  return html.slice(start,end);
}

function browserBot(){
  const context = vm.createContext({
    window:{}, navigator:{onLine:true},
    recibos:data.receipts, pagos:data.payments, incidencias:data.incidents, cortes:data.cuts,
    payEstado:'ok', incidenciasError:false, cortesError:false, hbConversation:conversation(),
    sesionCliente:{generation:()=>1, isUser:()=>true}, hbHuboErrorCarga:()=>false,
    createBotAction:(label,run)=>({label,run}),
    handleBotGuide:id=>({id})
  });
  vm.runInContext(fs.readFileSync('Frontend/assets/js/sedapal-knowledge.js','utf8'),context);
  for(const name of ['normalizeBotText','detectBotGuide','handleLocalBotMessage'])vm.runInContext(extractFunction(name),context);
  return message=>context.handleLocalBotMessage(message);
}

test('conserva las consultas generales en español y su fuente oficial',()=>{
  const answer = browserBot();
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
    assert.ok(result.text?.includes(fragment),question);
    assert.ok(result.source.startsWith('https://www.gob.pe/'),question);
  }
});

test('conserva accesos rápidos, reportes y pagos explícitos como orientación',()=>{
  const answer = browserBot();
  assert.match(answer('Ver último recibo').text,/S\/ 25\.00/);
  assert.match(answer('Recibos pendientes').text,/1 recibo por pagar/);
  assert.match(answer('Consultar consumo').text,/11 m³/);
  assert.match(answer('Cortes de servicio').text,/Programado/);
  for(const [question,id] of [
    ['Reportar incidencia','incident'],['Necesito ayuda','customer_service'],
    ['Quiero pagar mi recibo de Sedapal','payment'],['No tengo agua, ¿cómo contacto a Sedapal?','no_water'],
    ['Hay una fuga, necesito el teléfono','leak'],['¿Cuál es el presidente de Francia?','unknown']
  ]) assert.equal(answer(question).id,id,question);
});

test('reconoce sinónimos, expresiones peruanas y errores comunes en preguntas cortas y largas',()=>{
  const chat=conversation();
  for(const question of [
    'Consumo', 'cosnumo', '¿Cuánta agua usé?', '¿Cuántos cúbicos consumí?', '¿Cuánto consumí el último mes?',
    'Buenas, por favor ¿me podrías decir cuánto fue el consmo de agua que registraron en mi suministro últimamente?'
  ]) assert.match(chat.answer(question,data,1).text,/11 m³/,question);
  assert.match(chat.answer('¿Cuánto salió mi recivo?',data,1).text,/S\/ 25\.00/);
  assert.match(chat.answer('¿Cuánto consumí en setiembre 2026?',data,1).text,/11 m³/);
});

test('comprende fechas absolutas y relativas, compara periodos y usa el promedio real',()=>{
  const chat=conversation();
  assert.match(chat.answer('Compara mi consumo de setiembre con agosto',data,1).text,/11 m³.*13\.75 m³.*2\.75 m³/);
  assert.match(chat.answer('Promedio de consumo',data,1).text,/2 recibos vigentes es 12\.38 m³/);
  assert.match(chat.answer('¿Cuánto consumí el mes pasado?',data,1).text,/No encontré un recibo vigente/);
  assert.match(chat.answer('Consumo en 2026-08',data,1).text,/13\.75 m³/);
  assert.match(chat.answer('¿Cuánto consumí hace dos meses?',data,1).text,/11 m³/);
  assert.match(chat.answer('Compara consumo', {...data,receipts:[sep]},1).text,/Necesito dos recibos vigentes/);
  const earlier={...sep,id_recibo:'99',etiqueta:'Septiembre 2025',fechaEmisionISO:'2025-09-12'};
  assert.match(chat.answer('Consumo en septiembre',{...data,receipts:[sep,earlier]},1).text,/Dime el mes y el año/);
});

test('recuerda el recibo del turno anterior y revalida el importe y el detalle ante cambios',()=>{
  const chat=conversation();
  assert.match(chat.answer('¿Cuánto consumí el último mes?',data,1).text,/11 m³/);
  const refreshed={...data,receipts:[latest,{...sep,monto:25.15},ago]};
  assert.match(chat.answer('¿Y cuánto costó?',refreshed,1).text,/S\/ 25\.15/);
  assert.equal(chat.answer('Muéstramelo',refreshed,1).actions[0].id,'1');
  assert.match(chat.answer('¿Y cuándo vence?',refreshed,1).text,/28\/09\/2026/);
  assert.match(chat.answer('Muéstramelo',{...data,receipts:[{...sep,estado:'Anulado'},ago]},1).text,/ya no está vigente/);
});

test('limpia contexto al cambiar de sesión, reiniciar la conversación o vencer el plazo',()=>{
  let now=fakeNow;
  const chat=createConversation({clock:()=>now,ttl:20});
  chat.answer('consumo',data,1);
  assert.match(chat.answer('¿Y cuánto costó?',data,2).text,/Te refieres/);
  chat.answer('consumo',data,2);
  chat.reset();
  assert.match(chat.answer('Muéstramelo',data,2).text,/Te refieres/);
  chat.answer('consumo',data,2);
  now+=20;
  assert.match(chat.answer('¿Y cuánto costó?',data,2).text,/Te refieres/);
  assert.equal(chat.answer('Último recibo',data,null),null);
});

test('distingue pagados, pendientes, pagos y fechas de vencimiento',()=>{
  const chat=conversation();
  const second=receipt(4,'Julio 2026','2026-07-01',8,4.18,'Vencido');
  const snapshot={...data,receipts:[latest,sep,ago,second]};
  assert.match(chat.answer('¿Qué facturas debo?',snapshot,1).text,/2 recibos por pagar por S\/ 29\.18/);
  assert.match(chat.answer('¿Cuáles recibos ya pagué?',snapshot,1).text,/1 recibo pagado por S\/ 17\.42/);
  assert.match(chat.answer('¿Cuál fue mi último abono?',snapshot,1).text,/Pago más reciente: S\/ 17\.42/);
  assert.match(chat.answer('Código de operación',snapshot,1).text,/SIM-73/);
  assert.match(chat.answer('Vencimiento de mi recibo de setiembre',snapshot,1).text,/28\/09\/2026/);
  assert.match(chat.answer('¿Cuándo vence mi recibo?',snapshot,1).text,/28\/07\/2026/);
  assert.match(chat.answer('Próximo vencimiento',snapshot,1).text,/ya pasaron/);
  const future=receipt(5,'Noviembre 2026','2026-11-01',12,17);
  assert.match(chat.answer('Próximo vencimiento',{...snapshot,receipts:[future,...snapshot.receipts]},1).text,/28\/11\/2026/);
});

test('muestra únicamente cortes e incidencias del suministro y señala datos faltantes',()=>{
  const chat=conversation();
  assert.match(chat.answer('¿Cuándo termina el corte?',data,1).text,/El próximo fin previsto/);
  assert.match(chat.answer('¿Tengo algún corte?',empty,1).text,/No hay cortes activos/);
  assert.match(chat.answer('¿Cómo va mi incidencia I-7?',data,1).text,/I-7 · Fuga de agua · En revisión/);
  assert.match(chat.answer('Estado de incidencia I-8',data,1).text,/No encontré/);
  assert.match(chat.answer('Mis reportes',empty,1).text,/No hay incidencias/);
  assert.equal(chat.answer('Ver mi perfil',data,1).actions[0].section,'perfil');
  assert.match(chat.answer('Consumo',{...data,receipts:[{...sep,hayConsumo:false,consumoM3:0}]},1).text,/No hay consumo registrado/);
  assert.match(chat.answer('¿Cuánto cuesta mi recibo?',{...data,receipts:[{...sep,hayMonto:false,monto:0}]},1).text,/importe.*no está disponible/);
});

test('diferencia listas vacías de errores de carga y vuelve a responder tras reconectar',()=>{
  const chat=conversation();
  assert.match(chat.answer('Consultar consumo',empty,1).text,/no hay información de consumo/);
  assert.match(chat.answer('Consultar consumo',{...data,online:false},1).text,/No pude verificar/);
  assert.match(chat.answer('Mis recibos pendientes',{...empty,errors:{receipts:true}},1).text,/No pude verificar/);
  assert.match(chat.answer('Mis incidencias',{...empty,errors:{incidents:true}},1).text,/No pude verificar/);
  assert.match(chat.answer('Consultar consumo',data,1).text,/11 m³/);
});

test('pide aclaración en consultas ambiguas y renderiza entrada y salida como texto',()=>{
  const bot=conversation();
  assert.match(bot.answer('¿Qué recibo o corte?',data,1).text,/Te refieres/);
  assert.match(bot.answer('¿Cuánto?',data,1).text,/Te refieres/);
  const result=bot.answer('<img src=x onerror=alert(1)>',data,1);
  assert.match(result.text,/Te refieres/);
  assert.doesNotMatch(result.text,/<img/i);
  assert.match(extractFunction('addUserMessage'),/\.textContent = text/);
  assert.match(extractFunction('addBotMessage'),/\.textContent = data\.text/);
});

test('todos los scripts inline mantienen sintaxis válida y el motor se carga antes del runtime',()=>{
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(match[1]);
  assert.match(html,/src="assets\/js\/sedapal-knowledge.js"/);
  assert.ok(html.indexOf('src="assets/js/hidrobot-conversation.js"')<html.indexOf('window.HMHidroBot.createConversation()'));
});

function consumo(recibos) {
  const context = vm.createContext({recibos});
  for (const name of ['reciboNoAnulado','ultimos6','promedio6','promedioGasto6'])vm.runInContext(extractFunction(name),context);
  return {
    labels:Array.from(context.ultimos6(),r=>r.etiqueta),
    average:context.promedio6(), averageAmount:context.promedioGasto6(),
    bot:conversation().answer('consumo',{...empty,receipts:recibos},1).text
  };
}

test('gráficos y HidroBot excluyen anulados antes de elegir los seis recientes',()=>{
  const older=Array.from({length:7},(_,i)=>({
    ...sep,id_recibo:String(i),etiqueta:String(i),consumoM3:11+i,monto:25+i
  }));
  const result=consumo([latest,...older]);
  assert.deepEqual(result.labels,['5','4','3','2','1','0']);
  assert.equal(result.average,13.5);
  assert.equal(result.averageAmount,27.5);
  assert.match(result.bot,/último consumo registrado es de 11 m³/);
});

test('HidroBot y gráficos tratan como vacío un suministro con solo recibos anulados',()=>{
  const result=consumo([latest]);
  assert.deepEqual(result.labels,[]);
  assert.equal(result.average,0);
  assert.equal(result.averageAmount,0);
  assert.match(result.bot,/no hay información de consumo disponible/);
});
