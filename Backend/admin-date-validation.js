'use strict';

// El hotfix admite hasta 366 días, incluidos los intervalos con año bisiesto.
const PLAZO_MAXIMO_RECIBO_MS = 366 * 24 * 60 * 60 * 1000;

function fechaAdminEnRango(fecha){
    const anio = fecha.getUTCFullYear();
    return anio >= 2000 && anio <= 2100;
}

function validarReciboAdmin(body){
    const numero = String((body || {}).numero_suministro || '').trim();
    const periodo = String((body || {}).periodo || '').trim();
    const emision = new Date((body || {}).fecha_emision);
    const vencimiento = new Date((body || {}).fecha_vencimiento);
    const monto = Number((body || {}).monto);
    const consumo = Number((body || {}).consumo_m3);

    if (!/^\d{9}$/.test(numero)) {
        return { error: 'El número de suministro debe contener 9 dígitos.' };
    }

    if (!periodo || periodo.length > 20) {
        return { error: 'El periodo es obligatorio (máximo 20 caracteres).' };
    }

    if (Number.isNaN(emision.getTime()) || Number.isNaN(vencimiento.getTime())) {
        return { error: 'Fechas de emisión y vencimiento inválidas.' };
    }

    if (!fechaAdminEnRango(emision) || !fechaAdminEnRango(vencimiento)) {
        return { error: 'Las fechas del recibo deben estar entre los años 2000 y 2100.' };
    }

    if (vencimiento < emision) {
        return { error: 'La fecha de vencimiento debe ser igual o posterior a la emisión.' };
    }

    if (vencimiento - emision > PLAZO_MAXIMO_RECIBO_MS) {
        return { error: 'El vencimiento no puede superar un año desde la emisión.' };
    }

    if (!Number.isFinite(monto) || monto <= 0 || monto > 99999999.99) {
        return { error: 'Ingresa un monto válido.' };
    }

    if (!Number.isFinite(consumo) || consumo < 0 || consumo > 99999999.99) {
        return { error: 'Ingresa un consumo válido.' };
    }

    // SQL DATE no tiene zona horaria. Evitar que pg convierta medianoche UTC
    // al día anterior al serializar un Date en America/Lima.
    return { numero, periodo, emision: emision.toISOString().slice(0, 10),
        vencimiento: vencimiento.toISOString().slice(0, 10), monto, consumo };
}

function validarCorteAdmin(body){
    const alcance = String((body || {}).alcance || '').trim();
    const motivo = String((body || {}).motivo || '').trim();
    const inicio = new Date((body || {}).fecha_inicio);
    const fin = new Date((body || {}).fecha_fin);

    if (alcance !== 'Zona' && alcance !== 'General') {
        return { error: 'Alcance inválido. Debe ser Zona o General.' };
    }

    if (!motivo || motivo.length > 200) {
        return { error: 'El motivo es obligatorio (máximo 200 caracteres).' };
    }

    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
        return { error: 'Fechas de inicio y fin inválidas.' };
    }

    if (!fechaAdminEnRango(inicio) || !fechaAdminEnRango(fin)) {
        return { error: 'Las fechas del corte deben estar entre los años 2000 y 2100.' };
    }

    if (fin <= inicio) {
        return { error: 'La fecha de fin debe ser posterior a la fecha de inicio.' };
    }

    let distrito = null;
    let zona = null;

    if (alcance === 'Zona') {
        distrito = String((body || {}).distrito || '').trim();
        zona = String((body || {}).zona || '').trim();

        if (!distrito || !zona) {
            return { error: 'Distrito y zona son obligatorios para alcance Zona.' };
        }

        if (distrito.length > 80 || zona.length > 120) {
            return { error: 'Distrito o zona demasiado largos.' };
        }
    }

    return { alcance, motivo, distrito, zona, inicio, fin };
}

module.exports = { validarReciboAdmin, validarCorteAdmin };
