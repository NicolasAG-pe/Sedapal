'use strict';

function obtenerConfiguracion(env = process.env) {
    const port = Number(env.PORT || 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('PORT debe ser un entero entre 1 y 65535.');
    }

    const produccion = String(env.NODE_ENV || '').toLowerCase() === 'production';
    const origenes = String(env.CORS_ALLOWED_ORIGINS || '').split(',')
        .map(origen => origen.trim()).filter(Boolean);
    // El WebView usa https://localhost en producción y http://localhost
    // para las pruebas de desarrollo con Docker desde el emulador.
    if (!produccion) origenes.push('http://localhost:8080', 'http://localhost:8081', 'https://localhost', 'http://localhost');
    for (const origen of origenes) {
        let url;
        try { url = new URL(origen); } catch (_) {
            throw new Error('CORS_ALLOWED_ORIGINS debe contener orígenes HTTP(S) separados por comas.');
        }
        if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origen) {
            throw new Error('Cada origen CORS debe incluir solo protocolo, host y puerto, sin rutas.');
        }
    }

    let database;
    if (String(env.DATABASE_URL || '').trim()) {
        let url;
        try { url = new URL(env.DATABASE_URL); } catch (_) {
            // No incluir la URL en el error: contiene credenciales.
            throw new Error('DATABASE_URL no es una URL PostgreSQL válida.');
        }
        if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
            throw new Error('DATABASE_URL debe utilizar postgres:// o postgresql://.');
        }
        const local = ['db', 'localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        // SSL en proveedores externos, con validación de certificado y host.
        // Se configura en la URL para evitar que pg sobrescriba un objeto ssl.
        if (!local) {
            url.searchParams.set('sslmode', 'verify-full');
            url.searchParams.delete('ssl');
            url.searchParams.delete('uselibpqcompat');
        } else if (!url.searchParams.has('sslmode')) {
            url.searchParams.set('sslmode', 'disable');
        }
        database = { connectionString: url.toString() };
    } else {
        database = {
            host: env.DB_HOST || 'db',
            port: Number(env.DB_PORT || 5432),
            database: env.POSTGRES_DB,
            user: env.POSTGRES_USER,
            password: env.POSTGRES_PASSWORD,
            ssl: false
        };
    }

    return { port, origenes: [...new Set(origenes)], database };
}

module.exports = { obtenerConfiguracion };
