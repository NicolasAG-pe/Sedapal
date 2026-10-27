"use strict";
const { iniciar } = require("./email-api.cjs"),
  { sql } = require("./email-schema.cjs"),
  crypto = require("node:crypto");
exports.start = async function () {
  process.env.EMAIL_PROVIDER = "resend";
  process.env.EMAIL_REGISTRATION_ALLOWED_EMAIL = "";
  process.env.PUSH_ENABLED = "1";
  process.env.PUSH_PROVIDER = "mock";
  process.env.PUSH_TOKEN_KEY = crypto.randomBytes(32).toString("base64");
  const ctx = await iniciar({
    databasePrefix: "incident_tracking",
    schemaSql: sql("init.sql").split(
      "-- Seguimiento para instalaciones nuevas.",
    )[0],
  });
  let sequence = 7200;
  async function account(admin = false) {
    const a = ctx.registro(++sequence),
      p = (await ctx.request("register", a, 202)).data,
      d = (
        await ctx.request(
          "verify-email",
          ctx.verificar(p.registro_id, ctx.codigo(a.correo)),
          201,
        )
      ).data;
    if (admin) {
      await ctx.db.query(
        "UPDATE usuarios SET rol='admin' WHERE id_usuario=$1",
        [d.usuario.id_usuario],
      );
      d.token = (
        await ctx.request(
          "login",
          { numero_suministro: a.numero_suministro, password: a.password },
          200,
        )
      ).data.token;
    }
    return { ...a, ...d };
  }
  const client = await account(),
    other = await account(),
    admin = await account(true),
    admin2 = await account(true);
  const { PNG } = require("pngjs");
  const image = new PNG({ width: 12, height: 12 });
  image.data.fill(255);
  const photo = PNG.sync.write(image);
  const legacy = (
    await ctx.db.query(
      "INSERT INTO incidencias(id_suministro,tipo,descripcion,referencia,foto,foto_mime,estado,fecha_registro) VALUES($1,'Fuga','Incidencia anterior de laboratorio','Referencia sintética',$2,'image/png','En revisión','2026-01-10 10:30:00') RETURNING *",
      [client.suministro.id_suministro, photo],
    )
  ).rows[0];
  await ctx.db.query(sql("migrations/011_recuperacion_clave.sql"));
  await ctx.db.query(sql("migrations/012_notificaciones_push.sql"));
  await ctx.db.query(sql("migrations/013_seguimiento_incidencias.sql"));
  await ctx.db.query(sql("migrations/013_seguimiento_incidencias.sql"));
  let ip = 1;
  async function api(route, body, token = client.token, method) {
    const r = await fetch(ctx.base + route, {
      method: method || (body ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": "192.0.2." + ip++,
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await r.json().catch(() => null);
    return { status: r.status, data };
  }
  const create = (body) =>
    api("/api/incidencias", {
      tipo: "Fuga",
      descripcion: "Descripción sintética para probar seguimiento.",
      referencia: "Laboratorio sin datos reales",
      foto_base64: "data:image/png;base64," + photo.toString("base64"),
      foto_mime: "image/png",
      ...body,
    });
  const change = (id, estado, extras = {}, token = admin.token) =>
    api(
      "/api/admin/incidencias/" + id + "/estado",
      { estado, ...extras },
      token,
      "PATCH",
    );
  const history = (id, token = client.token, adminRoute = false, query = "") =>
    api(
      "/api/" +
        (adminRoute ? "admin" : "me") +
        "/incidencias/" +
        id +
        "/seguimiento" +
        query,
      undefined,
      token,
    );
  return {
    ...ctx,
    accounts: { client, other, admin, admin2 },
    legacy,
    photo,
    api,
    create,
    change,
    history,
  };
};
