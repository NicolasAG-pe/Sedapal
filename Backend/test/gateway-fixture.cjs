'use strict';
// Exclusivo de pruebas: la base la crea nuevaBase; correo .invalid simulado.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { fork } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');
const { createSender } = require('../notification-transport');
const { sql } = require('./email-schema.cjs');
const { createRecoveryWorker } = require('../password-recovery-worker');
const C = require('../password-recovery-crypto');
global.WebSocket = require('ws');
const { io } = require('../../Frontend/assets/vendor/socket.io.min.js');
const deadline = promise => Promise.race([promise, new Promise((_, reject) => {
    const timer = setTimeout(() => reject(Error('Fixture excedió el plazo')), 10000); timer.unref();
})]);

exports.start = async ({ t, env, db, authBase }) => {
    await db.query(sql('migrations/012_notificaciones_push.sql'));
    const reserve = net.createServer(); await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
    const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
    const secret = crypto.randomBytes(32).toString('hex');
    let child, exited, logs = '';
    async function launch() {
        child = fork(path.resolve(__dirname, '../services/notifications/server.cjs'), [], { silent: true, env: {
            PATH: process.env.PATH, NODE_ENV: 'test', PORT: String(port), EMAIL_PROVIDER: 'resend',
            NOTIFICATIONS_INTERNAL_SECRET: secret, NOTIFICATIONS_DELIVERY_MODE: 'stub'
        } });
        child.stdout.on('data', b => { logs += b; }); child.stderr.on('data', b => { logs += b; });
        exited = new Promise(resolve => child.once('exit', resolve));
        await deadline(Promise.race([new Promise(resolve => child.once('message', resolve)), exited.then(() => { throw Error('Notifications no arrancó'); })]));
    }
    t.after(async () => { if (child.exitCode === null) child.kill('SIGTERM'); await exited; assert.equal(logs.includes(secret), false); });
    await launch();
    Object.assign(process.env, env, { AUTH_SERVICE_URL: authBase });
    const backend = require('../server');
    await new Promise(resolve => backend.httpServer.listen(0, '127.0.0.1', resolve));
    t.after(async () => { await new Promise(resolve => backend.io.close(resolve)); await backend.pool.end(); });
    const base = 'http://127.0.0.1:' + backend.httpServer.address().port;
    const send = createSender({ url: 'http://127.0.0.1:' + port, secret }, 'resend');
    let disconnected;
    return { base,
        sender: messages => async job => {
            const result = await send(job), message = JSON.parse(job.mensaje);
            assert.match(result.id, /^stub-/);
            messages.push({ correo: message.to[0], codigo: message.text.match(/: (\d{6})/)[1] });
            return result;
        },
        outage: async worker => {
            child.kill('SIGTERM'); assert.equal(await exited, 0);
            assert.equal((await worker.procesarUno()).estado, 'reintento');
            assert.equal((await fetch(base + '/api/health')).status, 200);
            await launch(); await db.query("UPDATE correo_outbox SET disponible_en=clock_timestamp() WHERE estado='reintento'");
        },
        connect: async token => {
            const socket = io(base, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
            t.after(() => socket.disconnect());
            disconnected = new Promise(resolve => socket.once('disconnect', resolve));
            await deadline(new Promise((resolve, reject) => { socket.once('pago:registrado', resolve); socket.once('connect_error', reject); }));
        },
        disconnected: () => deadline(disconnected),
        business: async ({ request, token, idUsuario, suministro }) => {
            assert.equal((await request('/api/admin/usuarios', { token })).res.status, 403);
            assert.equal((await request('/api/recibos/999999999', { token })).res.status, 403);
            await db.query(`INSERT INTO recibos(id_suministro,periodo,fecha_emision,fecha_vencimiento,monto,consumo_m3,estado)
                SELECT id_suministro,'2026-11','2026-11-01','2026-11-30',42.50,12,'Pendiente' FROM suministros WHERE id_usuario=$1`, [idUsuario]);
            const receipts = await request('/api/recibos/' + suministro, { token });
            assert.equal(receipts.res.status, 200); assert.match(JSON.stringify(receipts.data), /42.50/);
            for (const route of ['/api/pagos/config', '/api/me/operaciones-pago', '/api/cortes/' + suministro]) assert.equal((await request(route, { token })).res.status, 200);
            const { PNG } = require('pngjs'); const photo = new PNG({ width: 12, height: 12 }); photo.data.fill(255);
            const incident = await request('/api/incidencias', { metodo: 'POST', token, cuerpo: {
                tipo: 'Fuga', descripcion: 'Incidencia sintética de integración', referencia: 'Laboratorio aislado',
                foto_base64: 'data:image/png;base64,' + PNG.sync.write(photo).toString('base64'), foto_mime: 'image/png'
            } });
            assert.equal(incident.res.status, 201);
            assert.equal((await request('/api/me/incidencias/' + incident.data.incidencia.id_incidencia + '/seguimiento', { token })).res.status, 200);
        },
        recovery: async ({ request, cuenta, token }) => {
            const pending = await request('/api/auth/password-recovery/request', { metodo: 'POST', cuerpo: { correo: cuenta.correo, solicitud_id: crypto.randomUUID() } });
            assert.equal(pending.res.status, 202);
            const job = (await db.query('SELECT * FROM recuperacion_clave_outbox WHERE solicitud_id=$1', [pending.data.solicitud_id])).rows[0];
            const message = JSON.parse(C.open(job.payload, Buffer.from(env.PASSWORD_RECOVERY_OUTBOX_KEY, 'base64'), job.id, job.solicitud_id));
            assert.equal((await createRecoveryWorker({ pool: db, env, enviarCodigo: send }).procesarUno()).estado, 'aceptado');
            const verified = await request('/api/auth/password-recovery/verify', { metodo: 'POST', cuerpo: { solicitud_id: pending.data.solicitud_id, codigo: message.text.match(/: (\d{8})/)[1] } });
            assert.equal(verified.res.status, 200);
            const completed = await request('/api/auth/password-recovery/complete', { metodo: 'POST', cuerpo: {
                solicitud_id: pending.data.solicitud_id, permiso: verified.data.permiso,
                password_nueva: 'FixtureRecovered123', password_confirmacion: 'FixtureRecovered123'
            } });
            assert.equal(completed.res.status, 200);
            assert.equal((await request('/api/auth/session', { token })).res.status, 401);
        }
    };
};
