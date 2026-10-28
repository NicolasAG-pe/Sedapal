"use strict";
const crypto = require("node:crypto"),
  { sql } = require("./email-schema.cjs");
exports.configure = () =>
  Object.assign(process.env, {
    EMAIL_PROVIDER: "resend",
    EMAIL_REGISTRATION_ALLOWED_EMAIL: "",
    PUSH_ENABLED: "1",
    PUSH_PROVIDER: "mock",
    PUSH_TOKEN_KEY: crypto.randomBytes(32).toString("base64"),
  });
exports.attach = async (ctx) => {
  await ctx.db.query(sql("migrations/011_recuperacion_clave.sql"));
  await ctx.db.query(sql("migrations/012_notificaciones_push.sql"));
  const messages = [];
  return {
    messages,
    worker: require("../push-worker").createPushWorker({
      pool: ctx.db,
      send: require("../push-provider").mockSender((m) => messages.push(m)),
    }),
  };
};
