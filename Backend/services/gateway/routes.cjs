'use strict';

// Ruta pública por propietario. Las subrutas bajo /internal quedan fuera del gateway.
const domains = [
    ['auth', /^\/api\/(?:auth(?:\/|$)|(?:me\/perfil|perfil\/[^/]+|admin\/(?:resumen|usuarios(?:\/[^/]+(?:\/estado)?)?|suministros\/[^/]+\/ubicacion))\/?$)/i],
    ['billing', /^\/api\/(?:me\/|admin\/)?(?:recibos|pagos|operaciones-pago)(?:\/|$)/i],
    ['operations', /^\/api\/(?:me\/|admin\/)?(?:incidencias|cortes|atencion)(?:\/|$)/i],
    ['notifications', /^\/api\/(?:notificaciones|push)(?:\/|$)/i],
    ['realtime', /^\/socket\.io\/?$/i]
];
function destination(path) { return domains.find(([, match]) => match.test(path))?.[0]; }
module.exports = { domains, destination };
