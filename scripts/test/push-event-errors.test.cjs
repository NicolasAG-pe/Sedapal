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

test('reabrir o refrescar la app con token FCM vigente conserva el estado activo en lugar de quedar comprobando', async () => {
    const nodes = new Map();
    const node = id => {
        if (!nodes.has(id)) nodes.set(id, { addEventListener() {}, checked: true, textContent: '', disabled: false });
        return nodes.get(id);
    };
    const listeners = new Map();
    let appStateListener = null;
    let registerCalls = 0;
    const payload = Buffer.from(JSON.stringify({ id_usuario: 1, numero_suministro: '900000701' })).toString('base64url');
    const session = {
        token: () => `fixture.${payload}.fixture`,
        generation: () => 1,
        isUser: () => true,
        fetch: async () => ({ ok: true, status: 204 }),
    };
    const plugin = {
        addListener: async (name, cb) => { listeners.set(name, cb); },
        checkPermissions: async () => ({ receive: 'granted' }),
        createChannel: async () => {},
        register: async () => {
            registerCalls++;
            listeners.get('registration')?.({ value: 'fcm-token-demo-0001' });
        },
    };
    const state = {
        owner: '1:900000701',
        installation_id: '12345678-1234-4234-8234-123456789abc',
        proof: 'proof-demo',
        enabled: true,
        pending: false,
        categories: { recibos: true, vencimientos: true, incidencias: true, cortes: true },
    };
    const store = { read: async () => state, flags: async () => state };
    const window = { addEventListener() {}, HMShared: { apiUrl: value => value } };
    const context = vm.createContext({
        window,
        document: { getElementById: node },
        atob,
        AbortSignal,
        fetch: async () => ({ json: async () => ({ disponible: true }) }),
    });
    vm.runInContext(fs.readFileSync('Frontend/assets/js/push-notifications.js', 'utf8'), context);
    const controller = window.createHMPush({
        session,
        plugin,
        store,
        configured: async () => ({ configured: true }),
        platform: {
            getPlatform: () => 'android',
            Plugins: { App: { addListener: (name, cb) => { if (name === 'appStateChange') appStateListener = cb; } } },
        },
        navigate: async () => {},
        refresh() {},
        notice() {},
    });
    await controller.start('900000701');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(registerCalls, 1);
    assert.equal(
        nodes.get('push-status').textContent,
        'Activadas en este dispositivo. Los avisos no muestran datos privados.',
    );
    appStateListener({ isActive: true });
    await controller.refresh();
    assert.equal(registerCalls, 1);
    assert.equal(
        nodes.get('push-status').textContent,
        'Activadas en este dispositivo. Los avisos no muestran datos privados.',
    );
});
