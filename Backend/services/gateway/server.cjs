'use strict';
const http = require('node:http');
const https = require('node:https');
const { isIP } = require('node:net');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { obtenerConfiguracion } = require('../../config');
const { AUTH_CONTRACT } = require('../../auth-contract');
const { domains, destination } = require('./routes.cjs');
const { listen } = require('../runtime.cjs');

function configuration(env) {
    return Object.fromEntries(domains.map(([name]) => {
        const origin = new URL(env[name.toUpperCase() + '_URL']);
        if (!['http:', 'https:'].includes(origin.protocol) || origin.href !== origin.origin + '/' ||
            (origin.protocol === 'http:' && env.GATEWAY_ALLOW_LOCAL_HTTP !== '1')) throw Error('Origen inválido de ' + name);
        return [name, origin];
    }));
}
const requestHeaders = ['authorization', 'content-type', 'content-length', 'origin',
    'x-hidro-auth-contract', 'accept', 'accept-encoding', 'if-none-match', 'if-modified-since',
    'sec-websocket-key', 'sec-websocket-version', 'sec-websocket-extensions', 'sec-websocket-protocol'];
const responseHeaders = ['content-type', 'content-length', 'content-encoding', 'cache-control', 'etag', 'last-modified',
    'vary', 'retry-after', 'ratelimit', 'ratelimit-limit', 'ratelimit-policy', 'ratelimit-remaining', 'ratelimit-reset'];
function pick(headers, names) {
    return Object.fromEntries(names.filter(name => headers[name] !== undefined).map(name => [name, headers[name]]));
}
function requestUpstream(req, origin, trustIngress, extra = {}) {
    const clientIp = trustIngress && isIP(req.headers['x-real-ip']) ? req.headers['x-real-ip'] : req.socket.remoteAddress;
    return (origin.protocol === 'https:' ? https : http).request(origin, { path: req.url, method: req.method,
        headers: { ...pick(req.headers, requestHeaders), 'x-forwarded-for': clientIp, ...extra } });
}

function createGateway({ origins, allowedOrigins, trustIngress = false }) {
    const app = express();
    app.disable('x-powered-by');
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cors({ origin: (value, done) => done(null, !value || allowedOrigins.includes(value)),
        methods: ['GET', 'POST', 'PATCH', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'X-Hidro-Auth-Contract'],
        maxAge: 600, credentials: true }));
    async function check() {
        const results = await Promise.all(Object.values(origins).map(async origin => {
            try {
                const r = await fetch(new URL('/ready', origin), { signal: AbortSignal.timeout(2500), redirect: 'error' });
                await r.body?.cancel();
                return r.ok;
            } catch (_) { return false; }
        }));
        return results.every(Boolean);
    }
    app.get('/live', (_req, res) => res.json({ service: 'gateway', status: 'ok' }));
    app.get('/ready', async (_req, res) => {
        const ready = await check();
        res.status(ready ? 200 : 503).json({ service: 'gateway', status: ready ? 'ok' : 'degraded' });
    });
    app.get('/api/health', async (_req, res) => {
        if (!(await check())) return res.status(500).json({ estado: 'error', mensaje: 'No se pudo conectar con el servicio' });
        res.json({ estado: 'ok', mensaje: 'Servicio de Hidro Mejora operativo', auth_contract: AUTH_CONTRACT, fecha: new Date() });
    });
    app.use((req, res, next) => {
        const name = destination(req.path);
        if (!name || !req.url.startsWith('/') || req.url.startsWith('//')) return next();
        const proxy = requestUpstream(req, origins[name], trustIngress);
        const unavailable = () => {
            if (res.headersSent) return res.destroy();
            res.status(503).json({ estado: 'error', codigo: name === 'auth' ? 'AUTH_UNAVAILABLE' : 'SERVICE_UNAVAILABLE',
                mensaje: 'Servicio temporalmente no disponible.' });
        };
        proxy.setTimeout(name === 'realtime' ? 35000 : 15000, () => proxy.destroy(Error('upstream timeout')));
        proxy.once('error', unavailable);
        proxy.on('response', upstream => {
            if (!upstream.statusCode) { upstream.resume(); return unavailable(); }
            res.status(upstream.statusCode).set(pick(upstream.headers, responseHeaders));
            upstream.once('error', unavailable);
            upstream.pipe(res);
        });
        req.on('error', () => proxy.destroy());
        res.on('close', () => { if (!res.writableEnded) proxy.destroy(); });
        req.pipe(proxy);
    });

    const server = http.createServer(app);
    const tunnels = new Set();
    server.on('upgrade', (req, socket, head) => {
        if (destination(req.url.split('?')[0]) !== 'realtime' || req.headers.upgrade?.toLowerCase() !== 'websocket' ||
            (req.headers.origin && !allowedOrigins.includes(req.headers.origin))) return socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        const proxy = requestUpstream(req, origins.realtime, trustIngress, { connection: 'Upgrade', upgrade: 'websocket' });
        proxy.setTimeout(5000, () => proxy.destroy(Error('upgrade timeout')));
        proxy.once('error', () => socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'));
        proxy.once('response', response => {
            response.resume();
            socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        });
        socket.on('error', () => proxy.destroy());
        proxy.once('upgrade', (response, upstream, buffered) => {
            if (socket.destroyed) return upstream.destroy();
            proxy.setTimeout(0);
            const headers = pick(response.headers, ['upgrade', 'connection', 'sec-websocket-accept', 'sec-websocket-extensions', 'sec-websocket-protocol']);
            socket.write('HTTP/1.1 101 Switching Protocols\r\n' +
                Object.entries(headers).map(([name, value]) => name + ': ' + value + '\r\n').join('') + '\r\n');
            if (buffered.length) socket.write(buffered);
            if (head.length) upstream.write(head);
            tunnels.add(socket);
            socket.on('close', () => { tunnels.delete(socket); upstream.destroy(); });
            upstream.on('error', () => socket.destroy());
            upstream.on('close', () => socket.destroy());
            socket.pipe(upstream).pipe(socket);
        });
        proxy.end();
    });
    return { server, stop() {
        for (const socket of tunnels) socket.destroy();
        return new Promise(resolve => server.close(resolve));
    } };
}
if (require.main === module) {
    const { port, origenes } = obtenerConfiguracion();
    const gateway = createGateway({ origins: configuration(process.env), allowedOrigins: origenes,
        trustIngress: process.env.GATEWAY_TRUST_INGRESS === '1' });
    listen('gateway', gateway.server, port, gateway.stop);
}
module.exports = { createGateway, configuration };
