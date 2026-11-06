'use strict';
// Defensa adicional; el aislamiento de integración se comprueba fuera del proceso.
const net = require('node:net');
const original = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
    const normalized = Array.isArray(args[0]) ? args[0] : args;
    const options = typeof normalized[0] === 'object' ? normalized[0] : { host: typeof normalized[1] === 'string' ? normalized[1] : 'localhost' };
    const host = String(options.host || 'localhost').replace(/^\[|\]$/g, '');
    if (options.path || !['localhost', '127.0.0.1', '::1'].includes(host)) {
        const error = Object.assign(new Error('TEST_NETWORK_BLOCKED: solo loopback en suites administradas'), { code: 'TEST_NETWORK_BLOCKED' });
        throw error;
    }
    return original.apply(this, args);
};
