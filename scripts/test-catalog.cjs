'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const groups = {
    unit: [
        'Backend/test/config.test.js', 'Backend/test/email-cleanup.test.js', 'Backend/test/email-gmail.test.js',
        'Backend/test/email-live.test.js', 'Backend/test/email-otp.test.js', 'Backend/test/email-outbox.test.js',
        'Backend/test/email-resend.test.js', 'Backend/test/receipt-date.test.js', 'Backend/test/start.test.cjs',
        'Backend/test/totp-crypto.test.js', 'Backend/test/push-credentials.cjs',
        'scripts/test/client-session.test.cjs', 'scripts/test/realtime.test.cjs', 'scripts/test/registration-state.test.cjs',
        'scripts/test/secure-session.test.cjs', 'scripts/test/ui-money.test.cjs', 'scripts/test/hidrobot.test.cjs',
        'scripts/test/identity-palette.test.cjs', 'scripts/test/android-release-signing.test.cjs',
        'scripts/test/firebase-lab.cjs', 'scripts/test/firebase-release.cjs', 'scripts/test/test-runner.test.cjs'
    ],
    contract: ['scripts/test/public-api-config.test.js', 'scripts/test/android-upgrade.test.cjs', 'scripts/test/client-packaging.test.cjs'],
    integration: ['Backend/test/receipt-profile-compat.cjs', 'Backend/test/payment-production-compat.cjs',
        'Backend/test/quality-migrations.cjs', 'Backend/test/receipt-concurrency.cjs', 'Backend/test/receipt-schema.cjs'],
    e2e: ['scripts/test/client-packaging-browser.cjs']
};
function files() {
    return ['Backend/test', 'scripts/test'].flatMap(folder => fs.readdirSync(path.join(root, folder), { withFileTypes: true })
        .filter(entry => entry.isFile()).map(entry => folder + '/' + entry.name)).sort();
}
function inventory() {
    const names = files(), sources = Object.fromEntries(names.map(name => [name, fs.readFileSync(path.join(root, name), 'utf8')]));
    const scripts = require('../package.json').scripts;
    const legacy = Object.entries(scripts).filter(([, command]) => !command.includes('test-runner.cjs') && !command.includes('test-catalog.cjs'));
    function matches(command, name) {
        return command.split(/\s+/).some(token => {
            if (!token.includes('/')) return false;
            const pattern = token.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
            return new RegExp('^' + pattern + '$').test(name);
        });
    }
    const entries = names.map(name => {
        const source = sources[name], group = Object.keys(groups).find(g => groups[g].includes(name)) || null;
        const dependencies = [...new Set([...source.matchAll(/require\(["']([^"']+)["']/g)].map(m => m[1]))];
        let type = group === 'contract' ? 'contrato' : group === 'unit' ? 'unitaria' : null;
        if (!type) type = name === 'scripts/test/close-native-fixture.cjs' ? 'helper'
            : name === 'scripts/test/close-native-fixture.test.cjs' ? 'integracion/loopback'
            : name === 'Backend/test/email-live.cjs' ? 'live'
            : /native|android-pdf-viewer/.test(name) ? 'Android/dispositivo'
                : /restore|downgrade|preproduccion|backend-docker|backend-history|h03-baseline|release-image/.test(name) ? 'manual/historica'
                    : /flow|browser|visual|navigation|two-factor-ui|admin-e2e|android-transition/.test(name) ? 'E2E/navegador'
                        : /fixture|checks/.test(name) ? 'helper'
                            : name.startsWith('Backend/') || /k8s|close-native-fixture.test/.test(name) ? 'integracion' : source.includes('node:test') ? 'unitaria/suplementaria' : 'manual/revision';
        const tools = ['Node22', ...new Set(dependencies.filter(d => !d.startsWith('.') && !d.startsWith('/') && !d.startsWith('node:') && !['fs','path','crypto','http','net','vm','os','assert'].includes(d)))];
        if (/nuevaBase|email-api|HIDRO_EMAIL_TEST_DB_PORT/.test(source)) tools.push('PostgreSQL sintetico/fixture');
        if (/playwright|chromium/.test(source)) tools.push('Playwright/Chromium externo al lockfile');
        if (/firefox/.test(source)) tools.push('Firefox y origen Nginx aislado');
        if (/adb|native/.test(name)) tools.push('Android SDK/dispositivo/fixture');
        if (/execFileSync\(['"]git/.test(source)) tools.push('historial Git y tags');
        if (/pdftotext|pdfinfo/.test(source)) tools.push('Poppler');
        if (/docker|kubectl|pg_dump|pg_restore/.test(source)) tools.push('herramientas opt-in indicadas en fuente');
        const risk = group === 'unit' || group === 'contract' ? 'revisada: mocks/archivos temporales/loopback; guard de red'
            : group === 'integration' ? 'opt-in: crea bases hijas y modifica exclusivamente fixtures PG18'
                : group === 'e2e' ? 'opt-in: HTTP local/Firefox con API sintetica'
                    : type === 'live' ? 'ALTO: puede enviar correo real; fuera de runner'
                        : /restore|preproduccion|backend-docker|runtime.cjs/.test(name) ? 'ALTO opt-in: verificar backups/contenedores/destino antes de ejecutar; fuera de runner'
                            : 'NO ejecutada por runner: revisar herramientas, destinos y efectos del archivo/helper antes de uso';
        return { path: name, sha256: crypto.createHash('sha256').update(source).digest('hex'), type, group,
            nodeTest: source.includes('node:test'), requirements: tools, dependencies,
            environmentNames: [...new Set([...source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)].map(m => m[1]))].sort(),
            legacyNpm: legacy.filter(([, c]) => matches(c, name)).map(([key]) => key),
            referencedBy: names.filter(other => other !== name && [...sources[other].matchAll(/require\(["']([^"']+)["']/g)].some(m => {
                if (!m[1].startsWith('.')) return false;
                const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(other), m[1]));
                return [resolved, resolved + '.js', resolved + '.cjs'].includes(name);
            })), risk };
    });
    const byHash = new Map(); for (const e of entries) byHash.set(e.sha256, [...(byHash.get(e.sha256) || []), e.path]);
    return { schemaVersion: 1, base: '162e2d8', groups, entries,
        exactDuplicates: [...byHash.values()].filter(list => list.length > 1),
        alias: { 'scripts/test/yape-pilot-flow.cjs': 'scripts/test/payment-audit-flow.cjs' },
        overlappingLegacy: entries.filter(e => e.legacyNpm.length > 1).map(e => ({ path: e.path, scripts: e.legacyNpm })),
        noDirectLegacyNpm: entries.filter(e => !e.legacyNpm.length).map(e => ({ path: e.path, referencedBy: e.referencedBy, managedGroup: e.group })) };
}
const target = path.join(root, 'specs/003-pruebas-automatizadas/test-inventory.json');
function markdown(data) {
    return '# Inventario TEST-01\n\nGenerado por `node scripts/test-catalog.cjs --write`. Clasificación revisada para listas explícitas; señales estáticas fuera de ellas no acreditan ejecución.\n\n' +
        data.entries.length + ' archivos (incluye helpers). Duplicados exactos: ' + data.exactDuplicates.length + '. Sin entrada npm histórica directa: ' + data.noDirectLegacyNpm.length + '. Ver JSON para imports, variables, referencias y scripts. Los hashes detectan deriva de contenido.\n\n' +
        '| Archivo | Tipo | Grupo nuevo | Requisitos | Riesgo |\n|---|---|---|---|---|\n' +
        data.entries.map(e => '| `' + e.path + '` | ' + e.type + ' | ' + (e.group || 'fuera por defecto') + ' | ' + e.requirements.join(', ') + ' | ' + e.risk + ' |').join('\n') +
        '\n\nAlias conservado: yape-pilot-flow → payment-audit-flow. Solapamientos de scripts y referencias sin entrada directa se detallan en JSON; no se consideran helpers huérfanos automáticamente. Las pruebas manuales/dispositivo y live no se incluyen en npm test ni CI mínimo. No se eliminó ni reescribió ninguna prueba previa.\n';
}
function check() {
    const expected = JSON.stringify(inventory(), null, 2) + '\n';
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== expected) throw Error('Inventario desactualizado: node scripts/test-catalog.cjs --write');
    if (fs.readFileSync(target.replace('.json', '.md'), 'utf8') !== markdown(JSON.parse(expected))) throw Error('Inventario Markdown desactualizado');
}
if (require.main === module) {
    try {
        if (process.argv[2] === '--write') { const data = inventory(); fs.writeFileSync(target, JSON.stringify(data, null, 2) + '\n'); fs.writeFileSync(target.replace('.json', '.md'), markdown(data)); }
        else if (process.argv.length === 2 || process.argv[2] === '--check') { check(); console.log('Inventario completo y vigente.'); }
        else throw Error('Uso: test-catalog.cjs [--check|--write]');
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { root, groups, inventory, check };
