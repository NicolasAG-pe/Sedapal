'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
test('la CSP permite el bloque local exacto y protege ambos paneles', () => {
    const html = fs.readFileSync(path.join(root, 'Frontend/index.html'), 'utf8');
    const inline = [...html.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script\s*>/gi)];
    assert.equal(inline.length, 1);
    const digest = crypto.createHash('sha256').update(inline[0][1]).digest('base64');
    for (const folder of ['Frontend', 'Admin']) {
        const headers = fs.readFileSync(path.join(root, folder, 'nginx/security-headers.conf'), 'utf8');
        const config = fs.readFileSync(path.join(root, folder, 'nginx/default.conf'), 'utf8');
        assert.match(headers, /frame-ancestors 'none'/);
        assert.match(headers, /X-Frame-Options "DENY" always/);
        assert.match(headers, /X-Content-Type-Options "nosniff" always/);
        assert.match(headers, /script-src 'self'/);
        assert.match(headers, folder === 'Admin' ? /style-src 'self'; style-src-attr 'none'/ : /style-src 'self'; style-src-attr 'unsafe-inline'/);
        if (folder === 'Admin') assert.doesNotMatch(fs.readFileSync(path.join(root, folder, 'index.html'), 'utf8'), /\sstyle\s*=/i);
        assert.doesNotMatch(headers, /script-src[^;]*'unsafe-inline'/);
        assert.match(config, /include \/etc\/nginx\/hidro-security-headers\.conf/);
        assert.match(fs.readFileSync(path.join(root,folder,'nginx/nginx.conf'),'utf8'),/server_tokens off;/);
        if (folder === 'Frontend') assert.ok(headers.includes(`'sha256-${digest}'`));
    }
});
