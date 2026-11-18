'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareValue } = require('pg/lib/utils');
const { validarReciboAdmin, validarCorteAdmin } = require('../admin-date-validation');

const recibo = {
    numero_suministro: '900000002', periodo: 'Octubre 2026',
    fecha_emision: '2026-10-01', fecha_vencimiento: '2026-11-01', monto: 45, consumo_m3: 15
};
const corte = {
    alcance: 'Zona', distrito: 'Laboratorio', zona: 'Zona sintética', motivo: 'Mantenimiento',
    fecha_inicio: '2026-11-20T14:00:00.000Z', fecha_fin: '2026-11-20T20:00:00.000Z'
};

test('las fechas SQL de recibos conservan el día al serializar en UTC y America/Lima', () => {
    const previous = process.env.TZ;
    try {
        for (const zone of ['UTC', 'America/Lima']) {
            process.env.TZ = zone;
            const result = validarReciboAdmin(recibo);
            assert.equal(result.error, undefined);
            assert.equal(prepareValue(result.emision), '2026-10-01');
            assert.equal(prepareValue(result.vencimiento), '2026-11-01');
        }
    } finally {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
    }
});
test('recibos rechazan fechas ilegibles y vencimientos anteriores a la emisión', () => {
    assert.match(validarReciboAdmin({ ...recibo, fecha_emision: 'incorrecta' }).error, /inválidas/);
    assert.match(validarReciboAdmin({ ...recibo, fecha_vencimiento: '2026-09-01' }).error, /posterior/);
    assert.equal(validarReciboAdmin({ ...recibo, fecha_vencimiento: recibo.fecha_emision }).error, undefined);
});
test('recibos aplican el rango inclusivo 2000–2100 a ambas fechas', () => {
    assert.match(validarReciboAdmin({ ...recibo, fecha_emision: '0206-10-28' }).error, /2000 y 2100/);
    assert.match(validarReciboAdmin({ ...recibo, fecha_vencimiento: '20266-11-01' }).error, /2000 y 2100/);
    for (const fecha of ['2000-01-01', '2100-12-31']) {
        assert.equal(validarReciboAdmin({ ...recibo, fecha_emision: fecha, fecha_vencimiento: fecha }).error, undefined);
    }
});
test('recibos conservan inclusive el plazo máximo de 366 días del hotfix', () => {
    const bisiesto = { ...recibo, fecha_emision: '2023-03-01' };
    assert.equal(validarReciboAdmin({ ...bisiesto, fecha_vencimiento: '2024-03-01' }).error, undefined);
    assert.match(validarReciboAdmin({ ...bisiesto, fecha_vencimiento: '2024-03-02' }).error, /un año/);
});
test('cortes aplican el mismo rango a inicio y fin con orden estricto', () => {
    assert.equal(validarCorteAdmin(corte).error, undefined);
    assert.match(validarCorteAdmin({ ...corte, fecha_inicio: '0206-11-20T14:00:00.000Z' }).error, /2000 y 2100/);
    assert.match(validarCorteAdmin({ ...corte, fecha_fin: '2101-01-01T00:00:00.000Z' }).error, /2000 y 2100/);
    assert.match(validarCorteAdmin({ ...corte, fecha_fin: 'hora inválida' }).error, /inválidas/);
    assert.match(validarCorteAdmin({ ...corte, fecha_fin: corte.fecha_inicio }).error, /posterior/);
    assert.equal(validarCorteAdmin({ ...corte, fecha_inicio: '2000-01-01T00:00:00.000Z',
        fecha_fin: '2100-12-31T23:59:59.999Z' }).error, undefined);
});
