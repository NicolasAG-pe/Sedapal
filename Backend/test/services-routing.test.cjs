'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { destination } = require('../services/gateway/routes.cjs');
const { app: oldApp, pool } = require('../server');
const { createService } = require('../services/auth/server.cjs');
const domainRoutes = {
    billing: require('../services/billing/routes.cjs'),
    operations: require('../services/operations/routes.cjs'),
    notifications: require('../services/notifications/routes.cjs')
};
const noop = () => {};
const scope = { pool: {}, requiereAuth: noop, requiereAdmin: noop, limitadorGenerico: () => noop, limiteOperacionesSensibles: noop };
function routes(app) {
    return app.router.stack.flatMap(layer => layer.route ?
        Object.keys(layer.route.methods).map(method => [method, layer.route.path]) : []);
}

test('cada método y ruta pública del monolito tiene un propietario registrado detrás del gateway', async t => {
    t.after(() => pool.end());
    const auth = createService({ pool: {}, env: {
        AUTH_TOKEN_SECRET: 'fixture-only-session-secret',
        AUTH_INTERNAL_SECRET: 'fixture-only-internal-auth-secret',
        MICROSERVICES_REPORTING: '1'
    } });
    const all = routes(auth.app).filter(([, path]) => path.startsWith('/api/')).map(row => [...row, 'auth']);
    for (const [name, handler] of Object.entries(domainRoutes)) {
        const app = express();
        handler.registerRoutes(app, scope);
        all.push(...routes(app).map(row => [...row, name]));
    }
    const actual = all.map(([method, path]) => method + ' ' + path);
    assert.equal(new Set(actual).size, actual.length);
    assert.deepEqual([...actual, 'get /api/health'].sort(), routes(oldApp).map(row => row.join(' ')).sort());
    assert.equal(actual.length + 1, 75);
    for (const [, path, domain] of all) assert.equal(destination(path), domain, path);
    assert.equal(destination('/socket.io/'), 'realtime');
    assert.equal(destination('/internal/v1/email/deliver'), undefined);
    assert.equal(destination('/internal/v1/auth/introspect'), undefined);
});
