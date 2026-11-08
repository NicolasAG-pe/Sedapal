'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Docker del frontend incluye los recursos compartidos solicitados por su página', () => {
    const root = path.resolve(__dirname, '../..');
    const read = name => fs.readFileSync(path.join(root, name), 'utf8');
    const page = read('Frontend/index.html');
    const dockerfile = read('Frontend/Dockerfile');
    const dockerignore = read('Frontend/Dockerfile.dockerignore');
    const referenced = [...page.matchAll(/(?:src|href)="shared\/([^"?#]+\.(?:js|css))"/g)].map(match => match[1]);
    assert.ok(referenced.length > 0, 'La página debe declarar recursos compartidos.');
    for (const name of referenced) {
        assert.ok(fs.existsSync(path.join(root, 'Shared', name)), `Falta Shared/${name}`);
        assert.match(dockerignore, new RegExp(`^!Shared/${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'), `El contexto excluye Shared/${name}`);
        assert.ok(dockerfile.split(/\r?\n/).some(line => /^COPY\s/.test(line) && line.split(/\s+/).includes(`Shared/${name}`)), `La imagen no copia Shared/${name}`);
    }
});

test('Docker backend declara usuario no privilegiado para API y workers', () => {
    const text = fs.readFileSync(path.resolve(__dirname, '../../Backend/Dockerfile'), 'utf8');
    assert.match(text, /^USER node\s*$/m);
    assert.ok(text.indexOf('USER node') < text.indexOf('CMD ["node", "start.cjs"]'));
});


test('Nginx de web y administración usa usuario sin privilegios y puerto interno coherente', () => {
    const root = path.resolve(__dirname, '../..');
    for (const [folder, user] of [['Frontend', 'www-data'], ['Admin', 'www-data']]) {
        const read = file => fs.readFileSync(path.join(root, folder, file), 'utf8');
        const dockerfile = read('Dockerfile'), main = read('nginx/nginx.conf'), server = read('nginx/default.conf');
        assert.match(dockerfile, new RegExp('^USER ' + user + '$', 'm'));
        assert.match(server, /listen 8080;/);
        assert.match(main, /pid \/tmp\//);
        assert.match(main, /proxy_temp_path \/tmp\//);
        assert.match(dockerfile, /EXPOSE 8080/);
    }
});
