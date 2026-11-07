'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
// jsPDF se carga antes de simular un global previo, igual que en los CLI Node.
require('../../Frontend/assets/vendor/jspdf.umd.min.js');
const { loadDocuments } = require('../pdf-example-runtime.cjs');
test('el adaptador carga los generadores fijos, conserva el global y reutiliza la instancia', () => {
    const previous = { sentinel: true };
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    globalThis.window = previous;
    try {
        const docs = loadDocuments();
        assert.equal(globalThis.window, previous);
        assert.equal(loadDocuments(), docs);
        assert.equal(typeof docs.receipt, 'function');
        assert.equal(typeof docs.payment, 'function');
    } finally {
        if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
        else delete globalThis.window;
    }
});
