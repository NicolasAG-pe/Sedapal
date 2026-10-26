"use strict";
const crypto = require("node:crypto");
const C = require("./password-recovery-crypto");
const uuid = (v) =>
  typeof v === "string" &&
  /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const generic = {
  estado: "ok",
  mensaje:
    "Si el correo corresponde a una cuenta habilitada y verificada, recibirás instrucciones. Revisa también spam.",
  espera_segundos: 60,
};
const invalid = () => ({
  error: {
    status: 400,
    mensaje:
      "Código o permiso inválido, vencido o ya utilizado. Solicita uno nuevo si no puedes continuar.",
  },
});
async function transaction(pool, fn) {
  const c = await pool.connect();
  let discard;
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL lock_timeout='2s'");
    await c.query("SET LOCAL statement_timeout='10s'");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {
      discard = Error("Descartar conexión de recuperación.");
    });
    throw e;
  } finally {
    c.release(discard);
  }
}
async function lock(c, identity) {
  await c.query("SELECT pg_advisory_xact_lock(7411,hashtext($1))", [identity]);
}
async function enqueue(c, config, request, purpose, to, code) {
  const id = crypto.randomUUID(),
    payload = C.seal(C.message(config.from, to, code), config.key, id, request);
  await c.query(
    `INSERT INTO recuperacion_clave_outbox(id,solicitud_id,proposito,proveedor,payload,clave_id) VALUES($1,$2,$3,$4,$5,$6)`,
    [id, request, purpose, config.provider, payload, C.keyId(config.key)],
  );
}
async function account(c, id) {
  const {
    rows: [u],
  } = await c.query(
    "SELECT id_usuario,correo,correo_verificado_en,rol,activo,clave_hash FROM usuarios WHERE id_usuario=$1 FOR UPDATE",
    [id],
  );
  if (!u) return null;
  const {
    rows: [m],
  } = await c.query(
    "SELECT version,activo,cambio_seguridad_en FROM usuario_2fa WHERE id_usuario=$1 FOR UPDATE",
    [id],
  );
  return {
    ...u,
    mfa_version: m?.version || 0,
    mfa_activo: m?.activo || false,
    cambio_seguridad_en: m?.cambio_seguridad_en,
  };
}
function eligible(u) {
  return (
    u?.activo === true &&
    u.correo_verificado_en &&
    ["usuario", "admin"].includes(u.rol) &&
    (u.rol !== "admin" || u.mfa_activo)
  );
}
function createPasswordRecovery({
  pool,
  hashPassword,
  verifyPassword,
  verifyFactor,
  closeSockets = () => {},
  env = process.env,
}) {
  function configuration() {
    return C.config(env);
  }
  async function inspect(c, id) {
    const {
      rows: [r],
    } = await c.query(
      "SELECT *,clock_timestamp() AS ahora FROM recuperaciones_clave WHERE id=$1",
      [id],
    );
    if (r) await lock(c, r.identidad_hash);
    return r;
  }
  async function current(c, r) {
    const {
      rows: [limits],
    } = await c.query(
      "SELECT activa_id FROM recuperacion_clave_limites WHERE identidad_hash=$1",
      [r.identidad_hash],
    );
    return limits?.activa_id === r.id;
  }
  function live(r) {
    return (
      r &&
      !r.invalidado_en &&
      !r.usado_en &&
      r.intentos < 5 &&
      new Date(r.vence_en) > new Date(r.ahora)
    );
  }
  function same(u, r, cfg) {
    return (
      eligible(u) &&
      u.mfa_version === r.version_seguridad &&
      C.sha(u.clave_hash) === r.clave_huella &&
      C.hmac(cfg.secret, "identity", u.correo.trim().toLowerCase()) ===
        r.identidad_hash
    );
  }
  return {
    enabled() {
      try {
        return !!configuration();
      } catch (_) {
        return false;
      }
    },
    async request(body) {
      const cfg = configuration();
      if (!cfg)
        return {
          error: {
            status: 503,
            mensaje:
              "La recuperación no está disponible temporalmente. Contacta por los canales de atención.",
          },
        };
      const email =
        typeof body.correo === "string" ? body.correo.trim().toLowerCase() : "";
      if (
        !uuid(body.solicitud_id) ||
        email.length > 120 ||
        !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)
      )
        return {
          error: {
            status: 400,
            mensaje: "Introduce un correo válido e inicia una solicitud nueva.",
          },
        };
      const id = body.solicitud_id,
        identity = C.hmac(cfg.secret, "identity", email),
        code = crypto.randomInt(0, 100000000).toString().padStart(8, "0");
      await transaction(pool, async (c) => {
        await lock(c, identity);
        await c.query(
          "INSERT INTO recuperacion_clave_limites(identidad_hash) VALUES($1) ON CONFLICT DO NOTHING",
          [identity],
        );
        const {
          rows: [budget],
        } = await c.query(
          "SELECT *,clock_timestamp() AS ahora FROM recuperacion_clave_limites WHERE identidad_hash=$1 FOR UPDATE",
          [identity],
        );
        if (
          (
            await c.query("SELECT id FROM recuperaciones_clave WHERE id=$1", [
              id,
            ])
          ).rowCount
        )
          return;
        const elapsed = new Date(budget.ahora) - new Date(budget.ventana_en),
          count = elapsed >= 3600000 ? 0 : budget.solicitudes;
        if (
          count >= 3 ||
          (budget.ultimo_envio_en &&
            new Date(budget.ahora) - new Date(budget.ultimo_envio_en) < 60000)
        )
          return;
        // Mismo trabajo para direcciones existentes/desconocidas: elegibilidad solo en el worker.
        await c.query(
          "INSERT INTO recuperaciones_clave(id,identidad_hash,codigo_hash) VALUES($1,$2,$3)",
          [id, identity, C.hmac(cfg.secret, "code", id + ":" + code)],
        );
        await enqueue(c, cfg, id, "codigo", email, code);
        await c.query(
          `UPDATE recuperacion_clave_limites SET activa_id=$2,solicitudes=$3,ultimo_envio_en=clock_timestamp(),ventana_en=CASE WHEN $4 THEN clock_timestamp() ELSE ventana_en END WHERE identidad_hash=$1`,
          [identity, id, count + 1, elapsed >= 3600000],
        );
      });
      return { ...generic, solicitud_id: id };
    },
    async verify(body) {
      const cfg = configuration();
      if (!cfg)
        return {
          error: {
            status: 503,
            mensaje: "La recuperación no está disponible temporalmente.",
          },
        };
      if (
        !uuid(body.solicitud_id) ||
        typeof body.codigo !== "string" ||
        body.codigo.length > 32
      )
        return invalid();
      return transaction(pool, async (c) => {
        let r = await inspect(c, body.solicitud_id);
        if (!r) return invalid();
        const matches =
          /^\d{8}$/.test(body.codigo) &&
          C.equal(
            C.hmac(cfg.secret, "code", r.id + ":" + body.codigo),
            r.codigo_hash,
          );
        if (!matches) {
          await c.query(
            "UPDATE recuperaciones_clave SET intentos=LEAST(5,intentos+1) WHERE id=$1 AND usado_en IS NULL AND verificado_en IS NULL",
            [r.id],
          );
          return invalid();
        }
        if (!r.id_usuario) return invalid();
        const u = await account(c, r.id_usuario);
        r = (
          await c.query(
            "SELECT *,clock_timestamp() AS ahora FROM recuperaciones_clave WHERE id=$1 FOR UPDATE",
            [r.id],
          )
        ).rows[0];
        if (
          !live(r) ||
          r.verificado_en ||
          !(await current(c, r)) ||
          !same(u, r, cfg)
        )
          return invalid();
        if (
          !(await verifyFactor(
            c,
            u.id_usuario,
            r.version_seguridad,
            body.factor,
          ))
        ) {
          await c.query(
            "UPDATE recuperaciones_clave SET intentos=LEAST(5,intentos+1) WHERE id=$1",
            [r.id],
          );
          return invalid();
        }
        const permission = crypto.randomBytes(32).toString("base64url");
        await c.query(
          `UPDATE recuperaciones_clave SET verificado_en=clock_timestamp(),permiso_hash=$2,permiso_vence_en=LEAST(vence_en,clock_timestamp()+INTERVAL '2 minutes') WHERE id=$1`,
          [r.id, C.hmac(cfg.secret, "grant", permission)],
        );
        return {
          estado: "ok",
          permiso: permission,
          mensaje:
            "Código validado. Establece tu contraseña; no se iniciará sesión automáticamente.",
        };
      });
    },
    async complete(body) {
      const cfg = configuration();
      if (!cfg)
        return {
          error: {
            status: 503,
            mensaje: "La recuperación no está disponible temporalmente.",
          },
        };
      if (
        !uuid(body.solicitud_id) ||
        typeof body.permiso !== "string" ||
        !/^[\w-]{43}$/.test(body.permiso)
      )
        return invalid();
      const password = body.password_nueva;
      if (
        typeof password !== "string" ||
        password.length < 8 ||
        password.length > 128 ||
        !/[A-Za-z]/.test(password) ||
        !/[0-9]/.test(password) ||
        password !== body.password_confirmacion
      )
        return {
          error: {
            status: 400,
            mensaje:
              "Usa entre 8 y 128 caracteres con letras y números, y confirma la misma contraseña.",
          },
        };
      const result = await transaction(pool, async (c) => {
        let r = await inspect(c, body.solicitud_id);
        if (
          !r?.id_usuario ||
          !C.equal(C.hmac(cfg.secret, "grant", body.permiso), r.permiso_hash)
        )
          return invalid();
        const u = await account(c, r.id_usuario);
        r = (
          await c.query(
            "SELECT *,clock_timestamp() AS ahora FROM recuperaciones_clave WHERE id=$1 FOR UPDATE",
            [r.id],
          )
        ).rows[0];
        if (
          !live(r) ||
          !r.verificado_en ||
          !r.permiso_vence_en ||
          new Date(r.permiso_vence_en) <= new Date(r.ahora) ||
          !C.equal(C.hmac(cfg.secret, "grant", body.permiso), r.permiso_hash) ||
          !(await current(c, r)) ||
          !same(u, r, cfg)
        )
          return invalid();
        if (verifyPassword(password, u.clave_hash))
          return {
            error: {
              status: 400,
              mensaje: "La contraseña nueva debe ser diferente de la anterior.",
            },
          };
        await c.query(
          "UPDATE recuperaciones_clave SET usado_en=clock_timestamp(),permiso_hash=NULL,permiso_vence_en=NULL WHERE id=$1",
          [r.id],
        );
        await c.query("UPDATE usuarios SET clave_hash=$2 WHERE id_usuario=$1", [
          u.id_usuario,
          hashPassword(password),
        ]);
        await enqueue(c, cfg, r.id, "aviso", u.correo);
        return { userId: u.id_usuario };
      });
      if (result.error) return result;
      await closeSockets(result.userId);
      return {
        estado: "ok",
        mensaje:
          "Contraseña actualizada. Inicia sesión nuevamente; tu segundo factor sigue protegido.",
      };
    },
  };
}
function registerPasswordRecovery(
  app,
  service,
  { requestLimit, verifyLimit, completeLimit },
) {
  app.get("/api/auth/password-recovery/capabilities", (req, res) =>
    res
      .set("Cache-Control", "no-store")
      .json({ estado: "ok", disponible: service.enabled() }),
  );
  for (const [path, method, limiter, status] of [
    ["request", "request", requestLimit, 202],
    ["verify", "verify", verifyLimit, 200],
    ["complete", "complete", completeLimit, 200],
  ])
    app.post(
      "/api/auth/password-recovery/" + path,
      limiter,
      async (req, res) => {
        res.set("Cache-Control", "no-store");
        try {
          const r = await service[method](req.body || {});
          if (r.error)
            return res
              .status(r.error.status)
              .json({ estado: "error", mensaje: r.error.mensaje });
          return res.status(status).json(r);
        } catch (_) {
          console.error("Fallo interno de recuperación de contraseña.");
          return res
            .status(503)
            .json({
              estado: "error",
              mensaje: "No se pudo completar la solicitud. Intenta más tarde.",
            });
        }
      },
    );
}
module.exports = {
  createPasswordRecovery,
  registerPasswordRecovery,
  transaction,
  lock,
  enqueue,
  account,
  eligible,
};
