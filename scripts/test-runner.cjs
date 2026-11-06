'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const { root, groups, check } = require('./test-catalog.cjs');
function cleanEnvironment(parent = process.env) {
    return { PATH: parent.PATH || '', HOME: os.tmpdir(), TMPDIR: os.tmpdir(), NODE_PATH: parent.NODE_PATH || '',
        NODE_ENV: 'test', API_BASE_URL: 'https://api.example.invalid',
        NODE_OPTIONS: '--require=' + path.join(__dirname, 'test-network-guard.cjs'),
        PUSH_ENABLED: '0', PUSH_WORKER_ENABLED: '0', PUSH_REAL_DELIVERY_ALLOWED: '0', PUSH_REMINDERS_ENABLED: '0',
        EMAIL_WORKER_ENABLED: '0', PASSWORD_RECOVERY_REAL_DELIVERY_ALLOWED: '0' };
}
function runFiles(files, { env = cleanEnvironment(), report, coverage = false, direct = false } = {}) {
    const args = direct ? files : ['--test', '--test-reporter=tap', '--test-reporter-destination=stdout',
        ...(report ? ['--test-reporter=junit', '--test-reporter-destination=' + path.join(report, 'junit.xml')] : []),
        ...(coverage ? ['--experimental-test-coverage', '--test-coverage-include=**/Backend/**', '--test-coverage-include=**/Shared/**', '--test-coverage-include=**/scripts/**', '--test-coverage-include=**/capacitor.config.js', '--test-coverage-exclude=**/test/**', '--test-coverage-exclude=**/node_modules/**'] : []), ...files];
    const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit', timeout: 180000 });
    return result.status === null ? 1 : result.status;
}
async function main(argv = process.argv.slice(2)) {
    if (Number(process.versions.node.split('.')[0]) !== 22) throw Error('TEST-01 requiere Node 22 sin reemplazar Node global.');
    const [group = 'safe', ...flags] = argv;
    if (!['safe', ...Object.keys(groups)].includes(group) || flags.some(flag => !['--list', '--report', '--coverage'].includes(flag))) throw Error('Grupo/opción no permitido.');
    if (group === 'e2e' && flags.includes('--coverage')) throw Error('Cobertura de navegador requiere diseño separado; no confundir con V8 de Node.');
    const files = group === 'safe' ? [...groups.unit, ...groups.contract] : groups[group];
    check();
    if (flags.includes('--list')) { console.log(files.join('\n')); return 0; }
    const env = cleanEnvironment();
    if (group === 'integration') {
        const port = Number(process.env.HIDRO_EMAIL_TEST_DB_PORT);
        if (process.env.HIDRO_TEST_ISOLATED_DB !== '1' || !Number.isInteger(port) || port < 1 || port > 65535) throw Error('Integración exige PG18 NUEVO aislado, HIDRO_TEST_ISOLATED_DB=1 y HIDRO_EMAIL_TEST_DB_PORT. No usar producción.');
        const { createRequire } = require('node:module');
        const { Client } = createRequire(path.join(root, 'Backend/package.json'))('pg');
        const client = new Client({ host: '127.0.0.1', port, database: 'hm_email_test', user: 'hm_fixture', password: 'fixture-only-not-production', connectionTimeoutMillis: 3000 });
        try { await client.connect(); const r = await client.query("SELECT current_database() AS db,current_user AS role,current_setting('server_version_num') AS version");
            if (r.rows[0].db !== 'hm_email_test' || r.rows[0].role !== 'hm_fixture' || !r.rows[0].version.startsWith('18')) throw Error('Preflight de fixtures PG18 rechazado.');
        } finally { await client.end(); }
        env.HIDRO_EMAIL_TEST_DB_PORT = String(port);
    }
    if (group === 'e2e') {
        if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.HIDRO_PKG01_STATIC_ORIGIN || '')) throw Error('E2E requiere origen Nginx temporal verificado en loopback; no usar sitios reales.');
        env.HIDRO_PKG01_STATIC_ORIGIN = process.env.HIDRO_PKG01_STATIC_ORIGIN;
        // El servidor driver hace de proxy de origen local; nunca se ejecuta desde npm test.
        env.NODE_OPTIONS = '';
    }
    let report;
    if (flags.includes('--report') || flags.includes('--coverage')) {
        const parent = path.join(root, 'artifacts/tests'); fs.mkdirSync(parent, { recursive: true });
        report = fs.mkdtempSync(path.join(parent, group + '-'));
        if (flags.includes('--coverage')) env.NODE_V8_COVERAGE = path.join(report, 'v8');
    }
    const status = runFiles(files, { env, report, coverage: flags.includes('--coverage'), direct: group === 'e2e' });
    if (report) { let sha = null; try { sha = execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], { cwd: root, env, encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim(); } catch {}
        const sourceHashes = Object.fromEntries(['package.json','scripts/test-runner.cjs','scripts/test-catalog.cjs','scripts/test-network-guard.cjs'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
        fs.writeFileSync(path.join(report, 'run.json'), JSON.stringify({ sha, sourceHashes, node: process.version, group, files, status, coverage: flags.includes('--coverage'), scope: 'solo módulos cargados de esta suite; no cobertura global del producto' }, null, 2) + '\n'); console.log('Informe:', path.relative(root, report)); }
    return status;
}
if (require.main === module) main().then(code => { process.exitCode = code; }).catch(error => { console.error(error.message); process.exitCode = 2; });
module.exports = { main, runFiles, cleanEnvironment };
