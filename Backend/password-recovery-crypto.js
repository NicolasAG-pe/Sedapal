"use strict";
const crypto = require("node:crypto");
const { proveedor } = require("./email-provider");
const { validarRemitente } = require("./gmail-mail");
function config(env = process.env) {
  if (env.PASSWORD_RECOVERY_ENABLED !== "1") return null;
  const secret = env.PASSWORD_RECOVERY_SECRET,
    key = Buffer.from(env.PASSWORD_RECOVERY_OUTBOX_KEY || "", "base64");
  if (
    typeof secret !== "string" ||
    Buffer.byteLength(secret) < 32 ||
    key.length !== 32 ||
    key.toString("base64") !== env.PASSWORD_RECOVERY_OUTBOX_KEY
  )
    throw Error("Configuración privada de recuperación inválida.");
  const variants = (value) => {
    const values = [Buffer.from(value)];
    if (/^[a-f0-9]{64}$/i.test(value)) values.push(Buffer.from(value, "hex"));
    if (/^[A-Za-z0-9+/]{43}=$/.test(value))
      values.push(Buffer.from(value, "base64"));
    return values;
  };
  const secrets = [
    env.AUTH_TOKEN_SECRET,
    env.EMAIL_OTP_SECRET,
    env.EMAIL_OUTBOX_KEY,
    env.TOTP_ENCRYPTION_KEY,
  ].filter(Boolean);
  if (
    [...secrets, secret].some((v) => variants(v).some((b) => b.equals(key))) ||
    secrets.some((v) =>
      variants(v).some((b) => variants(secret).some((s) => s.equals(b))),
    )
  )
    throw Error("Las claves de recuperación deben ser independientes.");
  const provider = proveedor(env),
    from =
      provider === "gmail"
        ? validarRemitente(env.GMAIL_SENDER)
        : String(env.RESEND_FROM || "").trim();
  if (
    /[\r\n]/.test(from) ||
    !/^(?:[^<>]+ <)?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$/.test(from)
  )
    throw Error("Remitente de recuperación inválido.");
  return {
    secret,
    key,
    provider,
    from,
    allowed: env.PASSWORD_RECOVERY_ALLOWED_EMAIL?.trim().toLowerCase() || null,
  };
}
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const hmac = (secret, purpose, value) =>
  crypto
    .createHmac("sha256", secret)
    .update("hidro-password-v1:" + purpose + ":" + value)
    .digest("hex");
function equal(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    /^[a-f0-9]{64}$/.test(a) &&
    /^[a-f0-9]{64}$/.test(b) &&
    crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"))
  );
}
function seal(message, key, id, request) {
  const iv = crypto.randomBytes(12),
    c = crypto.createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from("hidro-password-mail-v1:" + id + ":" + request));
  const b = Buffer.concat([c.update(message, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), b]);
}
function open(payload, key, id, request) {
  if (
    !Buffer.isBuffer(payload) ||
    payload.length < 29 ||
    payload.length > 16384
  )
    throw Error("Correo cifrado inválido.");
  const d = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    payload.subarray(0, 12),
  );
  d.setAAD(Buffer.from("hidro-password-mail-v1:" + id + ":" + request));
  d.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([d.update(payload.subarray(28)), d.final()]).toString(
    "utf8",
  );
}
const keyId = (key) => sha(key).slice(0, 16);
function message(from, to, code) {
  const subject = code
    ? "Recupera tu contraseña de Hidro-Mejora"
    : "Tu contraseña de Hidro-Mejora fue actualizada";
  const text = code
    ? `Tu código de recuperación es: ${code}. Vence en 5 minutos desde el envío. No lo compartas. Tu segundo factor seguirá siendo necesario. Si no solicitaste este cambio, ignora el mensaje.`
    : "Tu contraseña fue actualizada y las sesiones anteriores quedaron invalidadas. No se desactivó tu segundo factor. Si no realizaste el cambio, contacta por un canal de atención previamente conocido.";
  return JSON.stringify({
    from,
    to: [to],
    subject,
    text,
    html: `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${subject}</title></head><body style="font:16px sans-serif;line-height:1.6;color:#243746"><h1 style="color:#0F4C81">${subject}</h1><p>${code ? "Ingresa este código en la aplicación:" : text}</p>${code ? `<p style="font:32px monospace;letter-spacing:3px">${code}</p><p>Vence en 5 minutos. No lo compartas. El segundo factor no se desactiva.</p><p>Si no solicitaste el cambio, ignora este mensaje.</p>` : ""}</body></html>`,
  });
}
module.exports = { config, sha, hmac, equal, seal, open, keyId, message };
