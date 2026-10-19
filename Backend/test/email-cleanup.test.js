'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { limpiarRegistrosCorreo, validarOpciones } = require('../email-cleanup');

test('política predeterminada conservadora y límites de configuración', () => {
    assert.deepEqual(validarOpciones(), { retentionHours: 24, batchSize: 500, dryRun: true });
    assert.deepEqual(validarOpciones({ retentionHours: 48, batchSize: 1000, dryRun: false }),
        { retentionHours: 48, batchSize: 1000, dryRun: false });
});

test('rechaza retención inferior a 24 horas y lotes inválidos antes de conectar', async () => {
    const pool = { connect() { throw new Error('No debe conectar.'); } };
    for (const options of [{ retentionHours: 23 }, { retentionHours: '24' }, { retentionHours: Infinity },
        { retentionHours: 24.5 }, { retentionHours: 8761 }, { batchSize: 0 }, { batchSize: 1001 },
        { batchSize: 1.5 }, { batchSize: '500' }, { dryRun: 'false' }]) {
        await assert.rejects(limpiarRegistrosCorreo(pool, options), { message: 'Opciones de retención inválidas.' });
    }
});
