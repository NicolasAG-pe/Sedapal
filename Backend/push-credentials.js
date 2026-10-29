"use strict";
const fs = require("node:fs"), path = require("node:path");

// Solo archivos privados externos. No propagar errores que puedan incluir secretos.
function readPrivateJson(file, repository = path.resolve(__dirname, "..")) {
  let fd;
  try {
    if (!file || !path.isAbsolute(file)) throw Error();
    const real = fs.realpathSync(file), root = fs.realpathSync(repository);
    if (real !== path.resolve(file) || real.startsWith(root + path.sep)) throw Error();
    fd = fs.openSync(real, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o077) || stat.size > 65536) throw Error();
    return JSON.parse(fs.readFileSync(fd, "utf8"));
  } catch (_) {
    throw Error("Archivo privado FCM inválido.");
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function temporaryAccessToken(env, now = Date.now) {
  const project = env.PUSH_FIREBASE_PROJECT_ID, account = env.PUSH_SENDER_SERVICE_ACCOUNT;
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project || "") ||
      !new RegExp("^[a-z][a-z0-9-]{4,28}[a-z0-9]@" + project + "\\.iam\\.gserviceaccount\\.com$").test(account || "") ||
      account.startsWith("firebase-adminsdk-")) throw Error("Identidad FCM dedicada requerida.");
  // Leer de nuevo antes de cada envío: caducidad, revocación local y renovación externa.
  const readToken = () => {
    const c = readPrivateJson(env.PUSH_ACCESS_TOKEN_FILE), expiry = Date.parse(c.expire_time), time = now();
    if (c.type !== "fcm_temporary_access_token" || c.project_id !== project || c.client_email !== account ||
        c.scope !== "https://www.googleapis.com/auth/firebase.messaging" || c.private_key !== undefined ||
        !Number.isFinite(expiry) || expiry <= time + 60000 || expiry > time + 3600000 ||
        typeof c.access_token !== "string" || !/^[A-Za-z0-9._~+\/-]{16,8192}$/.test(c.access_token))
      throw Error("Credencial temporal FCM inválida o vencida.");
    return c.access_token;
  };
  readToken(); // Fallar antes de reclamar un trabajo si no hay credencial válida.
  return async () => readToken();
}

function validateServiceAccount(account, env) {
  const project = env.PUSH_FIREBASE_PROJECT_ID, sender = env.PUSH_SENDER_SERVICE_ACCOUNT;
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project || '') ||
      !new RegExp('^[a-z][a-z0-9-]{4,28}[a-z0-9]@' + project + '\\.iam\\.gserviceaccount\\.com$').test(sender || '') ||
      sender.startsWith('firebase-adminsdk-') || account.type !== 'service_account' ||
      account.project_id !== project || account.client_email !== sender ||
      typeof account.private_key !== 'string') throw Error('Identidad FCM dedicada requerida.');
  const key = require('node:crypto').createPrivateKey(account.private_key);
  if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < 2048)
    throw Error('Clave FCM inválida.');
  return key;
}

// Render entrega el JSON como secreto de runtime. Solo el worker recibe una copia
// efímera 0600, externa al código; no se transforma en build arg ni en un asset.
function preparePushCredentials(env) {
  if (env.PUSH_PROVIDER === 'mock' && env.NODE_ENV === 'test') return { env, cleanup() {} };
  if (env.PUSH_AUTH_MODE === 'access_token_file') {
    if (env.PUSH_SERVICE_ACCOUNT_JSON) throw Error('Identidades FCM incompatibles.');
    temporaryAccessToken(env);
    return { env, cleanup() {} };
  }
  if (!env.PUSH_SERVICE_ACCOUNT_JSON) {
    validateServiceAccount(readPrivateJson(env.PUSH_SERVICE_ACCOUNT_FILE), env);
    return { env, cleanup() {} };
  }
  let directory;
  try {
    if (env.PUSH_SERVICE_ACCOUNT_FILE || env.PUSH_ACCESS_TOKEN_FILE ||
        Buffer.byteLength(env.PUSH_SERVICE_ACCOUNT_JSON) > 65536) throw Error();
    validateServiceAccount(JSON.parse(env.PUSH_SERVICE_ACCOUNT_JSON), env);
    directory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'hidro-fcm-'));
    fs.chmodSync(directory, 0o700);
    const file = path.join(directory, 'sender.json');
    fs.writeFileSync(file, env.PUSH_SERVICE_ACCOUNT_JSON, { flag: 'wx', mode: 0o600 });
    const childEnv = { ...env, PUSH_SERVICE_ACCOUNT_FILE: file };
    delete childEnv.PUSH_SERVICE_ACCOUNT_JSON;
    return { env: childEnv, cleanup() { fs.rmSync(directory, { recursive: true }); } };
  } catch (_) {
    if (directory) fs.rmSync(directory, { recursive: true });
    throw Error('No se pudo preparar la identidad privada FCM.');
  }
}
module.exports = { readPrivateJson, temporaryAccessToken, validateServiceAccount, preparePushCredentials };
