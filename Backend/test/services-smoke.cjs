'use strict';
// Opt-in. Ejecutar desde la raíz con Node y Docker. Solo toca el laboratorio fijo.
const assert = require('node:assert/strict');
const http = require('node:http');
const { randomUUID, randomBytes, randomInt } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { PNG } = require('pngjs');
global.WebSocket = require('ws');
const { io } = require('../../Frontend/assets/vendor/socket.io.min.js');
const base = 'http://127.0.0.1:8280';
const adminBase = 'http://127.0.0.1:8281';
const project = 'hidro-ms120-services';
const compose = ['compose', '--project-name', project, '--env-file', '.env.services', '-f', 'compose.services.yaml'];

function docker(args) {
    return execFileSync('docker', [...compose, ...args], { encoding: 'utf8', timeout: 30000,
        stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function lifecycle(action, service) {
    const id = docker(['ps', '-a', '-q', service]);
    assert.match(id, /^[a-f0-9]{12,64}$/);
    // Arrancar este contenedor sin volver a ejecutar db-init ni sus dependencias.
    execFileSync('docker', [action, id], { timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
}
function fixture(service, operation, data) {
    try { return JSON.parse(docker(['exec', '-T', service, 'node', '-e',
        "require('./test/services-fixture.cjs').fixture(process.env,process.argv.slice(1)).then(value=>console.log(JSON.stringify(value))).catch(error=>{console.error(error.code||error.name);process.exitCode=1;})",
        operation, JSON.stringify(data || {})])); } catch (_) { throw Error('Fixture ' + service + '/' + operation); }
}
async function request(path, expected, { method = 'GET', token, data, panel = false } = {}) {
    const response = await fetch((panel ? adminBase : base) + path, { method, headers: {
        'X-Hidro-Auth-Contract': 'otp-outbox-v1', ...(token && { Authorization: 'Bearer ' + token }),
        ...(data && { 'Content-Type': 'application/json' })
    }, body: data ? JSON.stringify(data) : undefined, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (Array.isArray(expected)) {
        assert.ok(expected.includes(response.status), method + ' ' + path + ' devuelve ' + response.status);
        await response.body?.cancel();
        return response.status;
    }
    assert.equal(response.status, expected, method + ' ' + path);
    if (response.headers.get('content-type')?.includes('json')) return response.json();
    return Buffer.from(await response.arrayBuffer());
}
async function until(check, label) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        const result = await check();
        if (result) return result;
        await delay(250);
    }
    throw Error('Tiempo agotado: ' + label);
}
async function mockCode(worker, operation, makeRequest) {
    lifecycle('stop', worker);
    let id, code;
    try {
        id = await makeRequest();
        code = fixture('auth', operation, { id });
    } finally { lifecycle('start', worker); }
    await until(() => {
        const proof = fixture('auth', operation, { id, status: true });
        return proof?.status === 'aceptado' && proof.stub && proof.cleared;
    }, 'aceptación stub');
    return { id, code };
}
function lostResponse(path, data, token, status, method = 'POST', origin = base) {
    const body = JSON.stringify(data);
    return new Promise((resolve, reject) => {
        const req = http.request(origin + path, { method, headers: {
            Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body)
        } }, res => {
            // El servidor ya confirmó la escritura. Se descarta la respuesta antes de leer su cuerpo.
            res.destroy();
            if (res.statusCode === status) resolve();
            else reject(Error('Estado inesperado antes de descartar respuesta'));
        });
        req.setTimeout(10000, () => req.destroy(Error('Tiempo agotado escribiendo fixture')));
        req.on('error', reject);
        req.end(body);
    });
}
function nextEvent(socket, event) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { socket.off(event, handler); reject(Error('Evento ausente: ' + event)); }, 12000);
        function handler(data) { clearTimeout(timer); resolve(data); }
        socket.once(event, handler);
    });
}
async function connect(token) {
    const socket = io(base, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true,
        extraHeaders: { Origin: base } });
    try {
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => done(Error('Evento ausente: pago:registrado')), 12000);
            function done(error) {
                clearTimeout(timeout);
                socket.off('connect_error', failed);
                socket.off('pago:registrado', synced);
                if (error) reject(error);
                else resolve();
            }
            function failed(error) {
                const reason = error.message === 'Autenticación requerida.' ? 'sesión rechazada' : 'transporte no conectado';
                done(Error('Evento ausente: Socket.IO ' + reason));
            }
            function synced() { done(); }
            socket.once('connect_error', failed);
            socket.once('pago:registrado', synced);
        });
        return socket;
    } catch (error) { socket.disconnect(); throw error; }
}

async function main() {
    assert.match(docker(['ps', 'gateway', '--format', '{{.Project}}']), /^hidro-ms120-services$/);
    await until(async () => (await fetch(base + '/api/health')).ok, 'salud inicial del gateway');
    assert.ok((await request('/api/health', 200)).auth_contract);
    await request('/internal/v1/auth/introspect', 405, { method: 'POST', data: {} });
    await request('/internal/v1/email/deliver', 405, { method: 'POST', data: {} });
    const roles = ['auth', 'billing', 'operations', 'notifications', 'realtime'];
    for (const service of roles) {
        const access = fixture(service, 'grants');
        assert.deepEqual(access, { role: 'hm_' + service, credentials: service === 'auth',
            photos: service === 'operations', billing: service === 'billing',
            notices: service === 'notifications', publish: false, consume: service === 'realtime' });
    }
    console.log('OK gateway, rutas internas inaccesibles y grants de los cinco roles');

    const password = 'FixtureServices123';
    const supply = String(randomInt(900000000, 999999999)), correo = 'services' + supply + '@example.invalid';
    const adminSupply = String(randomInt(800000000, 899999999));
    fixture('auth', 'admin', { supply: adminSupply, password });
    const login = (number, pwd, panel = false) => request('/api/auth/login', 200, { method: 'POST',
        data: { numero_suministro: number, password: pwd }, panel });
    const admin = await login(adminSupply, password, true);
    const otp = await mockCode('email-worker', 'otp', async () => (await request('/api/auth/otp/register', 202,
        { method: 'POST', data: { correo, numero_suministro: supply, password, solicitud_id: randomUUID() } })).registro_id);
    await request('/api/auth/verify-email', 201, { method: 'POST', data: { registro_id: otp.id, codigo: otp.code } });
    const user = await login(supply, password);
    const token = user.token;
    await request('/api/me/perfil', 200, { token });
    await request('/api/admin/resumen', 403, { token });
    await request('/api/admin/resumen', 200, { token: admin.token, panel: true });
    await request('/api/recibos/' + adminSupply, 403, { token });
    console.log('OK OTP stub, acceso, perfil, roles y aislamiento de suministro');

    const socket = await connect(token);
    const handshake = await fetch(base + '/socket.io/?EIO=4&transport=polling', { headers: { Origin: base } });
    assert.equal(handshake.status, 200);
    assert.match(await handshake.text(), /^0\{/);
    try {
        const proof = randomBytes(32).toString('base64url'), installation = randomUUID();
        await request('/api/push/devices', 200, { method: 'POST', token, data: {
            installation_id: installation, proof, consent: true, token: 'mock-device-' + installation,
            categories: { recibos: true, vencimientos: true, incidencias: true, cortes: true }
        } });
        const receiptData = {
            numero_suministro: supply, periodo: '2026-11', fecha_emision: '2026-11-01',
            fecha_vencimiento: '2026-11-30', monto: 42.55, consumo_m3: 13
        };
        const receiptEvent = nextEvent(socket, 'recibo:nuevo');
        const { recibo } = await request('/api/admin/recibos', 201, { method: 'POST', token: admin.token, data: receiptData, panel: true });
        assert.equal(String((await receiptEvent).id), String(recibo.id_recibo));
        const receipts = await request('/api/me/recibos', 200, { token });
        assert.equal(String(receipts.recibos[0].id_recibo), String(recibo.id_recibo));
        const delivered = await until(() => {
            const result = fixture('notifications', 'push', { installation, receipt: recibo.id_recibo });
            return result?.estado === 'simulado' && result;
        }, 'entrega push con proveedor mock');
        await request('/api/push/events/' + delivered.push_evento, 200, { token });
        const notices = await request('/api/notificaciones', 200, { token });
        await request('/api/notificaciones/' + notices.notificaciones[0].id_notificacion + '/leida', 200, { method: 'PATCH', token, data: {} });
        console.log('OK recibo, notificación, push mock, WebSocket con JWT y handshake polling');

        const race = { ...receiptData, periodo: '2026-10', fecha_emision: '2026-10-01', fecha_vencimiento: '2026-10-31' };
        const concurrent = await Promise.all([true, false].map(panel => request('/api/admin/recibos', [201, 409],
            { method: 'POST', token: admin.token, data: race, panel })));
        assert.deepEqual(concurrent.sort(), [201, 409], 'Una creación y un conflicto desde las dos entradas');
        assert.equal((await request('/api/me/recibos', 200, { token })).recibos.filter(row => row.periodo === race.periodo).length, 1);
        console.log('OK concurrencia de recibos a través de las dos entradas');


        const payment = { id_recibo: recibo.id_recibo, metodo: 'demostrativo', solicitud_id: randomUUID() };
        await lostResponse('/api/me/operaciones-pago', payment, token, 201);
        const retry = await request('/api/me/operaciones-pago', 200, { method: 'POST', token, data: payment });
        const operations = await request('/api/me/operaciones-pago', 200, { token });
        assert.deepEqual(operations.operaciones.map(row => row.id), [retry.operacion.id]);
        assert.equal((await request('/api/me/pagos', 200, { token })).cantidad, 0);
        assert.equal((await request('/api/me/recibos', 200, { token })).recibos[0].estado, 'Emitido');
        await request('/api/me/operaciones-pago/' + retry.operacion.id, 200, { token });
        await request('/api/admin/operaciones-pago/' + retry.operacion.id, 200, { token: admin.token, panel: true });
        console.log('OK COMMIT de pago demostrativo con respuesta descartada, reintento UUID y deuda intacta');

        const photo = new PNG({ width: 8, height: 8 }); photo.data.fill(255);
        const incident = (await request('/api/incidencias', 201, { method: 'POST', token, data: {
            tipo: 'Fuga de agua', descripcion: 'Fuga observada en el laboratorio', referencia: 'Zona de prueba',
            foto_base64: 'data:image/png;base64,' + PNG.sync.write(photo).toString('base64'), foto_mime: 'image/png'
        } })).incidencia;
        const id = incident.id_incidencia;
        assert.equal((await request('/api/incidencias/' + id + '/foto', 200, { token }))[0], 137);
        const change = { estado: 'En revisión', comentario_publico: 'Seguimiento sintético', solicitud_id: randomUUID() };
        const changeEvent = nextEvent(socket, 'incidencia:actualizada');
        const changeRoute = '/api/admin/incidencias/' + id + '/estado';
        await lostResponse(changeRoute, change, admin.token, 200, 'PATCH', adminBase);
        assert.equal(String((await changeEvent).id), String(id));
        assert.equal((await request(changeRoute, 200, { method: 'PATCH', token: admin.token, data: change })).repetida, true);
        await request('/api/me/incidencias/' + id + '/seguimiento', 200, { token });
        const from = new Date(Date.now() + 3600000).toISOString(), to = new Date(Date.now() + 10800000).toISOString();
        const cut = await request('/api/admin/cortes', 201, { method: 'POST', token: admin.token, data: {
            alcance: 'General', motivo: 'Mantenimiento simulado', fecha_inicio: from, fecha_fin: to
        } });
        assert.ok((await request('/api/me/cortes', 200, { token })).cortes.some(row => row.id_corte === cut.corte.id_corte));
        const support = await request('/api/atencion', 201, { method: 'POST', token, data: {
            categoria: 'Facturación', asunto: 'Consulta de recibo del laboratorio', descripcion: 'Este caso es sintético'
        } });
        await request('/api/admin/atencion/' + support.solicitud.id_solicitud, 200, { method: 'PATCH', token: admin.token,
            data: { estado: 'Respondida', respuesta: 'Respuesta sintética' } });
        assert.equal((await request('/api/atencion', 200, { token })).solicitudes[0].estado, 'Respondida');
        const detail = await request('/api/admin/usuarios/' + user.usuario.id_usuario, 200, { token: admin.token });
        assert.equal(detail.ultimas_incidencias[0].tiene_foto, true);
        console.log('OK incidencia, PNG, reintento de cambio, cortes, atención y detalle compuesto');

        const recovered = await mockCode('recovery-worker', 'recovery', async () => (await request('/api/auth/password-recovery/request', 202,
            { method: 'POST', data: { correo, solicitud_id: randomUUID() } })).solicitud_id);
        const permission = await request('/api/auth/password-recovery/verify', 200, { method: 'POST',
            data: { solicitud_id: recovered.id, codigo: recovered.code } });
        const newer = 'FixtureServices456';
        await Promise.all([
            nextEvent(socket, 'sesion:invalidada'),
            request('/api/auth/password-recovery/complete', 200, { method: 'POST',
                data: { solicitud_id: recovered.id, permiso: permission.permiso, password_nueva: newer, password_confirmacion: newer } })
        ]);
        await request('/api/me/recibos', 401, { token });
        const current = await login(supply, newer);
        console.log('OK recuperación con worker de correo independiente y revocación REST/Socket.IO');

        lifecycle('stop', 'operations');
        try {
            await request('/api/me/incidencias', 503, { token: current.token });
            await request('/api/me/recibos', 200, { token: current.token });
        } finally { lifecycle('start', 'operations'); }
        await until(async () => (await fetch(base + '/api/health')).ok, 'reanudación Operations');
        lifecycle('stop', 'realtime');
        let offlineReceipt;
        try {
            offlineReceipt = (await request('/api/admin/recibos', 201, { method: 'POST', token: admin.token,
                data: { ...receiptData, periodo: '2026-12' } })).recibo;
        } finally { lifecycle('start', 'realtime'); }
        await until(async () => (await fetch(base + '/api/health')).ok, 'reanudación Realtime');
        console.log('OK Realtime listo tras reinicio');
        const reconnected = await connect(current.token);
        try {
            await until(() => fixture('realtime', 'event', { receipt: offlineReceipt.id_recibo })?.delivered, 'eventos persistidos durante caída');
        } finally { reconnected.disconnect(); }
        console.log('OK caída aislada de Operations, escritura con Realtime detenido, reinicio y drenaje durable');
        lifecycle('stop', 'auth');
        try {
            await request('/api/cortes', 200);
            await request('/api/me/recibos', 503, { token: current.token });
        } finally { lifecycle('start', 'auth'); }
        await until(async () => (await fetch(base + '/api/health')).ok, 'reanudación Auth');
        await request('/api/me/recibos', 200, { token: current.token });
        console.log('OK Auth caído: ruta pública disponible, permisos cerrados y sesión recuperable al volver');

    } finally {
        socket.disconnect();
    }
}

if (require.main === module) main().catch(error => {
    const message = (error.code === 'ERR_ASSERTION' && !error.generatedMessage) || /^(Fixture |Tiempo agotado: |Evento ausente: )/.test(error.message) ? error.message : null;
    console.error('Falló el smoke del laboratorio en ' + (message || error.stack?.split('\n')[1]?.trim() || error.name));
    process.exitCode = 1;
});
