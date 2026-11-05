'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../Admin/assets/js/admin.js'), 'utf8');
const start = source.indexOf('function limaInputValor(');
const end = source.indexOf('function mostrarFormCorte(', start);
assert.ok(start >= 0 && end > start, 'Deben existir los conversores de fecha del panel.');
const dates = vm.runInNewContext(source.slice(start, end) + '\n({ limaInputValor, limaISODesdeInput })', { Date, Intl });

test('las fechas del panel conservan la hora de Lima y rechazan entradas inválidas', () => {
    assert.equal(dates.limaInputValor('2026-11-05T15:22:00Z'), '2026-11-05T10:22');
    assert.equal(dates.limaISODesdeInput('2026-11-05T10:22'), '2026-11-05T15:22:00.000Z');
    assert.equal(dates.limaISODesdeInput('2026-11-05T00:00'), '2026-11-05T05:00:00.000Z');
    assert.equal(dates.limaInputValor('fecha inválida'), '');
    assert.equal(dates.limaISODesdeInput('fecha inválida'), null);
    assert.equal(dates.limaISODesdeInput('2026-02-30T10:22'), null);
    assert.equal(dates.limaISODesdeInput('2026-11-05T24:00'), null);
});
