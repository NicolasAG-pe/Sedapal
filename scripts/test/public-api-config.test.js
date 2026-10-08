'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { readApiBase, root } = require('../public-api-config');
const { buildWeb } = require('../build-web');
const { verifyClientRuntime } = require('../verify-client-runtime');

test('Android se genera limpio y rechaza una salida con recursos anteriores', () => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'hidro-client-android-test-'));
    buildWeb('android', { API_BASE_URL: 'http://10.0.2.2:8080' }, output);
    assert.equal(verifyClientRuntime(output).administrativeCode, false);
    for(const name of ['LogoSedapal.png','logo.png','sedapal1.png','sedapal.jpg']){
        assert.equal(fs.existsSync(path.join(output,'assets',name)),false,'Original histórico fuera del paquete: '+name);
        assert.equal(fs.existsSync(path.join(root,'Frontend/assets',name)),true,'Original conservado: '+name);
    }
    assert.deepEqual(fs.readdirSync(path.join(output, 'shared')).sort(), ['api.js', 'assets', 'icons.js', 'styles.css', 'ui.js']);
    const stale = path.join(output, 'admin.js');
    fs.writeFileSync(stale, '// Recurso antiguo: debe conservarse y bloquear el empaquetado.');
    assert.throws(() => buildWeb('android', { API_BASE_URL: 'http://10.0.2.2:8080' }, output), /debe estar vacía/);
    assert.throws(() => verifyClientRuntime(output), /admin/i);
    assert.equal(fs.existsSync(stale), true);
});

test('web local conserva URLs relativas y Android exige configurar API', () => {
    assert.equal(readApiBase('web', { API_BASE_URL: '' }), '');
    assert.equal(readApiBase('admin', { API_BASE_URL: '' }), '');
    assert.throws(() => readApiBase('android', { API_BASE_URL: '' }), /Configura API_BASE_URL/);
});

test('build admin conserva un panel independiente y publica solo runtime público', () => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'hidro-admin-build-test-'));
    buildWeb('admin', { API_BASE_URL: 'https://api.example.invalid', AUTH_TOKEN_SECRET: 'DO_NOT_PUBLISH' }, output);
    assert.deepEqual(fs.readdirSync(output).sort(), ['assets', 'hm-api-config.js', 'index.html', 'shared']);
    const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
    assert.ok(html.includes('admin-login-form'));
    assert.ok(!html.includes('sec-inicio'));
    assert.ok(!html.includes('hidrobot-root'));
    assert.ok(fs.existsSync(path.join(output, 'assets/vendor/socket.io.min.js')));
    assert.ok(fs.existsSync(path.join(output, 'shared/session.js')));
    assert.ok(!fs.readFileSync(path.join(output, 'hm-api-config.js'), 'utf8').includes('DO_NOT_PUBLISH'));
});

test('la misma URL pública configura REST y Socket.IO, sin rutas ni credenciales', () => {
    assert.equal(readApiBase('web', { API_BASE_URL: 'https://api.example.invalid/' }), 'https://api.example.invalid');
    for (const url of ['https://api.example.invalid/api', 'https://user:password@api.example.invalid', 'https://api.example.invalid/?token=secret', 'http://api.example.invalid', 'https://demo.trycloudflare.com']) {
        assert.throws(() => readApiBase('android', { API_BASE_URL: url }));
    }
    assert.equal(readApiBase('android', { API_BASE_URL: 'http://10.0.2.2:8080' }), 'http://10.0.2.2:8080');
});

test('build publica solo runtime y no modifica la configuración fuente', () => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'hidro-web-test-'));
    const source = fs.readFileSync(path.join(root, 'Frontend/hm-api-config.js'), 'utf8');
    buildWeb('web', { API_BASE_URL: 'https://api.example.invalid', AUTH_TOKEN_SECRET: 'DO_NOT_PUBLISH', POSTGRES_PASSWORD: 'DO_NOT_PUBLISH' }, output);
    assert.deepEqual(fs.readdirSync(output).sort(), ['assets', 'hm-api-config.js', 'index.html', 'shared']);
    const generated = fs.readFileSync(path.join(output, 'hm-api-config.js'), 'utf8');
    assert.ok(!generated.includes('DO_NOT_PUBLISH'));
    const context = { window: {} };
    vm.runInNewContext(generated, context);
    assert.equal(context.window.HM_API_BASE, 'https://api.example.invalid');
    assert.equal(fs.readFileSync(path.join(root, 'Frontend/hm-api-config.js'), 'utf8'), source);
    assert.equal(fs.readFileSync(path.join(output, 'index.html'), 'utf8'), fs.readFileSync(path.join(root, 'Frontend/index.html'), 'utf8'));
});
