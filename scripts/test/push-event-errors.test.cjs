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

function createPushFixture({
    permission = 'granted',
    enabled = true,
    categories = { recibos: true, vencimientos: true, incidencias: true, cortes: true },
    autoEmitRegistration = true,
    capsFetch,
    sessionFetch,
} = {}) {
    const nodes = new Map();
    const node = id => {
        if (!nodes.has(id)) {
            const handlers = new Map();
            nodes.set(id, {
                addEventListener(name, cb) { handlers.set(name, cb); },
                click() { return handlers.get('click')?.(); },
                checked: true,
                textContent: '',
                disabled: false,
            });
        }
        return nodes.get(id);
    };
    const pluginListeners = new Map();
    const windowListeners = new Map();
    let appStateListener = null;
    const stats = { register: 0, unregister: 0, bind: 0, revoke: 0, caps: 0 };
    let currentPermission = permission;
    let state = {
        owner: '1:900000701',
        installation_id: '12345678-1234-4234-8234-123456789abc',
        proof: 'proof-demo',
        enabled,
        pending: false,
        categories: { ...categories },
    };
    const payload = Buffer.from(JSON.stringify({ id_usuario: 1, numero_suministro: '900000701' })).toString('base64url');
    const session = {
        token: () => `fixture.${payload}.fixture`,
        generation: () => 1,
        isUser: () => true,
        fetch: async (url, opts) => {
            if (url === '/api/push/devices') stats.bind++;
            if (sessionFetch) return sessionFetch(url, opts);
            return { ok: true, status: 204 };
        },
    };
    const plugin = {
        addListener: async (name, cb) => { pluginListeners.set(name, cb); },
        checkPermissions: async () => ({ receive: currentPermission }),
        requestPermissions: async () => ({ receive: currentPermission }),
        createChannel: async () => {},
        register: async () => {
            stats.register++;
            if (autoEmitRegistration) pluginListeners.get('registration')?.({ value: 'fcm-token-demo-0001' });
        },
        unregister: async () => { stats.unregister++; },
        removeAllDeliveredNotifications: async () => {},
    };
    const store = {
        read: async () => state,
        flags: async next => { state = { ...state, ...next }; return state; },
    };
    const window = {
        addEventListener(name, cb) { windowListeners.set(name, cb); },
        HMShared: { apiUrl: value => value },
    };
    const context = vm.createContext({
        window,
        document: { getElementById: node },
        atob,
        AbortSignal,
        fetch: async (url, opts) => {
            if (url === '/api/push/capabilities') {
                stats.caps++;
                if (capsFetch) return capsFetch(url, opts);
                return { ok: true, json: async () => ({ disponible: true }) };
            }
            if (url === '/api/push/revoke') {
                stats.revoke++;
                return { ok: true, status: 204 };
            }
            return { ok: true, status: 204 };
        },
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
    return {
        controller,
        nodes,
        stats,
        setPermission: value => { currentPermission = value; },
        emitRegistration: value => pluginListeners.get('registration')?.({ value }),
        emitRegistrationError: () => pluginListeners.get('registrationError')?.({}),
        appState: isActive => appStateListener?.({ isActive }),
        online: () => windowListeners.get('online')?.(),
        getState: () => state,
        flushMicrotasks: () => new Promise(resolve => setTimeout(resolve, 10)),
    };
}

test('evita registros FCM duplicados mientras la registración está en curso y conserva el estado al suspender, reanudar y reiniciar', async () => {
    const f = createPushFixture({ autoEmitRegistration: false });
    await f.controller.start('900000701');
    assert.equal(f.stats.register, 1);
    assert.equal(f.nodes.get('push-status').textContent, 'Comprobando dispositivo…');
    // Suspensión y reanudación mientras aún no llega el callback de FCM: no duplica register()
    f.appState(false);
    f.appState(true);
    await f.controller.refresh();
    assert.equal(f.stats.register, 1);
    // Llega el token FCM y el backend confirma
    f.emitRegistration('fcm-token-demo-0002');
    await f.flushMicrotasks();
    assert.equal(f.stats.bind, 1);
    assert.equal(f.nodes.get('push-status').textContent, 'Activadas en este dispositivo. Los avisos no muestran datos privados.');
    // Cambio de pestaña/refresh y múltiples reanudaciones conservan estado sin duplicar register() ni bind()
    f.appState(false);
    f.appState(true);
    await f.controller.refresh();
    await f.controller.refresh();
    assert.equal(f.stats.register, 1);
    assert.equal(f.stats.bind, 1);
    assert.equal(f.nodes.get('push-status').textContent, 'Activadas en este dispositivo. Los avisos no muestran datos privados.');
    // Reinicio completo (nuevo start) vuelve a sincronizar una sola vez
    await f.controller.start('900000701');
    assert.equal(f.stats.register, 2);
    f.emitRegistration('fcm-token-demo-0002');
    await f.flushMicrotasks();
    assert.equal(f.stats.bind, 2);
    assert.equal(f.nodes.get('push-status').textContent, 'Activadas en este dispositivo. Los avisos no muestran datos privados.');
});

test('errores de red en /api/push/devices y /api/push/capabilities reintentan limpiamente sin bloquear controles ni duplicar register()', async () => {
    let failBind = true;
    let failCaps = false;
    const f = createPushFixture({
        capsFetch: async () => failCaps ? { ok: false, status: 503, json: async () => ({ estado: 'error' }) } : { ok: true, json: async () => ({ disponible: true }) },
        sessionFetch: async () => failBind ? { ok: false, status: 503 } : { ok: true, status: 204 },
    });
    await f.controller.start('900000701');
    await f.flushMicrotasks();
    assert.equal(f.stats.register, 1);
    assert.equal(f.stats.bind, 1);
    assert.match(f.nodes.get('push-status').textContent, /No se pudo autorizar/);
    assert.equal(f.nodes.get('push-enable').disabled, false);

    // Recupera red: online reintenta bind() con el token pendiente SIN llamar a register() de nuevo
    failBind = false;
    f.online();
    await f.flushMicrotasks();
    assert.equal(f.stats.register, 1);
    assert.equal(f.stats.bind, 2);
    assert.equal(f.nodes.get('push-status').textContent, 'Activadas en este dispositivo. Los avisos no muestran datos privados.');

    // Error transitorio 503 en capabilities al reanudar: no bloquea ni declara push desactivado
    failCaps = true;
    f.appState(true);
    await f.flushMicrotasks();
    assert.match(f.nodes.get('push-status').textContent, /No se pudo completar/);
    assert.doesNotMatch(f.nodes.get('push-status').textContent, /desactivada en el servidor/);
    assert.equal(f.nodes.get('push-enable').disabled, false);

    // Al volver la red, restaura estado activo coherentemente
    failCaps = false;
    f.online();
    await f.flushMicrotasks();
    assert.equal(f.stats.register, 1);
    assert.equal(f.nodes.get('push-status').textContent, 'Activadas en este dispositivo. Los avisos no muestran datos privados.');
});

test('estado coherente si el permiso queda pendiente o se revoca en ajustes de Android', async () => {
    const f = createPushFixture({ permission: 'prompt', enabled: true });
    await f.controller.start('900000701');
    assert.doesNotMatch(f.nodes.get('push-status').textContent, /Comprobando dispositivo/);
    assert.match(f.nodes.get('push-status').textContent, /Permiso Android pendiente/);
    assert.equal(f.stats.register, 0);

    // Si el usuario revoca el permiso desde Ajustes Android y vuelve a la app
    f.setPermission('granted');
    await f.controller.refresh();
    await f.flushMicrotasks();
    assert.equal(f.nodes.get('push-status').textContent, 'Activadas en este dispositivo. Los avisos no muestran datos privados.');
    f.setPermission('denied');
    f.appState(true);
    await f.flushMicrotasks();
    assert.equal(f.getState().enabled, false);
    assert.match(f.nodes.get('push-status').textContent, /Permiso denegado/);
});
