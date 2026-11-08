'use strict';

// Los errores de proveedores y PostgreSQL pueden incluir datos de usuarios,
// consultas, tokens o credenciales en message/detail/stack. Registrar solo un
// código operativo de una lista cerrada conserva diagnóstico sin esos datos.
const safeCodes = new Set(['23505', '23503', '23514', '23502', '42P01', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE']);
function logInternalError(event, error, emit = console.error) {
    const code = typeof error?.code === 'string' && safeCodes.has(error.code) ? error.code : 'OTHER';
    emit(event, { codigo: code });
}
module.exports = { logInternalError };
