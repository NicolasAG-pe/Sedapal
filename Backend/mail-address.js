'use strict';

// Analizar por partes evita retrocesos cuadráticos en remitentes malformados.
function remitenteValido(value) {
    if (typeof value !== 'string' || value.length > 320 || /[\r\n]/.test(value)) return false;
    let mailbox = value;
    const open = value.indexOf('<');
    if (open !== -1) {
        if (!value.endsWith('>') || open < 2 || value[open - 1] !== ' ' || /[<>]/.test(value.slice(0, open))) return false;
        mailbox = value.slice(open + 1, -1);
    }
    return /^[^\s<>@]+@[^\s<>@.]+(?:\.[^\s<>@.]+)+$/.test(mailbox);
}
module.exports = { remitenteValido };
