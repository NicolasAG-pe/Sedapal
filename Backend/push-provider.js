"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
function mockSender(receive = () => {}) {
  return async ({ token, message }) => {
    if (!token || !message?.data?.hm_event)
      throw Error("Fixture push inválido.");
    await receive({ token, message });
    return { kind: "simulado" };
  };
}
function createFcmSender({ projectId, getAccessToken, fetchImpl = fetch }) {
  if (
    !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId) ||
    typeof getAccessToken !== "function"
  )
    throw Error("Configuración FCM inválida.");
  return async ({ token, message }) => {
    let credential;
    try {
      credential = await getAccessToken();
    } catch (_) {
      return { kind: "configuracion" };
    }
    if (
      typeof credential !== "string" ||
      !credential ||
      /[\r\n]/.test(credential)
    )
      return { kind: "configuracion" };
    try {
      const r = await fetchImpl(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(10000),
          headers: {
            Authorization: "Bearer " + credential,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: { ...message, token } }),
        },
      );
      const data = await r.json().catch(() => null);
      if (r.ok && typeof data?.name === "string") return { kind: "aceptado" };
      const code = data?.error?.details?.find(
        (d) =>
          d["@type"] === "type.googleapis.com/google.firebase.fcm.v1.FcmError",
      )?.errorCode;
      if (code === "UNREGISTERED") return { kind: "token_invalido" };
      if (r.status === 429 || r.status === 503 || r.status === 500) {
        const value = r.headers.get("retry-after"),
          seconds = /^\d+$/.test(value || "")
            ? Number(value)
            : Math.max(0, (Date.parse(value) - Date.now()) / 1000);
        return {
          kind: "transitorio",
          retryAfter: Number.isFinite(seconds) ? seconds : 0,
        };
      }
      return { kind: "permanente" };
    } catch (_) {
      return { kind: "ambiguo" };
    } finally {
      credential = undefined;
    }
  };
}
function configuredSender(env = process.env) {
  if (env.PUSH_PROVIDER === "mock") {
    if (env.NODE_ENV !== "test") throw Error("Mock reservado al laboratorio.");
    return mockSender();
  }
  if (env.PUSH_PROVIDER !== "fcm" || env.PUSH_REAL_DELIVERY_ALLOWED !== "1")
    throw Error("FCM real no autorizado.");
  const file = path.resolve(env.PUSH_SERVICE_ACCOUNT_FILE || ""),
    repo = path.resolve(__dirname, ".."),
    stat = fs.lstatSync(file);
  if (
    file.startsWith(repo + path.sep) ||
    !stat.isFile() ||
    (stat.mode & 0o077) !== 0 ||
    stat.uid !== process.getuid()
  )
    throw Error("Archivo FCM privado inválido.");
  const account = JSON.parse(fs.readFileSync(file, "utf8"));
  if (
    account.type !== "service_account" ||
    account.project_id !== env.PUSH_FIREBASE_PROJECT_ID ||
    typeof account.client_email !== "string" ||
    !account.client_email.endsWith(".iam.gserviceaccount.com")
  )
    throw Error("Identidad FCM inválida.");
  const key = crypto.createPrivateKey(account.private_key);
  let cached = "",
    until = 0;
  const getAccessToken = async () => {
    if (cached && Date.now() < until) return cached;
    const encode = (o) => Buffer.from(JSON.stringify(o)).toString("base64url"),
      now = Math.floor(Date.now() / 1000),
      body =
        encode({ alg: "RS256", typ: "JWT" }) +
        "." +
        encode({
          iss: account.client_email,
          scope: "https://www.googleapis.com/auth/firebase.messaging",
          aud: "https://oauth2.googleapis.com/token",
          iat: now,
          exp: now + 3600,
        });
    const assertion =
      body +
      "." +
      crypto.sign("RSA-SHA256", Buffer.from(body), key).toString("base64url");
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    const data = await r.json();
    if (!r.ok || typeof data.access_token !== "string")
      throw Error("Autorización FCM no disponible.");
    cached = data.access_token;
    until =
      Date.now() +
      Math.max(0, Math.min(3600, Number(data.expires_in) || 0) - 60) * 1000;
    return cached;
  };
  return createFcmSender({ projectId: account.project_id, getAccessToken });
}
module.exports = { mockSender, createFcmSender, configuredSender };
