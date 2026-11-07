'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { logInternalError } = require('../safe-log');
test('los logs conservan solo códigos operativos conocidos y omiten detalles privados', () => {
    const entries = [], log = (...args) => entries.push(args);
    const error = Object.assign(new Error('private-fixture-token'), { code: '23505', detail: 'private-fixture-email' });
    logInternalError('Fallo de API.', error, log);
    logInternalError('Fallo de API.', { code: 'private-fixture-code', message: 'private-fixture-value' }, log);
    logInternalError('Fallo de API.', null, log);
    assert.deepEqual(entries.map(e => e[1].codigo), ['23505', 'OTHER', 'OTHER']);
    assert.doesNotMatch(JSON.stringify(entries), /private-fixture/);
});
