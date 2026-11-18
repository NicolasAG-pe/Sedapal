'use strict';
const http = require('node:http');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const { obtenerConfiguracion } = require('../config');
const introspection = require('./auth/internal-transport.cjs');

function log(service, event, code) {
    console.error(JSON.stringify({ service, event, ...(code ? { code } : {}) }));
}

function poolFor(service, env = process.env) {
    const { database } = obtenerConfiguracion(env);
    const pool = new Pool({ ...database, application_name: 'hidro-' + service,
        connectionTimeoutMillis: 2500, statement_timeout: 10000, idle_in_transaction_session_timeout: 10000 });
    pool.on('error', error => log(service, 'pool_error', error.code));
    return pool;
}

function sessionMiddleware(env) {
    const inspect = introspection.createIntrospector(introspection.configuration(env), { detailed: true });
    async function requiereAuth(req, res, next) {
        const token = /^Bearer ([^ ]+)$/.exec(req.headers.authorization || '')?.[1];
        const session = token ? await inspect(token) : { motivo: 'invalido' };
        if (session.identidad) {
            // Conservar el tipo BIGINT que devolvían los contratos públicos.
            req.user = { ...session.identidad, id_usuario: String(session.identidad.id_usuario),
                id_suministro: session.identidad.id_suministro === null ? null : String(session.identidad.id_suministro) };
            return next();
        }
        if (session.motivo === 'unavailable') return res.status(503).json({
            estado: 'error', codigo: 'AUTH_UNAVAILABLE', mensaje: 'Autenticación temporalmente no disponible.'
        });
        const blocked = ['desconocido', 'inactivo'].includes(session.motivo);
        return res.status(blocked ? 403 : 401).json({ estado: 'error', codigo: 'SESSION_REAUTH_REQUIRED',
            mensaje: blocked ? 'Acceso denegado.' : session.motivo === 'sesion' ?
                'Inicia sesión nuevamente para verificar tu cuenta.' : 'Autenticación requerida.' });
    }
    function requiereAdmin(req, res, next) {
        return requiereAuth(req, res, () => req.user.rol === 'admin' ? next() :
            res.status(403).json({ estado: 'error', mensaje: 'Acceso denegado.' }));
    }
    return { requiereAuth, requiereAdmin };
}

function limitadorGenerico(max, minutes) {
    return rateLimit({ windowMs: minutes * 60000, max, standardHeaders: true, legacyHeaders: false,
        message: { estado: 'error', mensaje: 'Demasiadas solicitudes. Intenta nuevamente más tarde.' } });
}

function createDomain(name, registerRoutes, tables, env = process.env) {
    const app = express(), pool = poolFor(name, env);
    const { requiereAuth, requiereAdmin } = sessionMiddleware(env);
    app.disable('x-powered-by');
    app.set('trust proxy', 1);
    app.use(express.json({ limit: '3mb' }));
    registerRoutes(app, {
        pool, requiereAuth, requiereAdmin, limitadorGenerico, sharedStorage: true,
        limiteOperacionesSensibles: limitadorGenerico(60, 15),
        puedeVerSuministro: (req, supply) => req.user.rol === 'admin' || String(req.user.numero_suministro || '') === String(supply || ''),
        // Los triggers publican eventos en la misma transacción que el cambio.
        emitirASuministro() {}, emitirAAdmins() {}, emitirAAutenticados() {},
        crearNotificacion: name === 'operations' ? async ({ id_suministro, alcance, titulo, mensaje, tipo }) =>
            (await pool.query('SELECT hm_contract.operations_notice($1,$2,$3,$4,$5) AS id',
                [id_suministro ?? null, alcance, titulo, mensaje, tipo])).rows[0].id : () => null
    });
    app.get('/live', (_req, res) => res.json({ service: name, status: 'ok' }));
    app.get('/ready', async (_req, res) => {
        try {
            for (const table of tables) await pool.query('SELECT 1 FROM ' + table + ' LIMIT 0');
            res.json({ service: name, status: 'ok' });
        } catch (_) { res.status(503).json({ service: name, status: 'degraded' }); }
    });
    return { app, pool };
}

function listen(name, server, port, dispose) {
    server.requestTimeout = 30000;
    server.headersTimeout = 12000;
    server.on('error', error => { log(name, 'listen_error', error.code); process.exitCode = 1; });
    let stopping = false;
    function stop() {
        if (stopping) return;
        stopping = true;
        const deadline = setTimeout(() => process.exit(1), 20000);
        deadline.unref();
        Promise.resolve().then(dispose).then(() => clearTimeout(deadline), () => { process.exitCode = 1; });
    }
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
    server.listen(port, '0.0.0.0', () => console.log(JSON.stringify({ service: name, event: 'ready' })));
}

function runDomain(name, registerRoutes, tables) {
    const { port } = obtenerConfiguracion();
    const { app, pool } = createDomain(name, registerRoutes, tables);
    const server = http.createServer(app);
    listen(name, server, port, async () => {
        await new Promise(resolve => server.close(resolve));
        await pool.end();
    });
}
module.exports = { poolFor, sessionMiddleware, createDomain, listen, runDomain, log };
