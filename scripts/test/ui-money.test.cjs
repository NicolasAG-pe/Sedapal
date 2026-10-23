'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const window = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../Shared/ui.js'), 'utf8'), {
  window, Intl, Date, WeakMap
});
const money = window.HMShared.ui.money;

test('los importes conservan dos decimales y separan los miles', () => {
  assert.equal(money(0), 'S/ 0.00');
  assert.equal(money(45), 'S/ 45.00');
  assert.equal(money('45.5'), 'S/ 45.50');
  assert.equal(money(1234.5), 'S/ 1,234.50');
  assert.equal(money(1234567.891), 'S/ 1,234,567.89');
});

test('los importes inválidos no rompen la interfaz', () => {
  assert.equal(money(undefined), 'S/ 0.00');
  assert.equal(money(null), 'S/ 0.00');
  assert.equal(money('sin monto'), 'S/ 0.00');
});
