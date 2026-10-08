// APK directa, runtime limpio y clave permanente externa. Nunca crea otra clave.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { loadReleaseSigning } = require('./android-release-signing.cjs');
const { verifyClientRuntime } = require('./verify-client-runtime');
const root = path.resolve(__dirname, '..');
const productionAPI = 'https://hidro-mejora-api.onrender.com';

function buildRelease(env = process.env) {
  const signing = loadReleaseSigning(env); // Fallar antes de generar/sincronizar recursos.
  if (env.API_BASE_URL !== undefined && env.API_BASE_URL !== productionAPI) {
    throw new Error('La release requiere la API HTTPS de producción de Render.');
  }
  const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
  const code = Number(gradle.match(/\bversionCode\s+(\d+)/)?.[1]);
  const version = gradle.match(/\bversionName\s+"([0-9]+\.[0-9]+\.[0-9]+)"/)?.[1];
  if (!Number.isInteger(code) || code < 2 || !version) throw new Error('Versionado release inválido.');
  const output = path.join(root, `artifacts/android/hidro-mejora-v${version}-release.apk`);
  if (fs.existsSync(output)) throw new Error('La APK de esta versión ya existe. No se sobrescribirá; incrementa la versión para una actualización.');
  const generated = path.join(root, 'artifacts/android/builds');
  fs.mkdirSync(generated, { recursive: true });
  const run = fs.mkdtempSync(path.join(generated, `release-${version}-`));
  const tmp = path.join(run, 'tmp'); fs.mkdirSync(tmp, { mode: 0o700 });
  const baseEnv = { ...env, API_BASE_URL: productionAPI, TMPDIR: tmp };
  function execute(command, args, childEnv, logName) {
    const p = spawnSync(command, args, { cwd: root, env: childEnv, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    let log = (p.stdout || '') + '\n' + (p.stderr || '');
    for (const value of Object.values(signing).sort((a, b) => b.length - a.length)) log = log.split(value).join('[PRIVADO]');
    fs.writeFileSync(path.join(run, logName), log, { mode: 0o600 });
    if (p.error || p.status !== 0) throw new Error(`Falló ${logName}; consulta el log local con valores de firma ocultos.`);
  }
  console.log('Generando y sincronizando runtime exclusivo de clientes.');
  execute(process.execPath, ['scripts/sync-android.cjs'], baseEnv, 'sync.log');
  const runtime = path.join(root, 'android/app/src/main/assets/public');
  verifyClientRuntime(runtime);
  if (!fs.readFileSync(path.join(runtime, 'hm-api-config.js'), 'utf8').includes(JSON.stringify(productionAPI))) {
    throw new Error('Runtime sin API de producción.');
  }
  console.log('Compilando release y ejecutando pruebas Android/lint con Java 21.');
  execute('bash', ['scripts/android-gradle.sh', '--no-daemon', '--console=plain',
    '-PhidroBuildDir=' + path.join(run, 'app'), ':app:assembleRelease', ':app:testReleaseUnitTest',
    ':app:lintRelease', ':app:compileDebugAndroidTestSources'], { ...baseEnv, ...signing }, 'gradle.log');
  const apk = path.join(run, 'app/outputs/apk/release/app-release.apk');
  fs.copyFileSync(apk, output, fs.constants.COPYFILE_EXCL);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex');
  fs.writeFileSync(output + '.sha256', hash + '  ' + path.basename(output) + '\n', { flag: 'wx' });
  const result = { apk: output, build: run, versionCode: code, versionName: version, bytes: fs.statSync(output).size, sha256: hash };
  fs.writeFileSync(path.join(run, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  return result;
}
if (require.main === module) {
  try { buildRelease(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { buildRelease };
