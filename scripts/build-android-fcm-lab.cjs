'use strict';
// Preparación exclusivamente local: nunca instala APK ni envía mensajes.
const fs = require('node:fs'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readPrivateJson } = require('../Backend/push-credentials');
const root = path.resolve(__dirname, '..');

function validateConfig(file) {
  const c = readPrivateJson(file, root);
  const client = c.client?.find(v => v.client_info?.android_client_info?.package_name === 'pe.edu.hidromejora.app');
  if (c.project_info?.project_id !== 'hidromejora-push-dev' || !client ||
      !/^1:\d+:android:[a-f0-9]+$/.test(client.client_info?.mobilesdk_app_id || '') ||
      !client.api_key?.[0]?.current_key ||
      client.client_info.mobilesdk_app_id.split(':')[1] !== c.project_info.project_number)
    throw Error('Configuración Android ajena al laboratorio.');
  return c;
}
function localApi(value) {
  const u = new URL(value);
  if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost', '10.0.2.2'].includes(u.hostname) ||
      u.username || u.password || u.search || u.hash || u.pathname !== '/')
    throw Error('El piloto requiere una API local explícita.');
  return u.origin;
}
function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') {
    console.log('node scripts/build-android-fcm-lab.cjs --config /privado/google-services.json --api http://10.0.2.2:PUERTO\nRequiere worktree independiente; conserva APK oficiales. No instala ni envía.');
    return;
  }
  if (args.length !== 4 || args[0] !== '--config' || args[2] !== '--api') throw Error('Argumentos de laboratorio inválidos.');
  if (!fs.statSync(path.join(root, '.git')).isFile()) throw Error('Usa un worktree independiente para el piloto.');
  const config = validateConfig(args[1]), api = localApi(args[3]);
  const target = path.join(root, 'android/app/google-services.json');
  if (fs.existsSync(target)) throw Error('Existe configuración Android local; no se reemplazará.');
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  const output = fs.mkdtempSync(path.join(root, 'artifacts/fcm-build-'));
  fs.chmodSync(output, 0o700);
  const env = { ...process.env, API_BASE_URL: api, HM_PUSH_ANDROID_ENABLED: '1',
    GRADLE_USER_HOME: process.env.GRADLE_USER_HOME || path.join(root, 'artifacts/android-cache/gradle-user-home'),
    ANDROID_USER_HOME: process.env.ANDROID_USER_HOME || path.join(root, 'artifacts/android-cache/android-user-home') };
  let created = false;
  try {
    fs.writeFileSync(target, JSON.stringify(config), { mode: 0o600, flag: 'wx' }); created = true;
    for (const [cmd, argv, log] of [
      [process.execPath, ['scripts/sync-android.cjs'], 'sync.log'],
      ['bash', ['scripts/android-gradle.sh', '--offline', '--no-daemon', '--console=plain', '-PhidroBuildDir=' + path.join(output, 'app'), ':app:assembleDebug', ':app:assembleDebugAndroidTest', ':app:testDebugUnitTest', ':app:lintDebug'], 'build.log'],
    ]) {
      const r = spawnSync(cmd, argv, { cwd: root, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
      fs.writeFileSync(path.join(output, log), (r.stdout || '') + (r.stderr || ''), { mode: 0o600 });
      if (r.error || r.status !== 0) throw Error('Falló la compilación; revisa el log privado del laboratorio.');
    }
    const apk = path.join(output, 'app/outputs/apk/debug/app-debug.apk');
    fs.chmodSync(apk, 0o600);
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ debug: true, firebaseConfigured: true, realDeliveryAllowed: false,
      apkSha256: require('node:crypto').createHash('sha256').update(fs.readFileSync(apk)).digest('hex') }, null, 2), { mode: 0o600 });
    console.log('APK debug de laboratorio preparada: ' + apk);
  } finally {
    if (created) fs.unlinkSync(target);
  }
}
if (require.main === module) {
  try { main(); } catch (_) { console.error('Preparación FCM detenida; consulta argumentos/configuración y logs privados.'); process.exitCode = 1; }
}
module.exports = { validateConfig, localApi, main };
