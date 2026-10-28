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
module.exports = { readPrivateJson, temporaryAccessToken };
