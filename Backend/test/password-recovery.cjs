"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const { once } = require("node:events");
const { iniciar } = require("./email-api.cjs"),
  { sql } = require("./email-schema.cjs");
const { createRecoveryWorker } = require("../password-recovery-worker");
const { crearRemitente } = require("../resend-mail");
const C = require("../password-recovery-crypto");
const jwt = require("jsonwebtoken"),
  OTPAuth = require("otpauth");
const { io } = require("../../Frontend/assets/vendor/socket.io.min.js");
global.WebSocket = require("ws");
let ctx,
  worker,
  n = 3000,
  ip = 1;
const mails = [];
before(async () => {
  process.env.EMAIL_PROVIDER = "resend";
  process.env.PASSWORD_RECOVERY_ALLOWED_EMAIL = "";
  process.env.TOTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
  process.env.TOTP_ENROLLMENT_ENABLED = "1";
  process.env.TOTP_ADMIN_ENROLLMENT_ENABLED = "1";
  ctx = await iniciar({ databasePrefix: "password_recovery" });
  await ctx.db.query(sql("migrations/011_recuperacion_clave.sql"));
  await ctx.db.query(sql("migrations/011_recuperacion_clave.sql"));
  process.env.PASSWORD_RECOVERY_ENABLED = "1";
  process.env.PASSWORD_RECOVERY_SECRET = crypto.randomBytes(32).toString("hex");
  process.env.PASSWORD_RECOVERY_OUTBOX_KEY = crypto
    .randomBytes(32)
    .toString("base64");
  worker = createRecoveryWorker({
    pool: ctx.db,
    enviarCodigo: crearRemitente(
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
});
after(async () => {
  if (ctx) {
    const closing = ctx.close();
    ctx.httpServer.closeAllConnections();
    await closing;
  }
});
async function api(path, body, token, status) {
  const res = await fetch(ctx.base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": "198.51.100." + ip++,
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await res.json();
  if (status) assert.equal(res.status, status, data.mensaje);
  assert.equal(
    res.headers.get("cache-control"),
    path.includes("password-recovery")
      ? "no-store"
      : res.headers.get("cache-control"),
  );
  return { res, data };
}
const post = (action, body, status = 200) =>
  api("/api/auth/password-recovery/" + action, body, null, status);
async function user({ admin = false, mfa = false } = {}) {
  const a = ctx.registro(++n),
    p = (await ctx.request("register", a, 202)).data;
  const d = (
    await ctx.request(
      "verify-email",
      ctx.verificar(p.registro_id, ctx.codigo(a.correo)),
      201,
    )
  ).data;
  const u = { ...a, id: d.usuario.id_usuario, token: d.token };
  if (admin) {
    await ctx.db.query("UPDATE usuarios SET rol='admin' WHERE id_usuario=$1", [
      u.id,
    ]);
    u.token = (
      await ctx.request(
        "login",
        { numero_suministro: u.numero_suministro, password: u.password },
        200,
      )
    ).data.token;
  }
  if (mfa) {
    await api("/api/auth/2fa/setup", { password: u.password }, u.token, 200);
    const row = (
      await ctx.db.query("SELECT * FROM usuario_2fa WHERE id_usuario=$1", [
        u.id,
      ])
    ).rows[0];
    u.secret = require("../totp-crypto")
      .crearCifradoTotp(process.env)
      .decrypt(row.pendiente_secreto, u.id);
    const r = await api(
      "/api/auth/2fa/confirm",
      { codigo: totp(u.secret) },
      u.token,
      200,
    );
    u.token = r.data.token;
    u.factor = r.data.codigos_recuperacion[0];
    u.otherFactor = r.data.codigos_recuperacion[1];
  }
  return u;
}
function totp(secret) {
  return new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret),
  }).generate();
}
async function drain(w = worker) {
  for (let i = 0; i < 60; i++) {
    const r = await w.procesarUno();
    if (r.estado === "vacio") return;
  }
  throw Error("Demasiados correos en fixture.");
}
async function request(email, id = crypto.randomUUID()) {
  const r = await post("request", { correo: email, solicitud_id: id }, 202);
  return r.data;
}
function code(u) {
  return mails
    .filter(
      (m) => m.to[0] === u.correo && /código de recuperación/.test(m.text),
    )
    .at(-1)
    ?.text.match(/: (\d{8})/)[1];
}
async function pending(u) {
  const r = await request(u.correo);
  await drain();
  return { solicitud_id: r.solicitud_id, codigo: code(u) };
}
async function grant(u) {
  const p = await pending(u);
  const r = await post("verify", { ...p, factor: u.factor }, 200);
  return { solicitud_id: p.solicitud_id, permiso: r.data.permiso };
}
const nextPassword = "NuevaClaveLaboratorio42";
test("011 repetible, desactivado por defecto y secretos independientes", async () => {
  delete process.env.PASSWORD_RECOVERY_ENABLED;
  await post(
    "request",
    { correo: "nadie@example.invalid", solicitud_id: crypto.randomUUID() },
    503,
  );
  assert.equal(C.config(), null);
  process.env.PASSWORD_RECOVERY_ENABLED = "1";
  assert.throws(() =>
    C.config({
      ...process.env,
      PASSWORD_RECOVERY_SECRET: process.env.AUTH_TOKEN_SECRET,
    }),
  );
  assert.throws(() =>
    C.config({
      ...process.env,
      PASSWORD_RECOVERY_OUTBOX_KEY: process.env.EMAIL_OUTBOX_KEY,
    }),
  );
  const before = (
    await ctx.db.query("SELECT count(*)::int n FROM correo_outbox")
  ).rows[0].n;
  await request("nadie@example.invalid");
  await drain();
  assert.equal(
    (await ctx.db.query("SELECT count(*)::int n FROM correo_outbox")).rows[0].n,
    before,
  );
});
test("mismo contrato para usuario, correo desconocido, no verificado, deshabilitado y admin sin factor", async () => {
  const users = [
    await user(),
    await user(),
    await user(),
    await user({ admin: true }),
  ];
  await ctx.db.query(
    "UPDATE usuarios SET correo_verificado_en=NULL WHERE id_usuario=$1",
    [users[1].id],
  );
  await ctx.db.query("UPDATE usuarios SET activo=false WHERE id_usuario=$1", [
    users[2].id,
  ]);
  const start = mails.length;
  const results = [];
  for (const correo of [
    ...users.map((u) => u.correo),
    "desconocido@example.invalid",
  ]) {
    const r = await request(correo);
    const { solicitud_id, ...rest } = r;
    results.push(rest);
  }
  results.forEach((r) => assert.deepEqual(r, results[0]));
  await drain();
  assert.equal(mails.slice(start).length, 1);
  assert.equal(mails.at(-1).to[0], users[0].correo);
});
test("código válido, permiso limitado, cambio atómico y todos los JWT anteriores revocados sin MFA", async () => {
  const u = await user(),
    other = await user(),
    p = await pending(u);
  const row = (
    await ctx.db.query(
      "SELECT codigo_hash FROM recuperaciones_clave WHERE id=$1",
      [p.solicitud_id],
    )
  ).rows[0];
  assert.notEqual(row.codigo_hash, p.codigo);
  const r = await post("verify", p);
  assert.equal(r.data.token, undefined);
  assert.equal(r.data.permiso.length, 43);
  await api("/api/me/perfil", undefined, r.data.permiso, 401);
  const g = { solicitud_id: p.solicitud_id, permiso: r.data.permiso };
  await post("complete", {
    ...g,
    password_nueva: nextPassword,
    password_confirmacion: nextPassword,
    id_usuario: other.id,
  });
  await api("/api/auth/session", undefined, u.token, 401);
  await api("/api/auth/session", undefined, other.token, 200);
  await ctx.request(
    "login",
    { numero_suministro: u.numero_suministro, password: u.password },
    401,
  );
  const login = await ctx.request(
    "login",
    { numero_suministro: u.numero_suministro, password: nextPassword },
    200,
  );
  assert.ok(login.data.token);
  await post(
    "complete",
    {
      ...g,
      password_nueva: "OtraClave42",
      password_confirmacion: "OtraClave42",
    },
    400,
  );
  await post("verify", p, 400);
  await drain();
  assert.ok(
    mails.some(
      (m) => m.to[0] === u.correo && /fue actualizada/.test(m.subject),
    ),
  );
});
test("incorrecto, intentos agotados, vencido y permiso vencido fallan sin cambiar contraseña", async () => {
  for (const mode of ["agotado", "vencido", "permiso"]) {
    const u = await user(),
      p = await pending(u);
    if (mode === "agotado") {
      const wrong = p.codigo === "00000000" ? "11111111" : "00000000";
      for (let i = 0; i < 5; i++)
        await post("verify", { ...p, codigo: wrong }, 400);
      await post("verify", p, 400);
    }
    if (mode === "vencido") {
      await ctx.db.query(
        "UPDATE recuperaciones_clave SET vence_en=clock_timestamp()-INTERVAL '1 second' WHERE id=$1",
        [p.solicitud_id],
      );
      await post("verify", p, 400);
    }
    if (mode === "permiso") {
      const g = (await post("verify", p)).data;
      await ctx.db.query(
        "UPDATE recuperaciones_clave SET permiso_vence_en=clock_timestamp()-INTERVAL '1 second' WHERE id=$1",
        [p.solicitud_id],
      );
      await post(
        "complete",
        {
          solicitud_id: p.solicitud_id,
          permiso: g.permiso,
          password_nueva: nextPassword,
          password_confirmacion: nextPassword,
        },
        400,
      );
    }
    await ctx.request(
      "login",
      { numero_suministro: u.numero_suministro, password: u.password },
      200,
    );
  }
});
test("concurrencia: un envío por UUID, un permiso y un cambio; reenvíos limitados e invalidación del anterior", async () => {
  const u = await user(),
    id = crypto.randomUUID();
  await Promise.all(Array.from({ length: 8 }, () => request(u.correo, id)));
  await drain();
  assert.equal(mails.filter((m) => m.to[0] === u.correo).length, 1);
  const p = { solicitud_id: id, codigo: code(u) },
    v = await Promise.all([post("verify", p, null), post("verify", p, null)]);
  assert.deepEqual(v.map((r) => r.res.status).sort(), [200, 400]);
  const permission = v.find((r) => r.res.status === 200).data.permiso;
  const changes = await Promise.all([
    post(
      "complete",
      {
        solicitud_id: id,
        permiso: permission,
        password_nueva: nextPassword,
        password_confirmacion: nextPassword,
      },
      null,
    ),
    post(
      "complete",
      {
        solicitud_id: id,
        permiso: permission,
        password_nueva: "Alternativa42",
        password_confirmacion: "Alternativa42",
      },
      null,
    ),
  ]);
  assert.deepEqual(changes.map((r) => r.res.status).sort(), [200, 400]);
  const a = await user(),
    old = await pending(a);
  await request(a.correo);
  assert.equal(
    (
      await ctx.db.query(
        "SELECT count(*)::int n FROM recuperaciones_clave WHERE identidad_hash=(SELECT identidad_hash FROM recuperaciones_clave WHERE id=$1)",
        [old.solicitud_id],
      )
    ).rows[0].n,
    1,
  );
  for (let i = 0; i < 2; i++) {
    await ctx.db.query(
      "UPDATE recuperacion_clave_limites SET ultimo_envio_en=clock_timestamp()-INTERVAL '61 seconds' WHERE identidad_hash=(SELECT identidad_hash FROM recuperaciones_clave WHERE id=$1)",
      [old.solicitud_id],
    );
    await request(a.correo);
  }
  await post("verify", old, 400);
  await ctx.db.query(
    "UPDATE recuperacion_clave_limites SET ultimo_envio_en=clock_timestamp()-INTERVAL '61 seconds' WHERE identidad_hash=(SELECT identidad_hash FROM recuperaciones_clave WHERE id=$1)",
    [old.solicitud_id],
  );
  await request(a.correo);
  assert.equal(
    (
      await ctx.db.query(
        "SELECT solicitudes FROM recuperacion_clave_limites WHERE identidad_hash=(SELECT identidad_hash FROM recuperaciones_clave WHERE id=$1)",
        [old.solicitud_id],
      )
    ).rows[0].solicitudes,
    3,
  );
});
test("2FA usuario y administrador: correo solo no basta, códigos separados y login normal exige segundo factor", async () => {
  for (const admin of [false, true]) {
    const u = await user({ admin, mfa: true }),
      p = await pending(u);
    await post("verify", p, 400);
    await post("verify", { ...p, factor: p.codigo }, 400);
    const g = (await post("verify", { ...p, factor: u.factor })).data;
    await post("complete", {
      solicitud_id: p.solicitud_id,
      permiso: g.permiso,
      password_nueva: nextPassword,
      password_confirmacion: nextPassword,
    });
    await api("/api/auth/session", undefined, u.token, 401);
    const login = (
      await ctx.request(
        "login",
        { numero_suministro: u.numero_suministro, password: nextPassword },
        202,
      )
    ).data;
    assert.equal(login.token, undefined);
    await api(
      "/api/auth/2fa/login",
      { desafio: login.desafio, codigo: u.factor },
      undefined,
      401,
    );
    const confirmed = await api(
      "/api/auth/2fa/login",
      { desafio: login.desafio, codigo: u.otherFactor },
      undefined,
      200,
    );
    assert.ok(confirmed.data.token);
    assert.equal(
      (
        await ctx.db.query(
          "SELECT activo FROM usuario_2fa WHERE id_usuario=$1",
          [u.id],
        )
      ).rows[0].activo,
      true,
    );
  }
});
test("revoca JWT antiguos sin campo MFA y desconecta Socket.IO tras COMMIT", async () => {
  const u = await user(),
    legacy = jwt.sign(
      { id_usuario: u.id, rol: "usuario" },
      process.env.AUTH_TOKEN_SECRET,
      { expiresIn: "8h" },
    );
  const socket = io(ctx.base, {
    transports: ["websocket"],
    auth: { token: u.token },
    reconnection: false,
  });
  await once(socket, "connect");
  await new Promise((r) => setTimeout(r, 30));
  const invalidated = new Promise((r) => socket.on("sesion:invalidada", r)),
    disconnected = new Promise((r) => socket.on("disconnect", r));
  const g = await grant(u);
  await post("complete", {
    ...g,
    password_nueva: nextPassword,
    password_confirmacion: nextPassword,
  });
  await Promise.all([invalidated, disconnected]);
  socket.disconnect();
  await api("/api/auth/session", undefined, legacy, 401);
  const denied = io(ctx.base, {
    transports: ["websocket"],
    auth: { token: u.token },
    reconnection: false,
  });
  await once(denied, "connect_error");
  denied.disconnect();
});
test("cambio de contraseña existente revoca sesiones y cancela solicitud/grant previos", async () => {
  const u = await user(),
    g = await grant(u);
  await api(
    "/api/auth/change-password",
    {
      password_actual: u.password,
      password_nueva: nextPassword,
      password_confirmacion: nextPassword,
    },
    u.token,
    200,
  );
  await api("/api/auth/session", undefined, u.token, 401);
  await post(
    "complete",
    {
      ...g,
      password_nueva: "NoAutorizada42",
      password_confirmacion: "NoAutorizada42",
    },
    400,
  );
});
test("solicitud en cola anterior a un cambio de credenciales no revive al iniciar el worker", async () => {
  const u = await user(),
    p = await request(u.correo);
  await api(
    "/api/auth/change-password",
    {
      password_actual: u.password,
      password_nueva: nextPassword,
      password_confirmacion: nextPassword,
    },
    u.token,
    200,
  );
  const start = mails.length;
  await drain();
  assert.equal(
    mails.slice(start).filter((m) => m.to[0] === u.correo).length,
    0,
  );
  const row = (
    await ctx.db.query(
      "SELECT estado,payload FROM recuperacion_clave_outbox WHERE solicitud_id=$1",
      [p.solicitud_id],
    )
  ).rows[0];
  assert.equal(row.estado, "cancelado");
  assert.equal(row.payload, null);
});
test("cambiar correo no hereda la verificación anterior ni permite recuperar otra identidad", async () => {
  const u = await user(),
    p = await pending(u);
  await ctx.db.query("UPDATE usuarios SET correo=$2 WHERE id_usuario=$1", [
    u.id,
    "nuevo." + u.id + "@example.invalid",
  ]);
  assert.equal(
    (
      await ctx.db.query(
        "SELECT correo_verificado_en FROM usuarios WHERE id_usuario=$1",
        [u.id],
      )
    ).rows[0].correo_verificado_en,
    null,
  );
  await post("verify", p, 400);
});
test("worker detenido: API encola sin afirmar entrega; ciphertext autenticado y sin OTP persistido en claro", async () => {
  const u = await user(),
    p = await request(u.correo);
  const r = (
    await ctx.db.query(
      "SELECT * FROM recuperacion_clave_outbox WHERE solicitud_id=$1",
      [p.solicitud_id],
    )
  ).rows[0];
  assert.equal(r.estado, "pendiente");
  assert.ok(Buffer.isBuffer(r.payload));
  assert.equal(r.payload.includes(Buffer.from(u.correo)), false);
  const cfg = C.config();
  assert.throws(() => C.open(r.payload, cfg.key, r.id, crypto.randomUUID()));
  const tampered = Buffer.from(r.payload);
  tampered[30] ^= 1;
  assert.throws(() => C.open(tampered, cfg.key, r.id, p.solicitud_id));
});
test("límite IP independiente de existencia y ni el suministro ni un token de acceso sustituyen la prueba", async () => {
  const fixed = "203.0.113.249";
  for (let i = 0; i < 11; i++) {
    const res = await fetch(ctx.base + "/api/auth/password-recovery/request", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": fixed },
      body: JSON.stringify({
        correo: "ip." + i + "@example.invalid",
        solicitud_id: crypto.randomUUID(),
      }),
    });
    assert.equal(res.status, i < 10 ? 202 : 429);
    await res.arrayBuffer();
  }
  const u = await user();
  await post(
    "request",
    {
      numero_suministro: u.numero_suministro,
      solicitud_id: crypto.randomUUID(),
    },
    400,
  );
  await post(
    "complete",
    {
      solicitud_id: crypto.randomUUID(),
      permiso: u.token,
      password_nueva: nextPassword,
      password_confirmacion: nextPassword,
    },
    400,
  );
});

test("worker concurrente no envía dos veces; fallo transitorio reintenta la misma UUID/cuerpo", async () => {
  await drain();
  const u = await user();
  await request(u.correo);
  const sent = [];
  let fails = true;
  const transport = createRecoveryWorker({
    pool: ctx.db,
    enviarCodigo: async (job) => {
      sent.push({ id: job.envioId, message: job.mensaje });
      if (fails) {
        fails = false;
        throw { tipo: "transitorio", retryAfter: 1 };
      }
      return { id: "fixture-retry" };
    },
  });
  const first = await transport.procesarUno();
  assert.equal(first.estado, "reintento");
  await ctx.db.query(
    "UPDATE recuperacion_clave_outbox SET disponible_en=clock_timestamp()-INTERVAL '1 second' WHERE estado='reintento'",
  );
  const results = await Promise.all([
    transport.procesarUno(),
    transport.procesarUno(),
  ]);
  assert.equal(results.filter((r) => r.estado === "aceptado").length, 1);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].id, sent[1].id);
  assert.equal(sent[0].message, sent[1].message);
});
test("Gmail ambiguo o lease abandonado no se reenvía automáticamente", async () => {
  await drain();
  const env = {
    ...process.env,
    EMAIL_PROVIDER: "gmail",
    GMAIL_SENDER: "fixture." + crypto.randomUUID() + "@gmail.com",
  };
  let count = 0;
  const transport = createRecoveryWorker({
    pool: ctx.db,
    env,
    enviarCodigo: async () => {
      count++;
      throw { tipo: "ambiguo" };
    },
  });
  // Solo un remitente sintético y transporte inyectado; ninguna cuenta OAuth o API real.
  for (const crash of [false, true]) {
    const u = await user();
    const cfg = C.config(env),
      id = crypto.randomUUID(),
      identity = C.hmac(cfg.secret, "identity", u.correo),
      jobId = crypto.randomUUID();
    await ctx.db.query(
      "INSERT INTO recuperacion_clave_limites(identidad_hash,activa_id) VALUES($1,$2)",
      [identity, id],
    );
    await ctx.db.query(
      "INSERT INTO recuperaciones_clave(id,identidad_hash,codigo_hash) VALUES($1,$2,$3)",
      [id, identity, C.hmac(cfg.secret, "code", id + ":12345678")],
    );
    await ctx.db.query(
      "INSERT INTO recuperacion_clave_outbox(id,solicitud_id,proposito,proveedor,payload,clave_id) VALUES($1,$2,'codigo','gmail',$3,$4)",
      [
        jobId,
        id,
        C.seal(C.message(cfg.from, u.correo, "12345678"), cfg.key, jobId, id),
        C.keyId(cfg.key),
      ],
    );
    if (crash) {
      const job = await transport.claim();
      assert.equal(job.id, jobId);
      await ctx.db.query(
        "UPDATE recuperacion_clave_outbox SET bloqueado_hasta=clock_timestamp()-INTERVAL '1 second' WHERE id=$1",
        [jobId],
      );
    }
    assert.equal((await transport.procesarUno()).estado, "ambiguo");
    assert.equal(
      (
        await ctx.db.query(
          "SELECT payload FROM recuperacion_clave_outbox WHERE id=$1",
          [jobId],
        )
      ).rows[0].payload,
      null,
    );
  }
  assert.equal(count, 1);
  assert.equal((await transport.procesarUno()).estado, "vacio");
});
test("cambio 2FA posterior a la solicitud invalida el código, incluso si el worker aún no lo había vinculado", async () => {
  await drain();
  const u = await user(),
    p = await request(u.correo);
  await api("/api/auth/2fa/setup", { password: u.password }, u.token, 200);
  const m = (
    await ctx.db.query(
      "SELECT pendiente_secreto FROM usuario_2fa WHERE id_usuario=$1",
      [u.id],
    )
  ).rows[0];
  const secret = require("../totp-crypto")
    .crearCifradoTotp(process.env)
    .decrypt(m.pendiente_secreto, u.id);
  await api("/api/auth/2fa/confirm", { codigo: totp(secret) }, u.token, 200);
  const before = mails.length;
  await drain();
  assert.equal(
    mails.slice(before).filter((x) => x.to[0] === u.correo).length,
    0,
  );
  assert.equal(
    (
      await ctx.db.query(
        "SELECT estado FROM recuperacion_clave_outbox WHERE solicitud_id=$1",
        [p.solicitud_id],
      )
    ).rows[0].estado,
    "cancelado",
  );
});
