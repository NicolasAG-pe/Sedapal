'use strict';
// Misma release permanente, con configuración Firebase privada y API productiva.
const fs = require('node:fs'), path = require('node:path');
const { validateConfig } = require('./build-android-fcm-lab.cjs');
const { buildRelease } = require('./build-android-release.cjs');

function buildFcmRelease(configFile, env = process.env, { root = path.resolve(__dirname, '..'), build = buildRelease } = {}) {
  if (!fs.statSync(path.join(root, '.git')).isFile()) throw Error('Usa un worktree independiente.');
  const config = validateConfig(configFile);
  const target = path.join(root, 'android/app/google-services.json');
  if (fs.existsSync(target)) throw Error('Existe configuración local; no se reemplazará.');
  let created = false;
  try {
    fs.writeFileSync(target, JSON.stringify(config), { mode: 0o600, flag: 'wx' }); created = true;
    return build({ ...env, HM_PUSH_ANDROID_ENABLED: '1' });
  } finally {
    // Retirar únicamente la copia efímera que acabamos de crear. El original privado permanece.
    if (created) fs.unlinkSync(target);
  }
}
if (require.main === module) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--config') throw Error();
    buildFcmRelease(process.argv[3]);
  } catch (_) { console.error('Release FCM detenida; revisa configuración privada y logs locales.'); process.exitCode = 1; }
}
module.exports = { buildFcmRelease };
