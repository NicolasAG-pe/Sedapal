"use strict";
const { test, before, after } = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const { iniciar } = require("./email-api.cjs"),
  { sql } = require("./email-schema.cjs"),
  { createPushWorker, reminders, retire } = require("../push-worker"),
  {
    mockSender,
    createFcmSender,
    configuredSender,
  } = require("../push-provider"),
  P = require("../push");
let ctx,
  worker,
  ip = 1,
  seq = 5000;
const sent = [];
before(async () => {
  process.env.EMAIL_PROVIDER = "resend";
  process.env.EMAIL_REGISTRATION_ALLOWED_EMAIL = "";
  process.env.PUSH_TOKEN_KEY = crypto.randomBytes(32).toString("base64");
  process.env.PUSH_ENABLED = "1";
  process.env.PUSH_PROVIDER = "mock";
  ctx = await iniciar({ databasePrefix: "push" });
  await ctx.db.query(sql("migrations/011_recuperacion_clave.sql"));
  await ctx.db.query(sql("migrations/012_notificaciones_push.sql"));
  await ctx.db.query(sql("migrations/012_notificaciones_push.sql"));
  worker = createPushWorker({
    pool: ctx.db,
    send: mockSender((x) => sent.push(x)),
  });
});
after(async () => {
  if (ctx) {
    const closing = ctx.close();
    ctx.httpServer.closeAllConnections();
    await closing;
  }
});
async function api(path, body, token, method) {
  const r = await fetch(ctx.base + path, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": "192.0.2." + ip++,
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let d;
  try {
    d = await r.json();
  } catch (_) {}
  return { status: r.status, data: d };
}
async function user(admin = false) {
  const a = ctx.registro(++seq),
    p = (await ctx.request("register", a, 202)).data,
    d = (
      await ctx.request(
        "verify-email",
        ctx.verificar(p.registro_id, ctx.codigo(a.correo)),
        201,
      )
    ).data;
  if (admin) {
    await ctx.db.query("UPDATE usuarios SET rol='admin' WHERE id_usuario=$1", [
      d.usuario.id_usuario,
    ]);
    d.token = (
      await ctx.request(
        "login",
        { numero_suministro: a.numero_suministro, password: a.password },
        200,
      )
    ).data.token;
  }
  return {
    ...a,
    ...d,
    id: d.usuario.id_usuario,
    supply: d.suministro.id_suministro,
  };
}
function device() {
  return {
    installation_id: crypto.randomUUID(),
    proof: crypto.randomBytes(32).toString("base64url"),
    token: "fixture:" + crypto.randomBytes(48).toString("base64url"),
    consent: true,
    categories: {
      recibos: true,
      vencimientos: true,
      incidencias: true,
      cortes: true,
    },
  };
}
async function bind(u, d, status = 200) {
  const r = await api("/api/push/devices", d, u.token);
  assert.equal(r.status, status);
  return r.data;
}
async function notice(u, type = "recibo", key = crypto.randomUUID()) {
  return (
    await ctx.db.query(
      "INSERT INTO notificaciones(id_suministro,alcance,titulo,mensaje,tipo,push_clave) VALUES($1,'Usuario','Fixture','Solo laboratorio',$2,$3) ON CONFLICT DO NOTHING RETURNING *",
      [u.supply, type, key],
    )
  ).rows[0];
}
async function drain(w = worker) {
  for (let i = 0; i < 100; i++) {
    const r = await w.processOne();
    if (r.estado === "vacio") return;
  }
  throw Error("Fixture push no vacía");
}
test('prueba única dirigida no reclama otra entrega ni reintenta un fallo transitorio', async () => {
  const u = await user(), d = device(); await bind(u, d);
  const first = await notice(u), second = await notice(u, 'incidencia');
  const selected = (await ctx.db.query('SELECT id FROM push_entregas WHERE id_notificacion=$1', [second.id_notificacion])).rows[0].id;
  let calls = 0;
  const make = () => createPushWorker({ pool: ctx.db, deliveryId: selected, singleAttempt: true,
    send: async ({ message }) => { calls++; assert.equal(message.data.hm_event, second.push_evento); return { kind: 'transitorio' }; } });
  assert.throws(() => createPushWorker({ pool: ctx.db, singleAttempt: true, send: mockSender() }));
  assert.equal((await make().processOne()).estado, 'fallido');
  assert.equal((await make().processOne()).estado, 'vacio'); assert.equal(calls, 1);
  const untouched = (await ctx.db.query('SELECT estado,intentos FROM push_entregas WHERE id_notificacion=$1', [first.id_notificacion])).rows[0];
  assert.deepEqual(untouched, { estado: 'pendiente', intentos: 0 });
  await drain(); // Solo mock de laboratorio; ninguna entrega externa.
});
test("cerrado por defecto, sin autenticación/consentimiento/admin no registra; clave independiente", async () => {
  delete process.env.PUSH_ENABLED;
  assert.equal((await api("/api/push/capabilities")).data.disponible, false);
  assert.equal((await api("/api/push/devices", device())).status, 401);
  process.env.PUSH_ENABLED = "1";
  const u = await user();
  await bind(u, { ...device(), consent: false }, 400);
  await bind(await user(true), device(), 403);
  assert.throws(() =>
    P.configuration({
      ...process.env,
      PUSH_TOKEN_KEY: Buffer.from(
        process.env.AUTH_TOKEN_SECRET,
        "hex",
      ).toString("base64"),
    }),
  );
  assert.throws(() =>
    configuredSender({ PUSH_PROVIDER: "mock", NODE_ENV: "production" }),
  );
  assert.throws(() => configuredSender({ PUSH_PROVIDER: "fcm" }));
});
test("cifrado GCM, varios dispositivos, rotación idempotente y aislamiento por suministro", async () => {
  const u = await user(),
    v = await user(),
    a = device(),
    b = device();
  await bind(u, a);
  await bind(u, b);
  await bind(v, device());
  let row = (
    await ctx.db.query("SELECT * FROM push_dispositivos WHERE id=$1", [
      a.installation_id,
    ])
  ).rows[0];
  assert.ok(!row.token_cifrado.includes(Buffer.from(a.token)));
  assert.equal(
    P.open(
      row.token_cifrado,
      P.configuration().key,
      a.installation_id,
      row.revision,
    ),
    a.token,
  );
  const tampered = Buffer.from(row.token_cifrado);
  tampered[15] ^= 1;
  assert.throws(() =>
    P.open(tampered, P.configuration().key, a.installation_id, row.revision),
  );
  await bind(u, a);
  assert.equal(
    (
      await ctx.db.query("SELECT revision FROM push_dispositivos WHERE id=$1", [
        a.installation_id,
      ])
    ).rows[0].revision,
    1,
  );
  await bind(v, { ...a, proof: device().proof }, 403);
  await bind(v, { ...device(), token: a.token }, 409);
  const n = await notice(u);
  assert.equal(
    (
      await ctx.db.query(
        "SELECT count(*)::int n FROM push_entregas WHERE id_notificacion=$1",
        [n.id_notificacion],
      )
    ).rows[0].n,
    2,
  );
  a.token = device().token;
  await bind(u, a);
  assert.equal(
    (
      await ctx.db.query(
        "SELECT estado FROM push_entregas WHERE id_dispositivo=$1 AND id_notificacion=$2",
        [a.installation_id, n.id_notificacion],
      )
    ).rows[0].estado,
    "cancelado",
  );
  await drain();
  assert.equal(
    sent.filter((s) => s.message.data.hm_event === n.push_evento).length,
    1,
  );
  assert.equal(
    (await api("/api/push/events/" + n.push_evento, undefined, u.token)).data
      .seccion,
    "historial",
  );
  assert.equal(
    (await api("/api/push/events/" + n.push_evento, undefined, v.token)).status,
    404,
  );
  assert.equal((await api("/api/push/events/" + n.push_evento)).status, 401);
});
test("revocación capability idempotente y cambio de cuenta cancela cola anterior", async () => {
  const u = await user(),
    v = await user(),
    d = device();
  await bind(u, d);
  const n = await notice(u);
  await bind(v, d);
  await drain();
  assert.equal(
    sent.filter((s) => s.message.data.hm_event === n.push_evento).length,
    0,
  );
  await notice(v);
  assert.equal(
    (
      await api("/api/push/revoke", {
        installation_id: d.installation_id,
        proof: device().proof,
      })
    ).status,
    204,
  );
  assert.equal(
    (
      await ctx.db.query("SELECT activo FROM push_dispositivos WHERE id=$1", [
        d.installation_id,
      ])
    ).rows[0].activo,
    true,
  );
  for (let i = 0; i < 2; i++)
    assert.equal((await api("/api/push/revoke", d)).status, 204);
  await drain();
  assert.equal(
    (
      await ctx.db.query(
        "SELECT token_cifrado FROM push_dispositivos WHERE id=$1",
        [d.installation_id],
      )
    ).rows[0].token_cifrado,
    null,
  );
});
test("revocación de JWT/2FA y cuenta deshabilitada impiden entregar; MFA challenge no accede", async () => {
  const jwt = require("jsonwebtoken");
  const u = await user(),
    d = device();
  await bind(u, d);
  const n = await notice(u);
  const fake = jwt.sign(
    { id_usuario: u.id, rol: "usuario", token_use: "mfa_challenge" },
    process.env.AUTH_TOKEN_SECRET,
  );
  assert.equal((await api("/api/push/devices", d, fake)).status, 401);
  await ctx.db.query(
    "UPDATE usuarios SET clave_hash=clave_hash||$2 WHERE id_usuario=$1",
    [u.id, ":fixture-change"],
  );
  await drain();
  assert.equal(
    sent.filter((s) => s.message.data.hm_event === n.push_evento).length,
    0,
  );
  assert.equal(
    (
      await ctx.db.query(
        "SELECT activo,token_cifrado FROM push_dispositivos WHERE id=$1",
        [d.installation_id],
      )
    ).rows[0].activo,
    false,
  );
  const v = await user(),
    e = device();
  await bind(v, e);
  await notice(v);
  await ctx.db.query("UPDATE usuarios SET activo=false WHERE id_usuario=$1", [
    v.id,
  ]);
  await drain();
  assert.equal(
    (
      await ctx.db.query("SELECT activo FROM push_dispositivos WHERE id=$1", [
        e.installation_id,
      ])
    ).rows[0].activo,
    false,
  );
});
test("preferencias, evento duplicado, lectura separada y payload sin datos sensibles", async () => {
  const u = await user(),
    d = device();
  d.categories.incidencias = false;
  await bind(u, d);
  const n = await notice(u, "incidencia"),
    key = crypto.randomUUID(),
    p = await notice(u, "recibo", key);
  await notice(u, "recibo", key);
  assert.equal(
    (
      await ctx.db.query(
        "SELECT count(*)::int n FROM push_entregas WHERE id_notificacion=$1",
        [n.id_notificacion],
      )
    ).rows[0].n,
    0,
  );
  await drain();
  assert.equal(
    sent.filter((s) => s.message.data.hm_event === p.push_evento).length,
    1,
  );
  const msg = sent.find(
    (s) => s.message.data.hm_event === p.push_evento,
  ).message;
  assert.deepEqual(Object.keys(msg.data), ["hm_event"]);
  assert.ok(
    !JSON.stringify(msg).includes(u.correo) &&
      !JSON.stringify(msg).includes(u.numero_suministro),
  );
  assert.equal(
    (
      await ctx.db.query(
        "SELECT count(*)::int n FROM notificaciones_lecturas WHERE id_notificacion=$1",
        [p.id_notificacion],
      )
    ).rows[0].n,
    0,
  );
});
test("vencimientos programables: fechas reales, idempotencia, anulado/pagado excluidos y revisión antes de enviar", async () => {
  const u = await user(),
    d = device();
  await bind(u, d);
  await assert.rejects(
    reminders(ctx.db, { ...process.env, PUSH_REMINDERS_ENABLED: "0" }),
  );
  const {
    rows: [r],
  } = await ctx.db.query(
    "INSERT INTO recibos(id_suministro,periodo,fecha_emision,fecha_vencimiento,monto,consumo_m3,estado) VALUES($1,'fixture',CURRENT_DATE,CURRENT_DATE+1,20,4,'Pendiente') RETURNING *",
    [u.supply],
  );
  process.env.PUSH_REMINDERS_ENABLED = "1";
  await reminders(ctx.db);
  await reminders(ctx.db);
  const rows = (
    await ctx.db.query("SELECT * FROM notificaciones WHERE push_recibo=$1", [
      r.id_recibo,
    ])
  ).rows;
  assert.equal(rows.length, 1);
  await ctx.db.query("UPDATE recibos SET estado='Pagado' WHERE id_recibo=$1", [
    r.id_recibo,
  ]);
  await drain();
  assert.equal(
    sent.filter((s) => s.message.data.hm_event === rows[0].push_evento).length,
    0,
  );
});
test("cortes localizados y asociación legacy: solo destinatarios, cancelación y ubicación revalidadas", async () => {
  const a = await user(),
    b = await user(),
    c = await user();
  for (const u of [a, b, c]) await bind(u, device());
  await ctx.db.query(
    "UPDATE suministros SET distrito='Distrito Fixture',zona=CASE WHEN id_suministro=$1 THEN 'A' ELSE 'B' END WHERE id_suministro IN($1,$2,$3)",
    [a.supply, b.supply, c.supply],
  );
  const {
    rows: [cut],
  } = await ctx.db.query(
    "INSERT INTO cortes_servicio(alcance,distrito,zona,motivo,fecha_inicio,fecha_fin) VALUES('Zona','Distrito Fixture','A','Fixture',clock_timestamp(),clock_timestamp()+INTERVAL '2 hours') RETURNING *",
  );
  const ns = (
    await ctx.db.query("SELECT * FROM notificaciones WHERE push_corte=$1", [
      cut.id_corte,
    ])
  ).rows;
  assert.equal(ns.length, 1);
  assert.equal(String(ns[0].id_suministro), String(a.supply));
  await drain();
  assert.equal(
    sent.filter((s) => s.message.data.hm_event === ns[0].push_evento).length,
    1,
  );
  const legacy = (
    await ctx.db.query(
      "INSERT INTO cortes_servicio(motivo) VALUES('Legacy fixture') RETURNING *",
    )
  ).rows[0];
  await ctx.db.query("INSERT INTO cortes_suministros VALUES($1,$2)", [
    legacy.id_corte,
    b.supply,
  ]);
  const target = (
    await ctx.db.query("SELECT * FROM notificaciones WHERE push_corte=$1", [
      legacy.id_corte,
    ])
  ).rows;
  assert.equal(target.length, 1);
  await ctx.db.query(
    "UPDATE cortes_servicio SET cancelado=true WHERE id_corte=$1",
    [legacy.id_corte],
  );
  await drain();
  assert.equal(
    sent.filter((s) => s.message.data.hm_event === target[0].push_evento)
      .length,
    0,
  );
});
test("dos workers, fallos temporales, token inválido y envío ambiguo no duplican aceptación", async () => {
  const u = await user(),
    d = device();
  await bind(u, d);
  let attempts = 0;
  const w = createPushWorker({
      pool: ctx.db,
      send: async () => {
        attempts++;
        return attempts === 1
          ? { kind: "transitorio", retryAfter: 120 }
          : { kind: "simulado" };
      },
    }),
    n = await notice(u);
  await Promise.all([w.processOne(), w.processOne()]);
  assert.equal(attempts, 1);
  await ctx.db.query(
    "UPDATE push_entregas SET disponible_en=clock_timestamp()-INTERVAL '1 second' WHERE id_notificacion=$1",
    [n.id_notificacion],
  );
  await w.processOne();
  assert.equal(attempts, 2);
  await notice(u);
  const bad = createPushWorker({
    pool: ctx.db,
    send: async () => ({ kind: "token_invalido" }),
  });
  await bad.processOne();
  assert.equal(
    (
      await ctx.db.query("SELECT activo FROM push_dispositivos WHERE id=$1", [
        d.installation_id,
      ])
    ).rows[0].activo,
    false,
  );
  const v = await user(),
    e = device();
  await bind(v, e);
  const m = await notice(v);
  const unknown = createPushWorker({
    pool: ctx.db,
    send: async () => {
      throw Error("Red cortada");
    },
  });
  assert.equal((await unknown.processOne()).estado, "ambiguo");
  await unknown.processOne();
  assert.equal(
    (
      await ctx.db.query(
        "SELECT intentos FROM push_entregas WHERE id_notificacion=$1",
        [m.id_notificacion],
      )
    ).rows[0].intentos,
    1,
  );
});
test("caducidad de autorización y retención solo en metadatos push; centro conservado", async () => {
  const u = await user(),
    d = device();
  await bind(u, d);
  const n = await notice(u);
  await ctx.db.query(
    "UPDATE push_dispositivos SET autorizado_hasta=clock_timestamp()-INTERVAL '1 second' WHERE id=$1",
    [d.installation_id],
  );
  await retire(ctx.db);
  await drain();
  assert.equal(
    (
      await ctx.db.query(
        "SELECT token_cifrado FROM push_dispositivos WHERE id=$1",
        [d.installation_id],
      )
    ).rows[0].token_cifrado,
    null,
  );
  await ctx.db.query(
    "UPDATE push_entregas SET finalizado_en=clock_timestamp()-INTERVAL '31 days' WHERE id_notificacion=$1",
    [n.id_notificacion],
  );
  await ctx.db.query(
    "UPDATE push_dispositivos SET actualizado_en=clock_timestamp()-INTERVAL '31 days' WHERE id=$1",
    [d.installation_id],
  );
  await retire(ctx.db);
  assert.equal(
    (
      await ctx.db.query(
        "SELECT id_dispositivo FROM push_entregas WHERE id_notificacion IS NULL LIMIT 1",
      )
    ).rows.length > 0,
    true,
  );
  assert.equal(
    (
      await ctx.db.query(
        "SELECT count(*)::int n FROM notificaciones WHERE id_notificacion=$1",
        [n.id_notificacion],
      )
    ).rows[0].n,
    1,
  );
});
test("adaptador HTTP v1: scope/proyecto/payload fijo, errores definitivos/transitorios/ambiguos y sin red real", async () => {
  const calls = [];
  const make = (r) =>
    createFcmSender({
      projectId: "hidro-fixture",
      getAccessToken: async () => "fixture-access",
      fetchImpl: async (url, o) => {
        calls.push({ url, o });
        return r;
      },
    });
  const msg = require("../push-worker").payload(crypto.randomUUID(), "cortes");
  assert.equal((await make(Response.json({}))({token:'fixture-token',message:msg})).kind,'ambiguo');
  assert.equal(
    (
      await make(
        Response.json({ name: "projects/hidro-fixture/messages/fixture" }),
      )({ token: "fixture-token", message: msg })
    ).kind,
    "aceptado",
  );
  assert.equal(
    (
      await make(
        Response.json(
          {
            error: {
              details: [
                {
                  "@type":
                    "type.googleapis.com/google.firebase.fcm.v1.FcmError",
                  errorCode: "UNREGISTERED",
                },
              ],
            },
          },
          { status: 404 },
        ),
      )({ token: "fixture-token", message: msg })
    ).kind,
    "token_invalido",
  );
  assert.equal(
    (
      await make(Response.json({ error: {} }, { status: 400 }))({
        token: "fixture-token",
        message: msg,
      })
    ).kind,
    "permanente",
  );
  assert.equal(
    (
      await make(
        Response.json(
          { error: {} },
          { status: 429, headers: { "Retry-After": "120" } },
        ),
      )({ token: "fixture-token", message: msg })
    ).retryAfter,
    120,
  );
  assert.equal(
    calls[0].url,
    "https://fcm.googleapis.com/v1/projects/hidro-fixture/messages:send",
  );
  assert.equal(calls[0].o.redirect, "error");
});
test("eventos reales API: recibo, incidencia idempotente y corte General; centro y sockets existentes", async () => {
  const admin = await user(true),
    u = await user(),
    d = device();
  await bind(u, d);
  const r = await api(
    "/api/admin/recibos",
    {
      numero_suministro: u.numero_suministro,
      periodo: "2026-10",
      fecha_emision: "2026-10-01",
      fecha_vencimiento: "2026-10-30",
      monto: 30,
      consumo_m3: 5,
      estado: "Pendiente",
    },
    admin.token,
  );
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const inc = (
    await ctx.db.query(
      "INSERT INTO incidencias(id_suministro,tipo,descripcion) VALUES($1,'Fixture','Sin datos reales') RETURNING id_incidencia",
      [u.supply],
    )
  ).rows[0];
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await api(
          "/api/admin/incidencias/" + inc.id_incidencia + "/estado",
          { estado: "En revisión" },
          admin.token,
          "PATCH",
        )
      ).status,
      200,
    );
  assert.equal(
    (
      await ctx.db.query(
        "SELECT count(*)::int n FROM notificaciones WHERE id_suministro=$1 AND tipo='incidencia'",
        [u.supply],
      )
    ).rows[0].n,
    1,
  );
  const cut = await api(
    "/api/admin/cortes",
    {
      alcance: "General",
      motivo: "Fixture",
      fecha_inicio: new Date(Date.now() + 3600000).toISOString(),
      fecha_fin: new Date(Date.now() + 7200000).toISOString(),
    },
    admin.token,
  );
  assert.equal(cut.status, 201);
  await drain();
  for (const category of ["recibos", "incidencias", "cortes"])
    assert.ok(
      sent.some(
        (s) =>
          s.token === d.token &&
          s.message.notification.body ===
            require("../push-worker").payload(crypto.randomUUID(), category)
              .notification.body,
      ),
    );
  const center = await api("/api/notificaciones", undefined, u.token);
  assert.equal(center.status, 200);
  assert.ok(center.data.notificaciones.length >= 3);
});
test("lease abandonado no reenvía y el cambio de propietario cancela el aviso", async () => {
  const u = await user(),
    d = device();
  await bind(u, d);
  const n = await notice(u);
  const job = await worker.claim();
  assert.ok(job.lease);
  await ctx.db.query(
    "UPDATE push_entregas SET bloqueado_hasta=clock_timestamp()-INTERVAL '1 second' WHERE id=$1",
    [job.id],
  );
  assert.equal((await worker.processOne()).estado, "ambiguo");
  assert.equal(
    sent.some((s) => s.message.data.hm_event === n.push_evento),
    false,
  );
  const v = await user(),
    e = device();
  await bind(v, e);
  await notice(v);
  await ctx.db.query(
    "UPDATE suministros SET id_usuario=$2 WHERE id_suministro=$1",
    [v.supply, u.id],
  );
  await drain();
  assert.equal(
    (
      await ctx.db.query(
        "SELECT estado FROM push_entregas WHERE id_dispositivo=$1 ORDER BY creado_en DESC LIMIT 1",
        [e.installation_id],
      )
    ).rows[0].estado,
    "cancelado",
  );
});
test("credencial FCM privada: scope mínimo, OAuth simulado, caché, permisos y destinos fijos", async () => {
  const fs = require("node:fs"),
    os = require("node:os"),
    path = require("node:path"),
    folder = fs.mkdtempSync(path.join(os.tmpdir(), "hm-push-service-fixture-")),
    file = path.join(folder, "service-account-fixture.json");
  fs.chmodSync(folder, 0o700);
  const { privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  fs.writeFileSync(
    file,
    JSON.stringify({
      type: "service_account",
      project_id: "hidro-fixture",
      client_email: "fixture@hidro-fixture.iam.gserviceaccount.com",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
    }),
    { mode: 0o600 },
  );
  const env = {
      PUSH_PROVIDER: "fcm",
      PUSH_REAL_DELIVERY_ALLOWED: "1",
      PUSH_SERVICE_ACCOUNT_FILE: file,
      PUSH_FIREBASE_PROJECT_ID: "hidro-fixture",
      PUSH_SENDER_SERVICE_ACCOUNT: "fixture@hidro-fixture.iam.gserviceaccount.com",
    },
    original = global.fetch;
  let grants = 0,
    sends = 0;
  try {
    global.fetch = async (url, options) => {
      assert.equal(options.redirect, "error");
      if (url === "https://oauth2.googleapis.com/token") {
        grants++;
        const body = new URLSearchParams(options.body),
          claims = JSON.parse(
            Buffer.from(body.get("assertion").split(".")[1], "base64url"),
          );
        assert.equal(
          claims.scope,
          "https://www.googleapis.com/auth/firebase.messaging",
        );
        assert.equal(claims.aud, url);
        return Response.json({
          access_token: "fixture-access-token",
          expires_in: 3600,
        });
      }
      assert.equal(
        url,
        "https://fcm.googleapis.com/v1/projects/hidro-fixture/messages:send",
      );
      sends++;
      return Response.json({ name: "projects/hidro-fixture/messages/fixture" });
    };
    const send = configuredSender(env),
      message = require("../push-worker").payload(
        crypto.randomUUID(),
        "incidencias",
      );
    for (let i = 0; i < 2; i++)
      assert.equal(
        (await send({ token: "fixture-token", message })).kind,
        "aceptado",
      );
    assert.equal(grants, 1);
    assert.equal(sends, 2);
    fs.chmodSync(file, 0o644);
    assert.throws(() => configuredSender(env));
    assert.throws(() =>
      configuredSender({ ...env, PUSH_REAL_DELIVERY_ALLOWED: "0" }),
    );
  } finally {
    global.fetch = original;
    fs.chmodSync(file, 0o600);
  }
});
test("revocación después del claim y antes del envío impide llamar al proveedor", async () => {
  const u = await user(),
    d = device();
  await bind(u, d);
  await notice(u);
  let revoked = false,
    called = 0;
  const guarded = {
    connect: () => ctx.db.connect(),
    query: async (text, args) => {
      if (
        !revoked &&
        text.startsWith("SELECT 1 ") &&
        text.includes("FROM push_entregas")
      ) {
        revoked = true;
        assert.equal((await api("/api/push/revoke", d)).status, 204);
      }
      return ctx.db.query(text, args);
    },
  };
  const w = createPushWorker({
    pool: guarded,
    send: async () => {
      called++;
      return { kind: "simulado" };
    },
  });
  const result = await w.processOne();
  assert.equal(revoked, true);
  assert.equal(called, 0);
  assert.ok(["cancelado", "sin_lease"].includes(result.estado));
});
