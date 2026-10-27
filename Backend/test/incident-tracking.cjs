"use strict";
const { test, before, after } = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const { sql } = require("./email-schema.cjs");
let c;
before(async () => {
  c = await require("./incident-tracking-fixture.cjs").start();
});
after(async () => {
  if (c) {
    const close = c.close();
    c.httpServer.closeAllConnections();
    await close;
  }
});
async function created() {
  const r = await c.create();
  assert.equal(r.status, 201);
  return r.data.incidencia;
}
test("013 repetible conserva incidencia/foto anterior sin inventar historial y protege append-only", async () => {
  const before = (
    await c.db.query("SELECT * FROM incidencias WHERE id_incidencia=$1", [
      c.legacy.id_incidencia,
    ])
  ).rows[0];
  await c.db.query(sql("migrations/013_seguimiento_incidencias.sql"));
  assert.deepEqual(
    (
      await c.db.query("SELECT * FROM incidencias WHERE id_incidencia=$1", [
        c.legacy.id_incidencia,
      ])
    ).rows[0],
    before,
  );
  assert.ok(before.foto.equals(c.photo));
  const h = await c.history(c.legacy.id_incidencia);
  assert.equal(h.status, 200);
  assert.equal(h.data.incidencia.historial_completo, false);
  assert.deepEqual(h.data.eventos, []);
  const i = await created();
  for (const query of [
    "UPDATE incidencia_eventos SET estado_nuevo=estado_nuevo",
    "DELETE FROM incidencia_eventos",
    "TRUNCATE incidencia_eventos",
    "INSERT INTO incidencia_eventos(id_incidencia,tipo,estado_nuevo) VALUES(" +
      i.id_incidencia +
      ",'registro','Registrada')",
  ]) {
    await assert.rejects(c.db.query(query), { code: "42501" });
  }
  assert.equal((await c.history(i.id_incidencia)).data.eventos.length, 1);
});
test("registro con fotografía es atómico, evento UUID real y fecha de servidor", async () => {
  const i = await created(),
    h = (await c.history(i.id_incidencia)).data;
  assert.equal(h.incidencia.historial_completo, true);
  assert.equal(h.eventos.length, 1);
  assert.equal(h.eventos[0].tipo, "registro");
  assert.equal(h.eventos[0].estado_nuevo, "Registrada");
  assert.equal(h.eventos[0].estado_anterior, null);
  assert.match(h.eventos[0].id, /^[a-f0-9-]{36}$/);
  assert.ok(Math.abs(Date.now() - Date.parse(h.eventos[0].fecha)) < 10000);
  assert.equal(JSON.stringify(h).includes("foto"), false);
  const foto = await fetch(
    c.base + "/api/incidencias/" + i.id_incidencia + "/foto",
    { headers: { Authorization: "Bearer " + c.accounts.client.token } },
  );
  assert.equal(foto.status, 200);
  assert.ok(Buffer.from(await foto.arrayBuffer()).equals(c.photo));
});
test("Registrada → En revisión → Resuelta: actor solo Admin, comentario público seguro y notificación única", async () => {
  const i = await created();
  for (const estado of ["En revisión", "Resuelta"]) {
    const r = await c.change(i.id_incidencia, estado, {
      solicitud_id: crypto.randomUUID(),
      comentario_publico: "Actualización pública <sin HTML ejecutable>",
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.cambiada, true);
  }
  const h = (await c.history(i.id_incidencia)).data;
  assert.deepEqual(
    h.eventos.map((e) => e.estado_nuevo),
    ["Registrada", "En revisión", "Resuelta"],
  );
  assert.equal(h.incidencia.estado_actual, "Resuelta");
  assert.equal(h.eventos[1].responsable, null);
  assert.equal(
    JSON.stringify(h).includes(c.accounts.admin.usuario.correo),
    false,
  );
  const admin = (await c.history(i.id_incidencia, c.accounts.admin.token, true))
    .data;
  assert.equal(
    String(admin.eventos[1].responsable.id_usuario),
    String(c.accounts.admin.usuario.id_usuario),
  );
  assert.equal(
    (
      await c.db.query(
        "SELECT count(*)::int n FROM notificaciones WHERE id_suministro=$1 AND titulo LIKE $2",
        [
          c.accounts.client.suministro.id_suministro,
          "Incidencia #" + i.id_incidencia + " cambió a %",
        ],
      )
    ).rows[0].n,
    2,
  );
});
test("misma UUID y respuesta perdida no revierten un cambio posterior ni duplican eventos/notificaciones", async () => {
  const i = await created(),
    id = crypto.randomUUID();
  assert.equal(
    (await c.change(i.id_incidencia, "En revisión", { solicitud_id: id }))
      .status,
    200,
  );
  await c.change(i.id_incidencia, "Resuelta", {
    solicitud_id: crypto.randomUUID(),
  });
  const r = await c.change(i.id_incidencia, "En revisión", {
    solicitud_id: id,
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.repetida, true);
  assert.equal(r.data.cambiada, false);
  const h = (await c.history(i.id_incidencia)).data;
  assert.equal(h.incidencia.estado_actual, "Resuelta");
  assert.equal(h.eventos.length, 3);
  assert.equal(
    (await c.change(i.id_incidencia, "Registrada", { solicitud_id: id }))
      .status,
    409,
  );
  await c.change(i.id_incidencia, "Resuelta", {
    comentario_publico: "No se agrega sobre el mismo estado",
  });
  assert.equal((await c.history(i.id_incidencia)).data.eventos.length, 3);
});
test("solicitudes concurrentes iguales se serializan y estados diferentes registran el anterior real", async () => {
  const i = await created(),
    id = crypto.randomUUID();
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      c.change(i.id_incidencia, "En revisión", { solicitud_id: id }),
    ),
  );
  assert.ok(results.every((r) => r.status === 200));
  assert.equal(results.filter((r) => r.data.cambiada).length, 1);
  const next = await Promise.all([
    c.change(i.id_incidencia, "Resuelta", {
      solicitud_id: crypto.randomUUID(),
    }),
    c.change(
      i.id_incidencia,
      "Registrada",
      { solicitud_id: crypto.randomUUID() },
      c.accounts.admin2.token,
    ),
  ]);
  assert.ok(next.every((r) => r.status === 200));
  const h = (await c.history(i.id_incidencia)).data;
  assert.equal(h.eventos.length, 4);
  for (let j = 1; j < h.eventos.length; j++)
    assert.equal(h.eventos[j].estado_anterior, h.eventos[j - 1].estado_nuevo);
  assert.equal(h.eventos.at(-1).estado_nuevo, h.incidencia.estado_actual);
});
test("rollback del origen revierte estado, evento y notificación; no se copia BYTEA", async () => {
  const i = await created(),
    db = await c.db.connect();
  try {
    await db.query("BEGIN");
    await db.query(
      "UPDATE incidencias SET estado='Resuelta' WHERE id_incidencia=$1",
      [i.id_incidencia],
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM incidencia_eventos WHERE id_incidencia=$1",
          [i.id_incidencia],
        )
      ).rows[0].n,
      2,
    );
    await db.query("ROLLBACK");
  } finally {
    db.release();
  }
  assert.equal((await c.history(i.id_incidencia)).data.eventos.length, 1);
  assert.equal(
    (
      await c.db.query(
        "SELECT count(*)::int n FROM information_schema.columns WHERE table_name='incidencia_eventos' AND data_type='bytea'",
      )
    ).rows[0].n,
    0,
  );
});
test("permisos por suministro, usuario/admin, estados inválidos y JWT revocado", async () => {
  const i = await created();
  assert.equal(
    (await c.history(i.id_incidencia, c.accounts.other.token)).status,
    404,
  );
  assert.equal(
    (await c.history("9223372036854775807", c.accounts.other.token)).status,
    404,
  );
  assert.equal((await c.history(i.id_incidencia, null)).status, 401);
  assert.equal(
    (await c.history(i.id_incidencia, c.accounts.client.token, true)).status,
    403,
  );
  assert.equal(
    (await c.change(i.id_incidencia, "Resuelta", {}, c.accounts.client.token))
      .status,
    403,
  );
  assert.equal(
    (
      await c.api(
        "/api/me/incidencias/" + i.id_incidencia + "/seguimiento",
        {},
        c.accounts.client.token,
      )
    ).status,
    404,
  );
  for (const b of [
    { estado: "Nuevo" },
    { estado: "Resuelta", comentario_publico: "x".repeat(301) },
    { estado: "Resuelta", comentario_publico: "\u0000" },
    { estado: "Resuelta", solicitud_id: "not-uuid" },
  ])
    assert.equal(
      (
        await c.api(
          "/api/admin/incidencias/" + i.id_incidencia + "/estado",
          b,
          c.accounts.admin.token,
          "PATCH",
        )
      ).status,
      400,
    );
  assert.equal(
    (await c.history(i.id_incidencia, c.accounts.admin.token, true)).status,
    200,
  );
  const old = c.accounts.other.token;
  await c.db.query("UPDATE usuarios SET activo=false WHERE id_usuario=$1", [
    c.accounts.other.usuario.id_usuario,
  ]);
  assert.equal((await c.history(i.id_incidencia, old)).status, 403);
});
test("paginación acotada y cronológica, sin mezcla de incidencias; legado con cambio sigue sin inventar registro", async () => {
  const i = await created();
  for (let j = 0; j < 5; j++)
    await c.change(i.id_incidencia, j % 2 ? "Resuelta" : "En revisión");
  let after = "",
    events = [];
  do {
    const h = await c.history(
      i.id_incidencia,
      c.accounts.client.token,
      false,
      "?limite=2" + (after ? "&despues=" + after : ""),
    );
    assert.equal(h.status, 200);
    assert.ok(h.data.eventos.length <= 2);
    events.push(...h.data.eventos);
    after = h.data.siguiente;
  } while (after);
  assert.equal(events.length, 6);
  assert.equal(new Set(events.map((e) => e.id)).size, 6);
  for (const q of [
    "?limite=51",
    "?limite=-1",
    "?despues=-2",
    "?despues=9223372036854775808",
  ])
    assert.equal(
      (await c.history(i.id_incidencia, c.accounts.client.token, false, q))
        .status,
      400,
    );
  await c.change(c.legacy.id_incidencia, "Resuelta");
  const legacy = (await c.history(c.legacy.id_incidencia)).data;
  assert.equal(legacy.incidencia.historial_completo, false);
  assert.equal(legacy.eventos.length, 1);
  assert.equal(legacy.eventos[0].tipo, "estado");
  assert.equal(legacy.incidencia.estado_actual, "Resuelta");
  assert.equal(
    legacy.incidencia.fecha_registro_original,
    "2026-01-10 10:30:00",
  );
  assert.equal(JSON.stringify(legacy).includes('"orden"'), false);
  assert.equal(
    (
      await c.history(
        i.id_incidencia,
        c.accounts.client.token,
        false,
        "?despues=" + legacy.eventos[0].id,
      )
    ).status,
    400,
  );
});

test("fallo de notificación revierte el estado y el evento; no queda decisión idempotente ficticia", async () => {
  const i = await created(),
    request = crypto.randomUUID();
  // Fallo inyectado solo en esta base nueva de laboratorio; no se alteran datos históricos.
  await c.db
    .query(`CREATE FUNCTION fixture_notice_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END; $$;
    CREATE TRIGGER fixture_notice_failure BEFORE INSERT ON notificaciones FOR EACH ROW EXECUTE FUNCTION fixture_notice_failure()`);
  try {
    assert.equal(
      (await c.change(i.id_incidencia, "Resuelta", { solicitud_id: request }))
        .status,
      503,
    );
    const h = (await c.history(i.id_incidencia)).data;
    assert.equal(h.incidencia.estado_actual, "Registrada");
    assert.equal(h.eventos.length, 1);
    assert.equal(
      (
        await c.db.query(
          "SELECT count(*)::int n FROM incidencia_cambios WHERE solicitud_id=$1",
          [request],
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await c.db.query(
      "DROP TRIGGER fixture_notice_failure ON notificaciones; DROP FUNCTION fixture_notice_failure()",
    );
  }
  assert.equal(
    (await c.change(i.id_incidencia, "Resuelta", { solicitud_id: request }))
      .status,
    200,
  );
});

test("Socket.IO después del commit y una sola notificación/entrega push por cambio, sin fotografías", async () => {
  const { io } = require("../../Frontend/assets/vendor/socket.io.min.js"),
    { once } = require("node:events");
  global.WebSocket = require("ws");
  const socket = io(c.base, {
    transports: ["websocket"],
    auth: { token: c.accounts.client.token },
    reconnection: false,
  });
  const received = [],
    notices = [];
  socket.on("incidencia:actualizada", (x) => received.push(x));
  socket.on("notificacion:nueva", (x) => notices.push(x));
  try {
    await once(socket, "connect");
    const d = {
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
    assert.equal((await c.api("/api/push/devices", d)).status, 200);
    const i = await created();
    received.length = notices.length = 0;
    const request = crypto.randomUUID();
    const live = new Promise((resolve) =>
      socket.once("incidencia:actualizada", resolve),
    );
    const result = await c.change(i.id_incidencia, "En revisión", {
      solicitud_id: request,
    });
    assert.equal(result.status, 200);
    await Promise.race([
      live,
      new Promise((_, reject) =>
        setTimeout(() => reject(Error("Falta evento Socket.IO")), 3000).unref(),
      ),
    ]);
    const h = (await c.history(i.id_incidencia)).data;
    assert.equal(h.eventos.length, 2); // visible en SQL antes de consumir el evento
    await c.change(i.id_incidencia, "En revisión", { solicitud_id: request });
    await c.change(i.id_incidencia, "En revisión");
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(received.length, 1);
    assert.equal(notices.length, 1);
    assert.deepEqual(Object.keys(received[0]).sort(), ["estado", "id"]);
    const notice = (
      await c.db.query(
        "SELECT id_notificacion FROM notificaciones WHERE id_suministro=$1 AND titulo=$2",
        [
          c.accounts.client.suministro.id_suministro,
          "Incidencia #" + i.id_incidencia + " cambió a En revisión",
        ],
      )
    ).rows;
    assert.equal(notice.length, 1);
    assert.equal(
      (
        await c.db.query(
          "SELECT count(*)::int n FROM push_entregas WHERE id_notificacion=$1",
          [notice[0].id_notificacion],
        )
      ).rows[0].n,
      1,
    );
    const sent = [],
      worker = require("../push-worker").createPushWorker({
        pool: c.db,
        send: require("../push-provider").mockSender((x) => sent.push(x)),
      });
    for (let n = 0; n < 100; n++) {
      if ((await worker.processOne()).estado === "vacio") break;
    }
    assert.equal(sent.length, 1);
    assert.ok(
      !JSON.stringify(sent[0].message).includes("Descripción sintética"),
    );
  } finally {
    socket.disconnect();
  }
});
