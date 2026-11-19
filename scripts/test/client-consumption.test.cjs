'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const window = {HMShared: {ui: {}}};
vm.runInNewContext(fs.readFileSync('Frontend/assets/js/client-home.js', 'utf8'), {window});
const {averageConsumption, compareConsumption} = window.HMClientHome;
const history = [18, 18, 15, 20, 17, 17].map(consumoM3 => ({consumoM3}));

test('compara por debajo, igual y por encima de la media real', () => {
  const mean = averageConsumption(history);
  assert.equal(mean,17.5);
  assert.equal(compareConsumption(17, mean),'Por debajo del promedio');
  assert.equal(compareConsumption(17.5, mean),'Igual al promedio');
  assert.equal(compareConsumption(18, mean),'Sobre el promedio');
  assert.equal(compareConsumption(28, 30),'Por debajo del promedio');
});
test('distingue cero y ausencia, y compara antes de redondear', () => {
  assert.equal(averageConsumption([{consumoM3:null},{consumoM3:0}]),0);
  assert.equal(averageConsumption([]),null);
  assert.equal(compareConsumption(null,0),'Sin comparación disponible');
  assert.equal(compareConsumption(1.011,1.014),'Por debajo del promedio');
  assert.equal(compareConsumption(.1, (.1+.1+.1)/3),'Igual al promedio');
});

test('adaptarReciboAPI y gráficos priorizan el periodo sobre fecha_emision, manejan límites de año y no fabrican fechas', () => {
  const html = fs.readFileSync('Frontend/index.html', 'utf8');
  const extract = name => {
    const start = html.indexOf('  function ' + name + '(');
    assert.ok(start >= 0, name);
    const end = html.indexOf('\n  }', start) + 4;
    return html.slice(start, end);
  };
  const win = {};
  const ctx = vm.createContext({ window: win, Intl, Date, WeakMap });
  vm.runInContext(fs.readFileSync('Shared/ui.js', 'utf8'), ctx);
  vm.runInContext(extract('adaptarReciboAPI'), ctx);
  const { parseReceiptPeriod } = win.HMShared.ui;

  // Recibo de febrero 2026 emitido en enero 2026
  const feb = ctx.adaptarReciboAPI({
    id_recibo: 101, periodo: 'Febrero 2026', fecha_emision: '2026-01-31',
    fecha_vencimiento: '2026-02-18', monto: 48.5, consumo_m3: 16, estado: 'Pagado'
  });
  assert.equal(feb.mesNombre, 'Febrero');
  assert.equal(feb.mesShort, 'Feb');
  assert.equal(feb.anio, 2026);
  assert.equal(feb.mes, 1);
  assert.equal(feb.etiqueta, 'Febrero 2026');
  assert.equal(feb.emision, '31/01/2026');
  assert.equal(feb.vencimiento, '18/02/2026');

  // Recibo de enero 2027 emitido en diciembre 2026 (límite de año)
  const ene27 = ctx.adaptarReciboAPI({
    id_recibo: 102, periodo: 'Enero 2027', fecha_emision: '2026-12-29',
    fecha_vencimiento: '2027-01-19', monto: 52, consumo_m3: 18, estado: 'Emitido'
  });
  assert.equal(ene27.mesNombre, 'Enero');
  assert.equal(ene27.mesShort, 'Ene');
  assert.equal(ene27.anio, 2027);
  assert.equal(ene27.mes, 0);
  assert.equal(ene27.emision, '29/12/2026');
  assert.equal(ene27.vencimiento, '19/01/2027');

  // Recibo de diciembre 2026 emitido en enero 2027 (límite de año inverso)
  const dic26 = ctx.adaptarReciboAPI({
    id_recibo: 103, periodo: 'Diciembre 2026', fecha_emision: '2027-01-02',
    fecha_vencimiento: '2027-01-20', monto: 44, consumo_m3: 14, estado: 'Pagado'
  });
  assert.equal(dic26.mesShort, 'Dic');
  assert.equal(dic26.anio, 2026);

  // Sin periodo ni fecha_emision: no fabrica fecha ni año actual
  const sinDatos = ctx.adaptarReciboAPI({
    id_recibo: 104, periodo: '', fecha_emision: null,
    fecha_vencimiento: null, monto: 20, consumo_m3: 5, estado: 'Emitido'
  });
  assert.equal(sinDatos.anio, null);
  assert.equal(sinDatos.mes, null);
  assert.equal(sinDatos.mesNombre, '');
  assert.equal(sinDatos.mesShort, '');
  assert.equal(sinDatos.etiqueta, 'Sin periodo');
  assert.equal(sinDatos.emision, '—');

  // Periodo solo con mes en cruce de año: conserva mes y no inventa año 2026
  const soloMes = parseReceiptPeriod('Enero', '2026-12-29');
  assert.equal(soloMes.mesShort, 'Ene');
  assert.equal(soloMes.anio, null);
  assert.equal(soloMes.filePeriod, null);

  // Verificar etiquetas de renderChart() para un solo año vs cruce de año
  let renderedItems = [];
  const makeEl = () => ({ textContent: '', setAttribute() {}, innerHTML: '' });
  const chartCtx = vm.createContext({
    window: win,
    HMClientHome: window.HMClientHome,
    chartEl: makeEl(),
    recibos: [],
    recibosEstado: 'ok',
    document: { getElementById: () => makeEl() },
    ultimos6: () => chartCtx.recibos.filter(r => r.estado !== 'Anulado').slice(0, 6).reverse(),
    promedio6: () => window.HMClientHome.averageConsumption(chartCtx.ultimos6()),
    niceCeil: v => Math.max(10, Math.ceil(v / 10) * 10),
    renderConsumptionY() {},
    abrirDetalle() {},
    renderBarChart: (_el, items) => { renderedItems = items; }
  });
  vm.runInContext(extract('renderChart'), chartCtx);

  chartCtx.recibos = [
    ctx.adaptarReciboAPI({ id_recibo: 2, periodo: 'Marzo 2026', fecha_emision: '2026-02-28', monto: 40, consumo_m3: 15, estado: 'Pagado' }),
    feb,
  ];
  chartCtx.renderChart();
  assert.deepEqual(renderedItems.map(i => i.label), ['Feb', 'Mar']);

  chartCtx.recibos = [ene27, dic26, feb];
  chartCtx.renderChart();
  assert.deepEqual(renderedItems.map(i => i.label), ['Feb 26', 'Dic 26', 'Ene 27']);
});
