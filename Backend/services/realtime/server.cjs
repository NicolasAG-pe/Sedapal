'use strict';
const http = require('node:http');
const { Server } = require('socket.io');
const { obtenerConfiguracion } = require('../../config');
const introspection = require('../auth/internal-transport.cjs');
const { poolFor, listen, log } = require('../runtime.cjs');

function createRealtime({ pool, inspect, origins }) {
    const permitted = origin => !origin || origins.includes(origin);
    let stopping = false;
    const httpServer = http.createServer((req, res) => {
        async function health() {
            let ready = !stopping;
            if (req.url === '/ready') {
                try { await pool.query('SELECT 1 FROM hm_contract.events LIMIT 0'); }
                catch (_) { ready = false; }
            }
            res.writeHead(['/live', '/ready'].includes(req.url) ? (ready ? 200 : 503) : 404,
                { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ service: 'realtime', status: ready ? 'ok' : 'degraded' }));
        }
        void health();
    });
    const io = new Server(httpServer, {
        path: '/socket.io/',
        cors: { origin: (value, done) => done(null, permitted(value)), credentials: true },
        allowRequest: (req, done) => done(null, permitted(req.headers.origin))
    });
    io.use(async (socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token || typeof token !== 'string') return next(Error('Autenticación requerida.'));
        const identity = await inspect(token);
        if (!identity) return next(Error('Autenticación requerida.'));
        socket.data.token = token;
        socket.data.identity = identity;
        next();
    });
    function revoke(socket) {
        socket.emit('sesion:invalidada', { motivo: 'credenciales' });
        socket.disconnect(true);
    }
    async function checkSession(socket) {
        const current = await inspect(socket.data.token), before = socket.data.identity;
        if (!current || current.rol !== before.rol || current.id_suministro !== before.id_suministro ||
            current.id_usuario !== before.id_usuario || current.mfa_version !== before.mfa_version) {
            revoke(socket);
            return false;
        }
        return socket.connected;
    }
    async function checkAll(sockets) {
        for (let i = 0; i < sockets.length; i += 16) await Promise.all(sockets.slice(i, i + 16).map(checkSession));
    }
    io.on('connection', async socket => {
        const user = socket.data.identity;
        try {
            await socket.join('auth-revocacion:' + user.id_usuario);
            if (!(await checkSession(socket))) return;
            await socket.join(['authenticated', ...(user.rol === 'admin' ? ['admins'] :
                user.id_suministro ? ['suministro:' + user.id_suministro] : [])]);
            socket.emit(user.rol === 'admin' ? 'pago:nuevo' : 'pago:registrado', { sincronizacion: true });
        } catch (_) { socket.disconnect(true); }
    });
    let consuming = null, checking = null;
    async function poll() {
        let client;
        try {
            client = await pool.connect();
            await client.query('BEGIN');
            const { rows } = await client.query(`SELECT id,room,kind,payload FROM hm_contract.events
                WHERE delivered_at IS NULL ORDER BY id LIMIT 40 FOR UPDATE SKIP LOCKED`);
            for (const event of rows) {
                if (event.kind === 'auth:revalidar') {
                    const ids = io.sockets.adapter.rooms.get(event.room) || [];
                    await checkAll([...ids].map(id => io.sockets.sockets.get(id)).filter(Boolean));
                } else io.to(event.room).emit(event.kind, event.payload);
            }
            if (rows.length) await client.query('UPDATE hm_contract.events SET delivered_at=clock_timestamp() WHERE id=ANY($1::bigint[])',
                [rows.map(row => row.id)]);
            await client.query('COMMIT');
        } catch (error) {
            if (client) await client.query('ROLLBACK').catch(() => {});
            log('realtime', 'event_poll_error', error.code);
            // Sin acceso a las revocaciones persistidas, se cierra la sesión activa.
            io.disconnectSockets(true);
        } finally { client?.release(); }
    }
    const timer = setInterval(() => {
        if (!consuming) consuming = poll().finally(() => { consuming = null; });
    }, 250);
    const recheck = setInterval(() => {
        if (!checking) checking = checkAll([...io.sockets.sockets.values()]).finally(() => { checking = null; });
    }, 5000);
    return { server: httpServer, async stop() {
        stopping = true;
        clearInterval(timer);
        clearInterval(recheck);
        await new Promise(resolve => io.close(resolve));
        await Promise.all([consuming, checking]);
        await pool.end();
    } };
}
if (require.main === module) {
    const { port, origenes } = obtenerConfiguracion();
    const realtime = createRealtime({ pool: poolFor('realtime'), origins: origenes,
        inspect: introspection.createIntrospector(introspection.configuration(process.env)) });
    listen('realtime', realtime.server, port, realtime.stop);
}
module.exports = { createRealtime };
