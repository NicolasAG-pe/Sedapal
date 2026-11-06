'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateGroups, inventory, groups } = require('../test-catalog.cjs');
const discovered = ['test/a.cjs', 'test/b.cjs', 'test/manual.cjs'];
test('CAT-T01: admite selección parcial y conserva orden sin mutar', () => {
    const catalog = { unit: ['test/b.cjs', 'test/a.cjs'] };
    const before = JSON.stringify(catalog);
    validateGroups(catalog, discovered);
    assert.equal(JSON.stringify(catalog), before);
});
test('CAT-T02: rechaza catálogo vacío o de tipo incorrecto', () => {
    for (const catalog of [null, [], {}, 'unit']) assert.throws(() => validateGroups(catalog, discovered), /Catálogo inválido/);
});
test('CAT-T03: rechaza suite vacía y valor no lista', () => {
    for (const unit of [[], null, 'test/a.cjs']) assert.throws(() => validateGroups({ unit }, discovered), /Suite inválida: unit/);
});
test('CAT-T04: rechaza ruta desconocida sin ejecutar archivos', () => {
    assert.throws(() => validateGroups({ unit: ['test/missing.cjs'] }, discovered), /Ruta no inventariada: test\/missing.cjs/);
});
test('CAT-T05: rechaza rutas de tipo incorrecto', () => {
    for (const file of [null, 1, {}]) assert.throws(() => validateGroups({ unit: [file] }, discovered), /Ruta inválida en suite: unit/);
});
test('CAT-T06: rechaza duplicado dentro de la misma suite', () => {
    assert.throws(() => validateGroups({ unit: ['test/a.cjs', 'test/a.cjs'] }, discovered), /Ruta duplicada: test\/a.cjs \(unit, unit\)/);
});
test('CAT-T07: rechaza duplicado entre suites', () => {
    assert.throws(() => validateGroups({ unit: ['test/a.cjs'], contract: ['test/a.cjs'] }, discovered), /Ruta duplicada: test\/a.cjs \(unit, contract\)/);
});
test('CAT-T08: catálogo real válido y clasificado sin mover pruebas manuales', () => {
    const data = inventory();
    validateGroups(groups, data.entries.map(entry => entry.path));
    for (const [group, files] of Object.entries(groups)) {
        for (const file of files) assert.equal(data.entries.find(entry => entry.path === file).group, group);
    }
    assert.equal(data.entries.find(entry => entry.path === 'Backend/test/email-live.cjs').group, null);
});
test('CAT-T09: inventory rechaza pertenencia ambigua antes de generar', () => {
    const duplicate = groups.unit[0];
    groups.contract.push(duplicate);
    try { assert.throws(() => inventory(), /Ruta duplicada/); }
    finally { assert.equal(groups.contract.pop(), duplicate); }
});
