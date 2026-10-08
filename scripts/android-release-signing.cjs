'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const names = ['HM_RELEASE_STORE_FILE', 'HM_RELEASE_STORE_PASSWORD', 'HM_RELEASE_KEY_ALIAS', 'HM_RELEASE_KEY_PASSWORD'];

function inside(directory, file) {
  const relative = path.relative(directory, file);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
function privateFile(file, repository) {
  if (!path.isAbsolute(file) || inside(repository, fs.realpathSync(file))) {
    throw new Error('Los archivos privados de firma deben estar fuera del repositorio.');
  }
  const info = fs.lstatSync(file), parent = fs.statSync(path.dirname(file));
  if (!info.isFile() || (info.mode & 0o077) || (parent.mode & 0o077) ||
      (process.getuid && (info.uid !== process.getuid() || parent.uid !== process.getuid()))) {
    throw new Error('La firma requiere archivos privados 600 y directorio 700 del usuario actual.');
  }
}
function parseSigningFile(text) {
  const parsed = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (!match || !names.includes(match[1]) || Object.hasOwn(parsed, match[1])) {
      throw new Error('Formato de configuración de firma inválido; valores ocultos.');
    }
    let value = match[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    parsed[match[1]] = value;
  }
  return parsed;
}
function loadReleaseSigning(env = process.env, options = {}) {
  const repository = fs.realpathSync(options.projectRoot || root);
  const config = options.configFile || env.HM_RELEASE_ENV_FILE || path.join(os.homedir(), '.config/hidro-mejora/signing/release.env');
  let saved = {};
  if (!names.every(name => typeof env[name] === 'string' && env[name].trim())) {
    if (!fs.existsSync(config)) throw new Error('Faltan variables privadas de firma release. Consulta docs/ANDROID-RELEASE.md.');
    privateFile(config, repository);
    saved = parseSigningFile(fs.readFileSync(config, 'utf8'));
  }
  const signing = Object.fromEntries(names.map(name => [name, env[name] === undefined ? saved[name] : env[name]]));
  if (names.some(name => typeof signing[name] !== 'string' || !signing[name].trim())) {
    throw new Error('Faltan variables privadas de firma release. Consulta docs/ANDROID-RELEASE.md.');
  }
  try { privateFile(signing.HM_RELEASE_STORE_FILE, repository); }
  catch (_) { throw new Error('Almacén release inexistente, dentro del repositorio o sin permisos privados.'); }
  return signing;
}
module.exports = { loadReleaseSigning };
