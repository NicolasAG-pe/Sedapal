"use strict";
const crypto = require("node:crypto");
const C = require("./password-recovery-crypto");
const { transaction, lock, account, eligible } = require("./password-recovery");
function createRecoveryWorker({ pool, enviarCodigo, env = process.env }) {
  const cfg = C.config(env);
  if (!cfg || typeof enviarCodigo !== "function")
    throw Error("Trabajador de recuperación no configurado.");
  async function terminal(c, id, state) {
    await c.query(
      `UPDATE recuperacion_clave_outbox SET estado=$2,payload=NULL,lease_token=NULL,bloqueado_hasta=NULL,finalizado_en=clock_timestamp() WHERE id=$1`,
      [id, state],
    );
    return { estado: state };
  }
  async function claim() {
    const { rows: candidates } = await pool.query(
      `SELECT o.id,r.identidad_hash FROM recuperacion_clave_outbox o JOIN recuperaciones_clave r ON r.id=o.solicitud_id WHERE (o.estado IN ('pendiente','reintento') AND o.disponible_en<=clock_timestamp()) OR (o.estado='procesando' AND o.bloqueado_hasta<=clock_timestamp()) ORDER BY o.disponible_en,o.id LIMIT 20`,
    );
    for (const candidate of candidates) {
      const result = await transaction(pool, async (c) => {
        await lock(c, candidate.identidad_hash);
        let job = (
          await c.query("SELECT * FROM recuperacion_clave_outbox WHERE id=$1", [
            candidate.id,
          ])
        ).rows[0];
        if (!job || !job.payload) return null;
        if (job.clave_id !== C.keyId(cfg.key) || job.proveedor !== cfg.provider)
          return { estado: "configuracion_incompatible" };
        let raw, msg;
        try {
          raw = C.open(job.payload, cfg.key, job.id, job.solicitud_id);
          msg = JSON.parse(raw);
          if (
            msg.from !== cfg.from ||
            !Array.isArray(msg.to) ||
            msg.to.length !== 1 ||
            typeof msg.to[0] !== "string"
          )
            throw Error();
        } catch (_) {
          return terminal(c, job.id, "fallido");
        }
        const email = msg.to[0],
          ids = (
            await c.query(
              "SELECT id_usuario FROM usuarios WHERE lower(trim(correo))=$1 LIMIT 2",
              [email],
            )
          ).rows;
        const u = ids.length === 1 ? await account(c, ids[0].id_usuario) : null;
        let r = (
          await c.query(
            "SELECT *,clock_timestamp() AS ahora FROM recuperaciones_clave WHERE id=$1 FOR UPDATE",
            [job.solicitud_id],
          )
        ).rows[0];
        job = (
          await c.query(
            `SELECT * FROM recuperacion_clave_outbox WHERE id=$1 AND ((estado IN ('pendiente','reintento') AND disponible_en<=clock_timestamp()) OR (estado='procesando' AND bloqueado_hasta<=clock_timestamp())) FOR UPDATE`,
            [job.id],
          )
        ).rows[0];
        if (!job) return null;
        if (job.estado === "procesando" && cfg.provider === "gmail")
          return terminal(c, job.id, "ambiguo");
        if (job.intentos >= 3) return terminal(c, job.id, "fallido");
        if (
          !eligible(u) ||
          (cfg.allowed && cfg.allowed !== email) ||
          C.hmac(cfg.secret, "identity", email) !== r.identidad_hash
        )
          return terminal(c, job.id, "cancelado");
        if (job.proposito === "codigo") {
          const active = (
            await c.query(
              "SELECT activa_id FROM recuperacion_clave_limites WHERE identidad_hash=$1",
              [r.identidad_hash],
            )
          ).rows[0]?.activa_id;
          if (
            active !== r.id ||
            r.invalidado_en ||
            r.usado_en ||
            r.verificado_en ||
            r.intentos >= 5
          )
            return terminal(c, job.id, "cancelado");
          if (new Date(r.vence_en) <= new Date(r.ahora))
            return terminal(c, job.id, "caducado");
          if (!r.vinculado_en) {
            if (
              new Date(u.correo_verificado_en) > new Date(r.creado_en) ||
              (u.cambio_seguridad_en &&
                new Date(u.cambio_seguridad_en) > new Date(r.creado_en))
            )
              return terminal(c, job.id, "cancelado");
            r = (
              await c.query(
                `UPDATE recuperaciones_clave SET id_usuario=$2,version_seguridad=$3,clave_huella=$4,vinculado_en=clock_timestamp(),vence_en=LEAST(vence_en,clock_timestamp()+INTERVAL '5 minutes') WHERE id=$1 RETURNING *`,
                [r.id, u.id_usuario, u.mfa_version, C.sha(u.clave_hash)],
              )
            ).rows[0];
          } else if (
            String(r.id_usuario) !== String(u.id_usuario) ||
            r.version_seguridad !== u.mfa_version ||
            r.clave_huella !== C.sha(u.clave_hash)
          )
            return terminal(c, job.id, "cancelado");
        } else if (
          !r.usado_en ||
          new Date(r.usado_en).getTime() + 3600000 <=
            new Date(r.ahora).getTime()
        )
          return terminal(c, job.id, "caducado");
        const lease = crypto.randomUUID();
        await c.query(
          `UPDATE recuperacion_clave_outbox SET estado='procesando',intentos=intentos+1,lease_token=$2,bloqueado_hasta=clock_timestamp()+INTERVAL '60 seconds' WHERE id=$1`,
          [job.id, lease],
        );
        return { ...job, lease, mensaje: raw };
      });
      if (result) return result;
    }
    return null;
  }
  async function finish(job, outcome) {
    return transaction(pool, async (c) => {
      const current = (
        await c.query(
          "SELECT *,clock_timestamp() AS ahora FROM recuperacion_clave_outbox WHERE id=$1 AND lease_token=$2 AND estado='procesando' FOR UPDATE",
          [job.id, job.lease],
        )
      ).rows[0];
      if (!current) return { estado: "sin_lease" };
      if (
        outcome?.id &&
        typeof outcome.id === "string" &&
        outcome.id.length <= 120
      ) {
        await c.query(
          "UPDATE recuperacion_clave_outbox SET estado='aceptado',proveedor_id=$2,payload=NULL,lease_token=NULL,bloqueado_hasta=NULL,finalizado_en=clock_timestamp() WHERE id=$1",
          [job.id, outcome.id],
        );
        return { estado: "aceptado" };
      }
      const kind = outcome?.tipo || "ambiguo";
      if (kind === "ambiguo" && cfg.provider === "gmail")
        return terminal(c, job.id, "ambiguo");
      if (kind === "caducado") return terminal(c, job.id, "caducado");
      if (!["transitorio", "ambiguo"].includes(kind) || current.intentos >= 3)
        return terminal(c, job.id, "fallido");
      const delay = Math.min(
        300,
        Math.max(5 * current.intentos, Number(outcome.retryAfter) || 0),
      );
      await c.query(
        "UPDATE recuperacion_clave_outbox SET estado='reintento',disponible_en=clock_timestamp()+make_interval(secs=>$2),lease_token=NULL,bloqueado_hasta=NULL WHERE id=$1",
        [job.id, delay],
      );
      return { estado: "reintento" };
    });
  }
  return {
    claim,
    async procesarUno() {
      const job = await claim();
      if (!job || !job.lease) return job || { estado: "vacio" };
      // Revalidación después del lease: no enviar códigos sustituidos, revocados o expirados.
      const start = performance.now(),
        {
          rows: [live],
        } = await pool.query(
          `SELECT EXTRACT(EPOCH FROM ((CASE WHEN o.proposito='codigo' THEN r.vence_en ELSE r.usado_en+INTERVAL '1 hour' END)-clock_timestamp()))*1000 AS restante
   FROM recuperacion_clave_outbox o JOIN recuperaciones_clave r ON r.id=o.solicitud_id JOIN usuarios u ON u.id_usuario=r.id_usuario
   LEFT JOIN usuario_2fa m ON m.id_usuario=u.id_usuario JOIN recuperacion_clave_limites l USING(identidad_hash)
   WHERE o.id=$1 AND o.lease_token=$2 AND o.estado='procesando' AND o.bloqueado_hasta>clock_timestamp()
   AND u.activo AND u.correo_verificado_en IS NOT NULL AND (u.rol='usuario' OR (u.rol='admin' AND m.activo))
   AND lower(trim(u.correo))=$3 AND (o.proposito='aviso' OR (l.activa_id=r.id AND r.usado_en IS NULL AND r.invalidado_en IS NULL AND r.verificado_en IS NULL AND r.intentos<5 AND COALESCE(m.version,0)=r.version_seguridad))`,
          [job.id, job.lease, JSON.parse(job.mensaje).to[0]],
        );
      if (!live || Number(live.restante) <= 0)
        return finish(job, { tipo: "caducado" });
      const remaining = Number(live.restante);
      let outcome;
      try {
        outcome = await enviarCodigo({
          mensaje: job.mensaje,
          envioId: job.id,
          enviarHasta: new Date(Date.now() + remaining),
          limiteMonotono: start + remaining,
        });
      } catch (e) {
        outcome = { tipo: e.tipo, retryAfter: e.retryAfter };
      } finally {
        job.mensaje = undefined;
      }
      return finish(job, outcome);
    },
  };
}
module.exports = { createRecoveryWorker };
