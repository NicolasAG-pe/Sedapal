'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function readApiBase(target, env = process.env) {
    if (!['web', 'android', 'admin'].includes(target)) throw new Error('Destino inválido: web, android o admin.');
    const file = path.join(root, { web: '.env.frontend', android: '.env.android', admin: '.env.admin' }[target]);
    let value = env.API_BASE_URL;
    if (value === undefined && fs.existsSync(file)) {
        // Leer solo esta clave pública; no ejecutar ni exportar el archivo .env.
        const line = fs.readFileSync(file, 'utf8').split(/\r?\n/)
            .find(line => /^\s*API_BASE_URL\s*=/.test(line));
        if (line) {
            value = line.slice(line.indexOf('=') + 1).trim();
            if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
        }
    }
    value = String(value || '').trim();
    if (!value) {
        if (target === 'android') throw new Error('Configura API_BASE_URL en .env.android o en el entorno antes de sincronizar Android.');
        return '';
    }
    let url;
    try { url = new URL(value); } catch (_) { throw new Error('API_BASE_URL debe ser un origen HTTP(S) válido.'); }
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname);
    if (url.protocol !== 'https:' && !localHttp) throw new Error('API_BASE_URL externo requiere HTTPS. HTTP se permite solo para desarrollo local.');
    if (url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
        throw new Error('API_BASE_URL debe contener solo protocolo, host y puerto; sin secretos, rutas ni parámetros.');
    }
    if (url.hostname.endsWith('.trycloudflare.com')) throw new Error('Configura una API estable o local, sin Quick Tunnel.');
    return url.origin;
}

module.exports = { readApiBase, root };
