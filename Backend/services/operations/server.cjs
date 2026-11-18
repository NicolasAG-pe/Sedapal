'use strict';
const { runDomain } = require('../runtime.cjs');
const { registerRoutes } = require('./routes.cjs');

runDomain('operations', registerRoutes, ['incidencias', 'incidencia_eventos', 'incidencia_cambios', 'cortes_servicio', 'cortes_suministros', 'solicitudes_atencion']);
