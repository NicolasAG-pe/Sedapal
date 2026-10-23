'use strict';
function envolverMensaje(mensaje, proveedor = 'resend') {
    if (!['resend', 'gmail'].includes(proveedor)) throw new Error('Proveedor de correo inválido.');
    return proveedor === 'resend' ? mensaje : JSON.stringify({ hidro_mail_v: 1, proveedor, mensaje });
}
function abrirMensaje(raw) {
    const data = JSON.parse(raw);
    if (data.hidro_mail_v !== undefined) {
        if (data.hidro_mail_v !== 1 || data.proveedor !== 'gmail' || typeof data.mensaje !== 'string') {
            throw new Error('Sobre de correo inválido.');
        }
        JSON.parse(data.mensaje);
        return { proveedor: 'gmail', mensaje: data.mensaje };
    }
    return { proveedor: 'resend', mensaje: raw };
}
module.exports = { envolverMensaje, abrirMensaje };
