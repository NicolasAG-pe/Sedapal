"use strict";
const crypto = require("node:crypto");
const { transaction: tx } = require("./password-recovery");
const categories = ["recibos", "vencimientos", "incidencias", "cortes"];
const uuid = (v) =>
  typeof v === "string" &&
  /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const digest = (v) => crypto.createHash("sha256").update(v).digest("hex");
const proof = (v) => digest("hm-push-proof-v1:" + v);
function configuration(env = process.env) {
  if (env.PUSH_ENABLED !== "1") return null;
  const raw = env.PUSH_TOKEN_KEY,
    key = Buffer.from(raw || "", "base64");
  if (key.length !== 32 || key.toString("base64") !== raw)
    throw Error("Clave push privada inválida.");
  for (const s of [
    env.AUTH_TOKEN_SECRET,
    env.TOTP_ENCRYPTION_KEY,
    env.EMAIL_OUTBOX_KEY,
    env.EMAIL_OTP_SECRET,
    env.PASSWORD_RECOVERY_SECRET,
    env.PASSWORD_RECOVERY_OUTBOX_KEY,
  ].filter(Boolean)) {
    const variants = [
      Buffer.from(s),
      ...(/^[a-f0-9]{64}$/i.test(s) ? [Buffer.from(s, "hex")] : []),
      ...(/^[A-Za-z0-9+/]{43}=$/.test(s) ? [Buffer.from(s, "base64")] : []),
    ];
    if (variants.some((v) => v.equals(key)))
      throw Error("La clave push debe ser exclusiva.");
  }
  if (!["mock", "fcm"].includes(env.PUSH_PROVIDER || "mock"))
    throw Error("Proveedor push inválido.");
  return {
    key,
    keyId: digest(key).slice(0, 16),
    provider: env.PUSH_PROVIDER || "mock",
  };
}
function seal(token, key, id, revision) {
  const iv = crypto.randomBytes(12),
    c = crypto.createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from("hm-push-v1:" + id + ":" + revision));
  return Buffer.concat([
    iv,
    c.update(token, "utf8"),
    c.final(),
    c.getAuthTag(),
  ]);
}
function open(value, key, id, revision) {
  const d = crypto.createDecipheriv("aes-256-gcm", key, value.subarray(0, 12));
  d.setAAD(Buffer.from("hm-push-v1:" + id + ":" + revision));
  d.setAuthTag(value.subarray(-16));
  return Buffer.concat([d.update(value.subarray(12, -16)), d.final()]).toString(
    "utf8",
  );
}
const categorySQL =
  "CASE n.tipo WHEN 'recibo' THEN 'recibos' WHEN 'vencimiento' THEN 'vencimientos' WHEN 'incidencia' THEN 'incidencias' WHEN 'corte' THEN 'cortes' END";
// Compartida por claim y revalidación inmediatamente anterior al envío.
const eligibleSQL = `d.activo AND u.activo AND u.rol='usuario' AND s.id_usuario=u.id_usuario
 AND d.version_seguridad=COALESCE(m.version,0) AND d.autorizado_hasta>clock_timestamp()
 AND q.revision=d.revision AND q.vence_en>clock_timestamp()
 AND (n.alcance='General' OR n.id_suministro=d.id_suministro)
 AND CASE q.categoria WHEN 'recibos' THEN d.recibos WHEN 'vencimientos' THEN d.vencimientos WHEN 'incidencias' THEN d.incidencias WHEN 'cortes' THEN d.cortes ELSE FALSE END
 AND (q.categoria<>'vencimientos' OR EXISTS(SELECT 1 FROM recibos r WHERE r.id_recibo=n.push_recibo AND r.id_suministro=d.id_suministro AND r.estado IN('Emitido','Pendiente') AND r.fecha_vencimiento BETWEEN CURRENT_DATE AND CURRENT_DATE+3 AND NOT EXISTS(SELECT 1 FROM pagos p WHERE p.id_recibo=r.id_recibo)))
 AND (n.push_corte IS NULL OR EXISTS(SELECT 1 FROM cortes_servicio c WHERE c.id_corte=n.push_corte AND NOT c.cancelado AND (c.alcance='General' OR (c.alcance='Zona' AND c.distrito=s.distrito AND c.zona=s.zona) OR (c.alcance IS NULL AND EXISTS(SELECT 1 FROM cortes_suministros cs WHERE cs.id_corte=c.id_corte AND cs.id_suministro=s.id_suministro)))))`;
const joins = `FROM push_entregas q JOIN push_dispositivos d ON d.id=q.id_dispositivo JOIN notificaciones n ON n.id_notificacion=q.id_notificacion
 JOIN usuarios u ON u.id_usuario=d.id_usuario JOIN suministros s ON s.id_suministro=d.id_suministro LEFT JOIN usuario_2fa m ON m.id_usuario=u.id_usuario`;
function createPush({ pool, env = process.env }) {
  const enabled = () => {
    try {
      return !!configuration(env);
    } catch (_) {
      return false;
    }
  };
  async function bind(user, body, expiry) {
    const cfg = configuration(env);
    if (!cfg) throw Error("disabled");
    if (
      !uuid(body.installation_id) ||
      !/^[\w-]{43}$/.test(body.proof || "") ||
      typeof body.token !== "string" ||
      body.token.length < 20 ||
      body.token.length > 4096 ||
      /[^A-Za-z0-9_:\-]/.test(body.token) ||
      body.consent !== true ||
      !Number.isFinite(expiry) ||
      expiry <= Date.now()
    )
      return { status: 400 };
    if (
      !body.categories ||
      categories.some((c) => typeof body.categories[c] !== "boolean") ||
      Object.keys(body.categories).some((c) => !categories.includes(c))
    )
      return { status: 400 };
    return tx(pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(7412,hashtext($1))", [
        body.installation_id,
      ]);
      const {
        rows: [actor],
      } = await c.query(
        `SELECT u.id_usuario,u.rol,u.activo,s.id_suministro,COALESCE(m.version,0) AS version FROM usuarios u JOIN suministros s USING(id_usuario) LEFT JOIN usuario_2fa m USING(id_usuario) WHERE u.id_usuario=$1 FOR UPDATE OF u,s`,
        [user.id_usuario],
      );
      if (
        !actor ||
        !actor.activo ||
        actor.rol !== "usuario" ||
        actor.version !== user.mfa_version ||
        String(actor.id_suministro) !== String(user.id_suministro)
      )
        return { status: 403 };
      const {
        rows: [old],
      } = await c.query(
        "SELECT * FROM push_dispositivos WHERE id=$1 FOR UPDATE",
        [body.installation_id],
      );
      if (old && old.prueba_hash !== proof(body.proof)) return { status: 403 };
      const hash = crypto
        .createHmac("sha256", cfg.key)
        .update("hm-push-token-v1:" + body.token)
        .digest("hex");
      if (
        (
          await c.query(
            "SELECT 1 FROM push_dispositivos WHERE token_hash=$1 AND id<>$2",
            [hash, body.installation_id],
          )
        ).rowCount
      )
        return { status: 409 };
      if (
        (
          await c.query(
            "SELECT 1 FROM push_dispositivos WHERE id_usuario=$1 AND activo AND id<>$2",
            [actor.id_usuario, body.installation_id],
          )
        ).rowCount >= 10
      )
        return { status: 429 };
      const changed =
        old &&
        (String(old.id_usuario) !== String(actor.id_usuario) ||
          old.version_seguridad !== actor.version ||
          old.token_hash !== hash ||
          categories.some((k) => old[k] !== body.categories[k]) ||
          !old.activo);
      const revision = old ? old.revision + (changed ? 1 : 0) : 1;
      const values = [
        body.installation_id,
        proof(body.proof),
        actor.id_usuario,
        actor.id_suministro,
        actor.version,
        revision,
        hash,
        seal(body.token, cfg.key, body.installation_id, revision),
        cfg.keyId,
        new Date(Math.min(expiry, Date.now() + 8 * 3600000)),
        ...categories.map((k) => body.categories[k]),
      ];
      await c.query(
        `INSERT INTO push_dispositivos(id,prueba_hash,id_usuario,id_suministro,version_seguridad,revision,token_hash,token_cifrado,clave_id,autorizado_hasta,recibos,vencimientos,incidencias,cortes,activo,consentimiento_en)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,TRUE,clock_timestamp()) ON CONFLICT(id) DO UPDATE SET id_usuario=$3,id_suministro=$4,version_seguridad=$5,revision=$6,token_hash=$7,token_cifrado=$8,clave_id=$9,autorizado_hasta=$10,recibos=$11,vencimientos=$12,incidencias=$13,cortes=$14,activo=TRUE,consentimiento_en=COALESCE(push_dispositivos.consentimiento_en,clock_timestamp()),actualizado_en=clock_timestamp()`,
        values,
      );
      if (changed)
        await c.query(
          "UPDATE push_entregas SET estado='cancelado',lease=NULL,bloqueado_hasta=NULL,finalizado_en=clock_timestamp() WHERE id_dispositivo=$1 AND estado IN('pendiente','reintento','procesando')",
          [body.installation_id],
        );
      return {
        status: 200,
        body: { estado: "ok", revision, autorizado_hasta: values[9] },
      };
    });
  }
  async function revoke(body) {
    if (!uuid(body.installation_id) || !/^[\w-]{43}$/.test(body.proof || ""))
      return;
    await tx(pool, async (c) => {
      const {
        rows: [d],
      } = await c.query(
        "UPDATE push_dispositivos SET activo=FALSE,token_cifrado=NULL,token_hash=NULL,revision=revision+1,actualizado_en=clock_timestamp() WHERE id=$1 AND prueba_hash=$2 RETURNING id",
        [body.installation_id, proof(body.proof)],
      );
      if (d)
        await c.query(
          "UPDATE push_entregas SET estado='cancelado',lease=NULL,bloqueado_hasta=NULL,finalizado_en=clock_timestamp() WHERE id_dispositivo=$1 AND estado IN('pendiente','reintento','procesando')",
          [d.id],
        );
    });
  }
  return {
    enabled,
    bind,
    revoke,
    async resolve(user, event) {
      if (!uuid(event)) return null;
      const {
        rows: [r],
      } = await pool.query(
        `SELECT ${categorySQL} AS categoria FROM notificaciones n WHERE push_evento=$1 AND (alcance='General' OR id_suministro=$2)`,
        [event, user.id_suministro],
      );
      const section = {
        recibos: "historial",
        vencimientos: "historial",
        incidencias: "incidencias",
        cortes: "cortes",
      }[r?.categoria];
      return section ? { estado: "ok", seccion: section } : null;
    },
  };
}
function registerPush(app, { service, auth, limit, expiry }) {
  app.get("/api/push/capabilities", (req, res) =>
    res
      .set("Cache-Control", "no-store")
      .json({ disponible: service.enabled() }),
  );
  const handler = (fn) => async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      await fn(req, res);
    } catch (_) {
      console.error("No se pudo completar la operación push.");
      res
        .status(503)
        .json({
          estado: "error",
          mensaje: "Notificaciones push no disponibles temporalmente.",
        });
    }
  };
  app.post(
    "/api/push/devices",
    limit,
    auth,
    handler(async (req, res) => {
      if (req.user.rol !== "usuario") return res.sendStatus(403);
      if (!service.enabled()) return res.sendStatus(503);
      const r = await service.bind(req.user, req.body || {}, expiry(req));
      res
        .status(r.status)
        .json(
          r.body || {
            estado: "error",
            mensaje: "No se pudo autorizar este dispositivo.",
          },
        );
    }),
  );
  // Capacidad solo de revocación, sin JWT: permite retirar una asociación tras logout/offline.
  app.post(
    "/api/push/revoke",
    limit,
    handler(async (req, res) => {
      await service.revoke(req.body || {});
      res.sendStatus(204);
    }),
  );
  app.get(
    "/api/push/events/:id",
    limit,
    auth,
    handler(async (req, res) => {
      if (req.user.rol !== "usuario") return res.sendStatus(403);
      if (!service.enabled()) return res.sendStatus(503);
      const r = await service.resolve(req.user, req.params.id);
      res
        .status(r ? 200 : 404)
        .json(
          r || {
            estado: "error",
            mensaje: "Aviso no disponible para esta sesión.",
          },
        );
    }),
  );
}
module.exports = {
  configuration,
  seal,
  open,
  digest,
  createPush,
  registerPush,
  eligibleSQL,
  joins,
};
