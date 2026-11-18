'use strict';
const { runDomain } = require('../runtime.cjs');
const { registerRoutes } = require('./routes.cjs');

runDomain('billing', registerRoutes, ['recibos', 'pagos', 'operaciones_pago', 'operaciones_pago_historial', 'eventos_pago_proveedor']);
