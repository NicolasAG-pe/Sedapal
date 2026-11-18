'use strict';
// Gateway LAB del ensayo: reutiliza createGateway y solo permite destinos del laboratorio.
// Uso: node gateway.cjs <origins.json> <puerto-gateway|0> <puerto-puente-conversación>
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const { createGateway } = require('../../Backend/services/gateway/server.cjs');

const [originsFile, listenText, bridgeText] = process.argv.slice(2);
const origins = Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(originsFile, 'utf8')))
    .map(([name, value]) => [name, new URL(value)]));
assert.deepEqual(Object.keys(origins).sort(), ['auth', 'billing', 'notifications', 'operations', 'realtime']);
assert.ok(Object.values(origins).every(url => url.protocol === 'http:' && url.href === url.origin + '/' &&
    (url.hostname === '127.0.0.1' || /^172\.31\.0\.\d+$/.test(url.hostname))));
const listenPort = Number(listenText);
const bridgePort = Number(bridgeText);
assert.ok(Number.isInteger(listenPort) && listenPort >= 0 && listenPort < 65536);
assert.ok(Number.isInteger(bridgePort) && bridgePort > 0 && bridgePort < 65536);

const approved = new Set(['127.0.0.1', ...Object.values(origins).map(url => url.hostname)]);
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
    const [first, host] = Array.isArray(args[0]) ? args[0] : args;
    const endpoint = typeof first === 'object' ? first : { host };
    if (endpoint.path || !approved.has(endpoint.hostname || endpoint.host || '127.0.0.1')) {
        throw Error('Destino fuera del LAB');
    }
    return connect.apply(this, args);
};

const gateway = createGateway({
    origins: { ...origins, conversation: new URL('http://127.0.0.1:' + bridgePort) },
    allowedOrigins: ['http://localhost', 'https://localhost']
});
gateway.server.listen(listenPort, '127.0.0.1', () => {
    console.log(JSON.stringify({ evento: 'gateway', puerto: gateway.server.address().port }));
});
process.once('SIGTERM', () => { void gateway.stop(); });
