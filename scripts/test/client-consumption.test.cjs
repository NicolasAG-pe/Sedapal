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
