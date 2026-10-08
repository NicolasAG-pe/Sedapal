// Crear un runtime limpio y mantener rollback solo hasta verificar Capacitor.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildWeb } = require('./build-web');
const { root } = require('./public-api-config');
const { verifyClientRuntime } = require('./verify-client-runtime');
buildWeb('android');
const staging = path.join(root, 'artifacts/android/staging');
fs.mkdirSync(staging, { recursive: true });
const publicDirectory = path.join(root, 'android/app/src/main/assets/public');
const backup = fs.mkdtempSync(path.join(staging, 'capacitor-public-'));
fs.chmodSync(backup, 0o700);
const previous = path.join(backup, 'public');
if (fs.existsSync(publicDirectory)) fs.renameSync(publicDirectory, previous);
try {
    const result = spawnSync('npx', ['--no-install', 'cap', 'sync', 'android'], { cwd: root, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('Capacitor sync terminó con error.');
    console.log('Android cliente:', JSON.stringify(verifyClientRuntime(publicDirectory)));
    fs.rmSync(backup, { recursive: true, force: true });
} catch (error) {
    if (fs.existsSync(publicDirectory)) fs.renameSync(publicDirectory, path.join(backup, 'public-incomplete'));
    if (fs.existsSync(previous)) fs.renameSync(previous, publicDirectory);
    console.error(error.message); process.exitCode = 1;
}
