'use strict';
// Validador local con parser YAML ya disponible; no ejecuta jobs ni servicios.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require(process.env.HIDRO_YAML_MODULE || 'yaml');
const root = path.resolve(__dirname, '..');
const file = path.join(root, '.github/workflows/ci.yml');
function parse(source) {
    const doc = YAML.parseDocument(source, { uniqueKeys: true });
    assert.equal(doc.errors.length, 0, doc.errors.map(e => e.message).join('\n'));
    return doc.toJS();
}
function validate(workflow) {
    assert.deepEqual(Object.keys(workflow.on).sort((a, b) => a.localeCompare(b, 'en')), ['pull_request', 'push', 'workflow_dispatch']);
    assert.deepEqual(workflow.on.pull_request.branches, ['main']);
    assert.deepEqual(workflow.on.push.branches, ['chore/**', 'feature/**', 'fix/**', 'integration/**']);
    assert.deepEqual(workflow.permissions, { contents: 'read' });
    assert.equal(workflow.env, undefined); assert.equal(workflow.jobs.safe.env, undefined);
    assert.equal(workflow.concurrency['cancel-in-progress'], true);
    assert.deepEqual(Object.keys(workflow.jobs).sort((a, b) => a.localeCompare(b, 'en')), ['integration', 'safe']);
    const actions = {
        'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1': 'checkout',
        'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1': 'node',
        'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9': 'artifact'
    };
    const commands = new Set(['npm ci --ignore-scripts --no-audit --no-fund', 'npm ci --prefix Backend --ignore-scripts --no-audit --no-fund', 'npm run test:inventory', 'npm test -- --report', 'npm run test:integration -- --report']);
    const scripts = require('../package.json').scripts;
    for (const [id, job] of Object.entries(workflow.jobs)) {
        assert.equal(job['runs-on'], 'ubuntu-24.04'); assert.equal(job['timeout-minutes'], 10);
        assert.equal(job.environment, undefined); assert.equal(job.container, undefined); assert.equal(job.permissions, undefined);
        const seen = new Set();
        for (const step of job.steps) {
            assert.equal(step['continue-on-error'], undefined);
            if (id === 'integration' && step.run === 'npm run test:integration -- --report') assert.deepEqual(step.env, { HIDRO_EMAIL_TEST_DB_PORT: '${{ job.services.postgres.ports[5432] }}' });
            else assert.equal(step.env, undefined);
            if (step.run) {
                assert.ok(commands.has(step.run), 'Comando no aprobado: ' + step.run);
                const script = step.run.startsWith('npm run ') ? step.run.split(' ')[2] : step.run.startsWith('npm test') ? 'test' : null;
                if (script) assert.equal(typeof scripts[script], 'string');
                continue;
            }
            const kind = actions[step.uses]; assert.ok(kind, 'Acción no fijada/aprobada: ' + step.uses); seen.add(kind);
            if (kind === 'checkout') assert.equal(step.with['persist-credentials'], false);
            if (kind === 'node') { assert.equal(step.with['node-version'], '22'); assert.equal(step.with['package-manager-cache'], false); }
            if (kind === 'artifact') {
                assert.equal(step.if, 'always()'); assert.equal(step.with['include-hidden-files'], false);
                assert.equal(step.with['retention-days'], 7);
                assert.deepEqual(step.with.path.trim().split('\n'), [`artifacts/tests/${id}-*/junit.xml`, `artifacts/tests/${id}-*/run.json`]);
            }
        }
        assert.deepEqual([...seen].sort((a, b) => a.localeCompare(b, 'en')), ['artifact', 'checkout', 'node']);
    }
    assert.equal(workflow.jobs.safe.steps[0].with['fetch-depth'], 0);
    assert.equal(workflow.jobs.integration.needs, 'safe');
    assert.equal(workflow.jobs.safe.services, undefined);
    const pg = workflow.jobs.integration.services.postgres;
    assert.equal(pg.image, 'postgres:18'); assert.deepEqual(pg.ports, ['127.0.0.1::5432']);
    const fixturePassword = '${{ github.run_id }}-${{ github.run_attempt }}-ci-fixture';
    assert.deepEqual(pg.env, { POSTGRES_DB: 'hm_email_test', POSTGRES_USER: 'hm_fixture', POSTGRES_PASSWORD: fixturePassword });
    assert.ok(pg.options.includes('--tmpfs /var/lib/postgresql:rw,nosuid,size=2048m'));
    assert.ok(pg.options.includes('pg_isready -U hm_fixture -d hm_email_test'));
    assert.ok(!/(?:--volume|--mount|--privileged|--network)/.test(pg.options));
    assert.deepEqual(workflow.jobs.integration.env, { HIDRO_TEST_ISOLATED_DB: '1', HIDRO_EMAIL_TEST_DB_PASSWORD: fixturePassword });
    for (const dependency of ['Backend/package-lock.json', 'scripts/test-runner.cjs', 'scripts/test-catalog.cjs']) assert.ok(fs.existsSync(path.join(root, dependency)));
    const { groups } = require('./test-catalog.cjs');
    assert.ok(groups.contract.includes('scripts/test/client-packaging.test.cjs'));
    assert.ok(groups.integration.includes('Backend/test/receipt-profile-compat.cjs'));
}
const source = fs.readFileSync(file, 'utf8');
const workflow = parse(source); validate(workflow);
assert.ok(!/\$\{\{\s*(?:secrets\.|github\.event\.)/.test(source));
if (process.argv.includes('--self-test')) {
    const mutations = [
        w => { w.on.pull_request_target = {}; },
        w => { w.permissions.contents = 'write'; },
        w => { w.jobs.integration.env.HIDRO_EMAIL_TEST_DB_PORT = '${{ job.services.postgres.ports[5432] }}'; },
        w => { w.jobs.safe.steps[0].uses = 'actions/checkout@v7'; },
        w => { w.jobs.safe.steps.find(s => s.run).run = 'npm run deploy'; },
        w => { w.jobs.integration.services.postgres.options += ' --volume /private:/data'; },
        w => { w.jobs.integration.services.postgres.env.POSTGRES_PASSWORD = null; },
        w => { w.jobs.safe.steps.at(-1).with.path = 'artifacts/**'; }
    ];
    for (const change of mutations) { const copy = structuredClone(workflow); change(copy); assert.throws(() => validate(copy)); }
    assert.throws(() => parse('name: a\nname: b\n'));
    console.log((mutations.length + 1) + ' controles negativos rechazados correctamente.');
}
console.log('YAML y políticas locales CI-01: OK. Motor de GitHub y ejecución remota NO comprobados.');
