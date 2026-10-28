"use strict";
const crypto = require("node:crypto"),
  assert = require("node:assert/strict");
const { sql } = require("./email-schema.cjs");
exports.configure = () =>
  Object.assign(process.env, {
    EMAIL_PROVIDER: "resend",
    PASSWORD_RECOVERY_ENABLED: "1",
    PASSWORD_RECOVERY_ALLOWED_EMAIL: "",
    PASSWORD_RECOVERY_SECRET: crypto.randomBytes(32).toString("hex"),
    PASSWORD_RECOVERY_OUTBOX_KEY: crypto.randomBytes(32).toString("base64"),
    TOTP_ENCRYPTION_KEY: crypto.randomBytes(32).toString("base64"),
    TOTP_ENROLLMENT_ENABLED: "1",
    TOTP_ADMIN_ENROLLMENT_ENABLED: "1",
  });
exports.attach = async (ctx) => {
  await ctx.db.query(sql("migrations/011_recuperacion_clave.sql"));
  const mails = [];
  const worker = require("../password-recovery-worker").createRecoveryWorker({
    pool: ctx.db,
    enviarCodigo: require("../resend-mail").crearRemitente(
      { apiKey: "fixture-only" },
      {
        maxAttempts: 1,
        fetchImpl: async (url, options) => {
          assert.equal(url, "https://api.resend.com/emails");
          mails.push(JSON.parse(options.body));
          return Response.json({ id: crypto.randomUUID() });
        },
      },
    ),
  });
  return {
    mails,
    async drain() {
      for (let i = 0; i < 100; i++)
        if ((await worker.procesarUno()).estado === "vacio") return;
      throw Error("Cola fixture no se vacía");
    },
    code(email) {
      const text = mails
        .filter((m) => m.to[0] === email && /\d{8}/.test(m.text))
        .at(-1)?.text;
      assert.ok(text, "Código recibido por proveedor simulado");
      return text.match(/\d{8}/)[0];
    },
  };
};
