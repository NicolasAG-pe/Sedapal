'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { limpiarRegistrosCorreo, validarOpciones } = require('../email-cleanup');
const { parseArgs, configurarDestino, main, ERROR } = require('../maintenance/email-cleanup.cjs');

test('política predeterminada conservadora y límites de configuración', () => {
    assert.deepEqual(validarOpciones(), { retentionHours: 24, batchSize: 500, dryRun: true });
    assert.deepEqual(validarOpciones({ retentionHours: 48, batchSize: 1000, dryRun: false }),
        { retentionHours: 48, batchSize: 1000, dryRun: false });
});

test('CLI simula por defecto y rechaza opciones ambiguas o fuera de política', () => {
    assert.equal(parseArgs([]).dryRun, true);
    assert.deepEqual(parseArgs(['--apply', '--retention-hours', '48', '--batch-size', '25']),
        { dryRun: false, retentionHours: 48, batchSize: 25 });
    for (const args of [['--apply', '--dry-run'], ['--apply', '--apply'], ['--retention-hours', '23'],
        ['--batch-size', '1001'], ['--batch-size'], ['--retention-hours', '24.5'],
        ['--retention-hours', '-1'], ['--help', '--apply'], ['--unknown']]) assert.throws(() => parseArgs(args));
});

test('CLI exige destino independiente y conserva TLS verificado para conexiones externas', () => {
    assert.throws(() => configurarDestino({ DATABASE_URL: 'postgres://fixture@db.invalid/fixture_db' }));
    assert.throws(() => configurarDestino({ EMAIL_MAINTENANCE_DATABASE_URL: 'postgres://fixture@db.invalid/fixture_db',
        EMAIL_MAINTENANCE_EXPECTED_DATABASE: 'otra_base' }));
    const c = configurarDestino({ EMAIL_MAINTENANCE_DATABASE_URL: 'postgres://fixture@db.invalid/fixture_db?sslmode=disable',
        EMAIL_MAINTENANCE_EXPECTED_DATABASE: 'fixture_db' });
    assert.equal(new URL(c.database.connectionString).searchParams.get('sslmode'), 'verify-full');
});

test('CLI no revela errores de configuración y help no requiere conectar', async () => {
    let out = '', err = '';
    const io = { stdout: { write: t => { out += t; } }, stderr: { write: t => { err += t; } } };
    assert.equal(await main([], { EMAIL_MAINTENANCE_DATABASE_URL: 'dato-privado-sintetico',
        EMAIL_MAINTENANCE_EXPECTED_DATABASE: 'fixture_db' }, io), 1);
    assert.equal(out, ''); assert.equal(err, ERROR + '\n');
    out = ''; err = '';
    assert.equal(await main(['--help'], {}, io), 0);
    assert.match(out, /simulación por defecto/); assert.equal(err, '');
});

test('rechaza retención inferior a 24 horas y lotes inválidos antes de conectar', async () => {
    const pool = { connect() { throw new Error('No debe conectar.'); } };
    for (const options of [{ retentionHours: 23 }, { retentionHours: '24' }, { retentionHours: Infinity },
        { retentionHours: 24.5 }, { retentionHours: 8761 }, { batchSize: 0 }, { batchSize: 1001 },
        { batchSize: 1.5 }, { batchSize: '500' }, { dryRun: 'false' }]) {
        await assert.rejects(limpiarRegistrosCorreo(pool, options), { message: 'Opciones de retención inválidas.' });
    }
});
