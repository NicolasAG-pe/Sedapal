'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('un error inesperado en un evento push no impide reintentar ni genera rechazos huérfanos', async () => {
    const nodes = new Map();
    const node = id => {
        if (!nodes.has(id)) nodes.set(id, { addEventListener() {}, checked: true });
        return nodes.get(id);
    };
    let broken = false, requests = 0;
    const payload = Buffer.from(JSON.stringify({ id_usuario: 1, numero_suministro: '900000701' })).toString('base64url');
    const session = {
        token: () => `fixture.${payload}.fixture`,
        generation: () => 1,
        isUser: () => { if (broken) throw Error('fallo sintético'); return true; },
        fetch: async () => { requests++; return { ok: true, json: async () => ({ seccion: 'historial' }) }; },
    };
    const plugin = { addListener: async () => {}, checkPermissions: async () => ({ receive: 'prompt' }) };
    const state = { owner: '1:900000701', enabled: false, pending: false, categories: {} };
    const store = { read: async () => state, flags: async () => state };
    const window = { addEventListener() {}, HMShared: { apiUrl: value => value } };
    const context = vm.createContext({ window, document: { getElementById: node }, atob, AbortSignal,
        fetch: async () => ({ json: async () => ({ disponible: true }) }) });
    vm.runInContext(fs.readFileSync('Frontend/assets/js/push-notifications.js', 'utf8'), context);
    const controller = window.createHMPush({ session, plugin, store, configured: async () => ({ configured: true }),
        platform: { getPlatform: () => 'android' }, navigate: async () => {}, refresh() {}, notice() {} });
    await controller.start('900000701');
    const id = '12345678-1234-1234-1234-123456789abc';
    broken = true;
    await assert.rejects(controller.openEvent(id, false), /fallo sintético/);
    await new Promise(resolve => setImmediate(resolve));
    broken = false;
    await controller.openEvent(id, false);
    assert.equal(requests, 1);
});
