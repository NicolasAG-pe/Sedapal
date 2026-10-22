'use strict';
const { Pool } = require('pg');
const { obtenerConfiguracion } = require('../config');
const { limpiarRegistrosCorreo, validarOpciones } = require('../email-cleanup');

const HELP = `Mantenimiento de verificación: un lote, simulación por defecto.
Uso: node Backend/maintenance/email-cleanup.cjs [--dry-run | --apply]
       [--retention-hours 24..8760] [--batch-size 1..1000]
Entorno privado obligatorio: EMAIL_MAINTENANCE_DATABASE_URL y
EMAIL_MAINTENANCE_EXPECTED_DATABASE. No lee .env ni DATABASE_URL.
No instala programación automática. --apply exige autorización del destino.
`;
const ERROR = 'Mantenimiento no completado. Revisa opciones, destino privado, permisos, esquema y bloqueos; no compartas credenciales ni errores SQL.';

function parseArgs(argv) {
    if (argv.length === 1 && argv[0] === '--help') return { help: true };
    const options = {}, seen = new Set();
    for (let n = 0; n < argv.length; n++) {
        const flag = argv[n];
        if (seen.has(flag)) throw new Error('Opción duplicada.');
        seen.add(flag);
        if (flag === '--apply' || flag === '--dry-run') {
            if ('dryRun' in options) throw new Error('Modo contradictorio.');
            options.dryRun = flag === '--dry-run';
        } else if (flag === '--retention-hours' || flag === '--batch-size') {
            const value = argv[++n];
            if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) throw new Error('Valor inválido.');
            options[flag === '--retention-hours' ? 'retentionHours' : 'batchSize'] = Number(value);
        } else throw new Error('Opción desconocida.');
    }
    return validarOpciones(options);
}

function configurarDestino(env) {
    const raw = String(env.EMAIL_MAINTENANCE_DATABASE_URL || '').trim();
    const expected = String(env.EMAIL_MAINTENANCE_EXPECTED_DATABASE || '').trim();
    if (!raw || !expected || Buffer.byteLength(expected) > 63 || expected.includes('\0')) {
        throw new Error('Destino privado obligatorio.');
    }
    const url = new URL(raw);
    if (decodeURIComponent(url.pathname.slice(1)) !== expected) throw new Error('Destino no coincide.');
    // Reutiliza validación PostgreSQL/TLS; no hereda configuración de la API.
    const { database } = obtenerConfiguracion({ DATABASE_URL: raw });
    return { database, expected };
}

async function main(argv = process.argv.slice(2), env = process.env,
    { stdout = process.stdout, stderr = process.stderr } = {}) {
    let pool, result, failed = false;
    try {
        const options = parseArgs(argv);
        if (options.help) { stdout.write(HELP); return 0; }
        const { database, expected } = configurarDestino(env);
        pool = new Pool({ ...database, max: 1, connectionTimeoutMillis: 5000,
            statement_timeout: 10000, lock_timeout: 1000, idle_in_transaction_session_timeout: 15000,
            application_name: 'hidro-email-maintenance' });
        // Nunca permitir que un error de conexión ociosa imprima objetos privados.
        pool.on('error', () => { failed = true; });
        const { rows: [actual] } = await pool.query('SELECT current_database() AS nombre');
        if (actual.nombre !== expected) throw new Error('Base conectada no coincide.');
        result = await limpiarRegistrosCorreo(pool, options);
    } catch (_) { failed = true; }
    finally {
        if (pool) await pool.end().catch(() => { failed = true; });
    }
    if (failed) { stderr.write(ERROR + '\n'); return 1; }
    stdout.write(JSON.stringify(result) + '\n');
    return 0;
}

if (require.main === module) main().then(code => { process.exitCode = code; })
    .catch(() => { process.stderr.write(ERROR + '\n'); process.exitCode = 1; });
module.exports = { main, parseArgs, configurarDestino, ERROR };
