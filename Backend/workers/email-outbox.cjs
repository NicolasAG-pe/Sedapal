'use strict';
const { Pool } = require('pg');
const { setTimeout: delay } = require('node:timers/promises');
const { obtenerConfiguracion } = require('../config');
const { obtenerClaveOutbox } = require('../outbox-crypto');
const { crearProcesadorOutbox } = require('../email-outbox');
const { configurarProveedorWorker, crearRemitenteProveedor } = require('../email-provider');
const HELP = 'Trabajador outbox desactivado por defecto. Uso: --once o --run. Requiere EMAIL_WORKER_ENABLED=1, EMAIL_WORKER_DATABASE_URL, EMAIL_WORKER_EXPECTED_DATABASE y EMAIL_OUTBOX_KEY privados. EMAIL_PROVIDER=resend (predeterminado) exige RESEND_API_KEY; gmail exige GMAIL_SENDER y GMAIL_CREDENTIALS_FILE (0600). No lee .env ni DATABASE_URL.\n';
const ERROR = 'Trabajador detenido por configuración o fallo interno. Revisar destino, clave, esquema y permisos privadamente.\n';

function configurar(env) {
    if (env.EMAIL_WORKER_ENABLED !== '1') throw new Error('Trabajador no habilitado.');
    const url = new URL(env.EMAIL_WORKER_DATABASE_URL || '');
    const expected = env.EMAIL_WORKER_EXPECTED_DATABASE;
    if (!expected || expected.includes('\0') || Buffer.byteLength(expected) > 63 || decodeURIComponent(url.pathname.slice(1)) !== expected) throw new Error('Destino inválido.');
    const { database } = obtenerConfiguracion({ DATABASE_URL: url.toString() });
    return { database, expected, key: obtenerClaveOutbox(env), ...configurarProveedorWorker(env) };
}
async function main(argv = process.argv.slice(2), env = process.env, { stdout = process.stdout, stderr = process.stderr } = {}) {
    if (!argv.length || (argv.length === 1 && argv[0] === '--help')) { stdout.write(HELP); return 0; }
    let pool, stop = false, failed = false;
    const stopHandler = () => { stop = true; };
    try {
        if (argv.length !== 1 || !['--once','--run'].includes(argv[0])) throw new Error('Modo inválido.');
        const config = configurar(env);
        pool = new Pool({ ...config.database, max: 2, connectionTimeoutMillis: 5000, statement_timeout: 10000,
            idle_in_transaction_session_timeout: 10000, application_name: 'hidro-email-outbox' });
        pool.on('error', () => { failed = true; stop = true; });
        if ((await pool.query('SELECT current_database() AS nombre')).rows[0].nombre !== config.expected) throw new Error('Destino incorrecto.');
        await pool.query('SELECT id FROM public.correo_outbox LIMIT 0');
        const worker = crearProcesadorOutbox({ pool, key: config.key,
            proveedor: config.provider, enviarCodigo: crearRemitenteProveedor(config) });
        process.on('SIGTERM', stopHandler); process.on('SIGINT', stopHandler);
        if (process.send) process.send({ event: 'email_worker_ready' });
        do {
            const result = await worker.procesarUno();
            if (['clave_incompatible', 'proveedor_incompatible'].includes(result.estado)) throw new Error('Configuración incompatible.');
            if (argv[0] === '--once' || result.estado !== 'vacio') stdout.write(JSON.stringify(result) + '\n');
            if (argv[0] === '--once') break;
            if (!stop && result.estado === 'vacio') await delay(1000);
        } while (!stop);
    } catch (_) { failed = true; }
    finally {
        process.removeListener('SIGTERM', stopHandler); process.removeListener('SIGINT', stopHandler);
        if (pool) await pool.end().catch(() => { failed = true; });
    }
    if (failed) stderr.write(ERROR);
    return failed ? 1 : 0;
}
if (require.main === module) main().then(code => { process.exitCode = code; })
    .catch(() => { process.stderr.write(ERROR); process.exitCode = 1; });
module.exports = { main, configurar, ERROR };
