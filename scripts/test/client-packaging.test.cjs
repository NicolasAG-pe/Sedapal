'use strict';
// PKG-01: contratos/artefactos locales. Sin red, .env, daemon ni servicios.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildWeb } = require('../build-web');
const { verifyClientRuntime } = require('../verify-client-runtime');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('Frontend/index.html');
const affected = ['two-factor-ui.js', 'password-recovery-ui.js', 'incident-timeline.js'];
const references = [...html.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi)]
    .map(match => match[1]).filter(value => !/^(?:[a-z]+:|\/\/|#)/i.test(value))
    .map(value => value.split(/[?#]/)[0]);

function temporary(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hidro-pkg01-'));
    // Solo el directorio creado por esta prueba, nunca artefactos o datos previos.
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    return directory;
}
function runtime(t, target = 'web') {
    const directory = temporary(t);
    buildWeb(target, { API_BASE_URL: 'https://api.example.invalid',
        AUTH_TOKEN_SECRET: 'SYNTHETIC_DO_NOT_PACKAGE', POSTGRES_PASSWORD: 'SYNTHETIC_DO_NOT_PACKAGE' }, directory);
    return directory;
}
function files(directory, prefix = '') {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const relative = path.posix.join(prefix, entry.name);
        return entry.isDirectory() ? files(path.join(directory, entry.name), relative) : [relative];
    });
}
function assertResources(directory) {
    for (const reference of references) {
        assert.ok(!reference.startsWith('/') && !reference.split('/').includes('..'), reference);
        const file = path.join(directory, reference);
        assert.ok(fs.statSync(file).isFile(), 'Recurso local requerido: ' + reference);
        if (reference.endsWith('.js')) {
            assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /^\s*(?:<!doctype|<html)/i, reference);
        }
    }
    for (const file of files(directory).filter(name => name.endsWith('.css'))) {
        const css = fs.readFileSync(path.join(directory, file), 'utf8');
        for (const match of css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) {
            if (/^(?:[a-z]+:|\/\/|#)/i.test(match[1])) continue;
            const resource = match[1].split(/[?#]/)[0];
            const resolved = path.resolve(directory, path.dirname(file), resource);
            assert.ok(resolved.startsWith(directory + path.sep), resource);
            assert.ok(fs.statSync(resolved).isFile(), file + ': ' + resource);
        }
    }
}

for (const target of ['web', 'android']) {
    test('PKG-T02/PKG-T04: artefacto ' + target + ' completo y público', t => {
        const directory = runtime(t, target);
        assertResources(directory);
        assert.equal(verifyClientRuntime(directory).administrativeCode, false);
        assert.deepEqual(fs.readdirSync(directory).sort(), ['assets', 'hm-api-config.js', 'index.html', 'shared']);
        for (const file of files(directory)) {
            assert.doesNotMatch(file, /(?:^|\/)(?:\.env(?:\.|$)|admin(?:[./-]|$)|backups?(?:\/|$))|\.(?:pem|key|jks|keystore|dump)$/i);
            assert.ok(!fs.readFileSync(path.join(directory, file)).includes(Buffer.from('SYNTHETIC_DO_NOT_PACKAGE')), file);
        }
        for (const name of affected) assert.deepEqual(fs.readFileSync(path.join(directory, 'shared', name)), fs.readFileSync(path.join(root, 'Shared', name)));
    });
}
for (const name of affected) {
    test('PKG-T03: verificador rechaza omisión de ' + name, t => {
        const directory = runtime(t);
        fs.unlinkSync(path.join(directory, 'shared', name));
        assert.throws(() => verifyClientRuntime(directory), error => error.message.includes('shared/' + name));
    });
}
test('PKG-T03: conserva rechazo de código administrativo', t => {
    const directory = runtime(t);
    fs.writeFileSync(path.join(directory, 'assets', 'js', 'intruso.js'), "fetch('/api/admin/recibos');");
    assert.throws(() => verifyClientRuntime(directory), /Código administrativo/);
});

test('PKG-T02: COPY Docker cubre scripts derivados del HTML', () => {
    const copies = read('Frontend/Dockerfile').split('\n').filter(line => line.startsWith('COPY ')).map(line => {
        const args = line.trim().split(/\s+/).slice(1);
        return { sources: args.slice(0, -1), destination: args.at(-1) };
    });
    for (const reference of references.filter(name => name.endsWith('.js'))) {
        const destination = '/var/www/html/' + reference;
        assert.ok(copies.some(copy => copy.sources.some(source => {
            const target = copy.destination.endsWith('/') ? copy.destination + path.posix.basename(source) : copy.destination;
            return source.endsWith('/')
                ? destination.startsWith(copy.destination) && fs.existsSync(path.join(root, source, destination.slice(copy.destination.length)))
                : target === destination && fs.existsSync(path.join(root, source));
        })), 'COPY ausente para ' + reference);
    }
});
test('PKG-T02: contexto explícito admite cada script Shared del HTML', () => {
    // Guard de la allowlist explícita elegida en la spec; NO emula todas las reglas Dockerignore.
    const lines = read('Frontend/Dockerfile.dockerignore').split(/\r?\n/).map(line => line.trim());
    assert.equal(lines[0], '**');
    assert.ok(lines.includes('!Shared/'));
    for (const reference of references.filter(name => name.startsWith('shared/') && name.endsWith('.js'))) {
        const source = 'Shared/' + reference.slice('shared/'.length);
        assert.ok(lines.includes('!' + source), 'Recurso excluido del contexto: ' + source);
    }
});
test('PKG-T04: referencia Kubernetes conserva los módulos requeridos', () => {
    const webStage = read('k8s/avance19/Dockerfile.120').split('FROM ${LOCAL_ADMIN_BASE}')[0];
    for (const name of affected) assert.ok(webStage.includes('Shared/' + name), name);
});
