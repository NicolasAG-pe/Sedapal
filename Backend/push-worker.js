"use strict";
const crypto = require("node:crypto");
const { transaction: tx } = require("./password-recovery");
const { configuration, open, eligibleSQL, joins } = require("./push");
const bodies = {
  recibos: "Ya está disponible tu nuevo recibo.",
  vencimientos: "Tu recibo tiene una fecha de vencimiento próxima.",
  incidencias: "Tu incidencia tiene una actualización.",
  cortes: "Nuevo aviso de corte de servicio.",
};
function payload(event, category) {
  if (!/^[a-f0-9-]{36}$/i.test(event) || !bodies[category])
    throw Error("Evento push inválido.");
  return {
    notification: { title: "Hidro-Mejora", body: bodies[category] },
    data: { hm_event: event },
    android: {
      priority: "high",
      ttl: "3600s",
      restricted_package_name: "pe.edu.hidromejora.app",
      notification: {
        channel_id: "hm_updates",
        icon: "hm_notification",
        tag: event,
        visibility: "PRIVATE",
      },
    },
  };
}
function createPushWorker({ pool, send, env = process.env }) {
  const cfg = configuration(env);
  if (!cfg || typeof send !== "function")
    throw Error("Worker push no configurado.");
  async function finish(c, id, state) {
    await c.query(
      "UPDATE push_entregas SET estado=$2,lease=NULL,bloqueado_hasta=NULL,finalizado_en=clock_timestamp() WHERE id=$1",
      [id, state],
    );
    return { estado: state };
  }
  async function claim() {
    const { rows: items } = await pool.query(
      "SELECT id,id_dispositivo FROM push_entregas WHERE (estado IN('pendiente','reintento') AND disponible_en<=clock_timestamp()) OR (estado='procesando' AND bloqueado_hasta<=clock_timestamp()) ORDER BY disponible_en,id LIMIT 20",
    );
    for (const item of items) {
      const result = await tx(pool, async (c) => {
        await c.query(
          "SELECT id FROM push_dispositivos WHERE id=$1 FOR UPDATE",
          [item.id_dispositivo],
        );
        const {
          rows: [job],
        } = await c.query(
          "SELECT * FROM push_entregas WHERE id=$1 AND ((estado IN('pendiente','reintento') AND disponible_en<=clock_timestamp()) OR (estado='procesando' AND bloqueado_hasta<=clock_timestamp())) FOR UPDATE",
          [item.id],
        );
        if (!job) return null;
        if (job.estado === "procesando") return finish(c, job.id, "ambiguo");
        if (job.intentos >= 3) return finish(c, job.id, "fallido");
        const {
          rows: [live],
        } = await c.query(
          `SELECT d.token_cifrado,d.clave_id,d.revision,n.push_evento ${joins} WHERE q.id=$1 AND ${eligibleSQL}`,
          [job.id],
        );
        if (!live) return finish(c, job.id, "cancelado");
        if (live.clave_id !== cfg.keyId)
          return { estado: "configuracion_incompatible" };
        let token;
        try {
          token = open(
            live.token_cifrado,
            cfg.key,
            item.id_dispositivo,
            live.revision,
          );
        } catch (_) {
          return finish(c, job.id, "fallido");
        }
        const lease = crypto.randomUUID();
        await c.query(
          "UPDATE push_entregas SET estado='procesando',intentos=intentos+1,lease=$2,bloqueado_hasta=clock_timestamp()+INTERVAL '60 seconds' WHERE id=$1",
          [job.id, lease],
        );
        return { ...job, token, lease, event: live.push_evento };
      });
      if (result) return result;
    }
    return { estado: "vacio" };
  }
  return {
    claim,
    async processOne() {
      const job = await claim();
      if (!job.lease) return job;
      // La cola no es autorización: revalidar justo antes de entregar al proveedor.
      const { rowCount } = await pool.query(
        `SELECT 1 ${joins} WHERE q.id=$1 AND q.lease=$2 AND q.estado='procesando' AND ${eligibleSQL}`,
        [job.id, job.lease],
      );
      let outcome;
      if (!rowCount) outcome = { kind: "cancelado" };
      else
        try {
          outcome = await send({
            token: job.token,
            message: payload(job.event, job.categoria),
          });
        } catch (_) {
          outcome = { kind: "ambiguo" };
        } finally {
          job.token = undefined;
        }
      return tx(pool, async (c) => {
        await c.query(
          "SELECT id FROM push_dispositivos WHERE id=$1 FOR UPDATE",
          [job.id_dispositivo],
        );
        const {
          rows: [current],
        } = await c.query(
          "SELECT * FROM push_entregas WHERE id=$1 AND lease=$2 AND estado='procesando' FOR UPDATE",
          [job.id, job.lease],
        );
        if (!current) return { estado: "sin_lease" };
        if (outcome.kind === "token_invalido") {
          await c.query(
            "UPDATE push_dispositivos SET activo=FALSE,token_hash=NULL,token_cifrado=NULL,revision=revision+1 WHERE id=$1 AND revision=$2",
            [job.id_dispositivo, job.revision],
          );
          return finish(c, job.id, "fallido");
        }
        if (outcome.kind === "transitorio" && current.intentos < 3) {
          const wait = Math.min(
            3600,
            Math.max(
              60 * 2 ** (current.intentos - 1),
              Number(outcome.retryAfter) || 0,
            ),
          );
          await c.query(
            "UPDATE push_entregas SET estado='reintento',disponible_en=clock_timestamp()+make_interval(secs=>$3),lease=NULL,bloqueado_hasta=NULL WHERE id=$1 AND lease=$2",
            [job.id, job.lease, wait + crypto.randomInt(0, 15)],
          );
          return { estado: "reintento" };
        }
        return finish(
          c,
          job.id,
          ["aceptado", "simulado", "cancelado", "ambiguo"].includes(
            outcome.kind,
          )
            ? outcome.kind
            : "fallido",
        );
      });
    },
  };
}
async function reminders(pool, env = process.env) {
  if (env.PUSH_REMINDERS_ENABLED !== "1" || !configuration(env))
    throw Error("Recordatorios desactivados.");
  return tx(pool, async (c) => {
    await c.query("SET LOCAL TIME ZONE 'America/Lima'");
    return (
      await c.query(`INSERT INTO notificaciones(id_suministro,alcance,titulo,mensaje,tipo,push_clave,push_recibo)
 SELECT r.id_suministro,'Usuario','Vencimiento próximo','Consulta la fecha registrada de tu recibo.','vencimiento','vence:'||r.id_recibo||':'||r.fecha_vencimiento,r.id_recibo FROM recibos r
 WHERE r.estado IN('Emitido','Pendiente') AND r.fecha_vencimiento BETWEEN CURRENT_DATE AND CURRENT_DATE+3 AND NOT EXISTS(SELECT 1 FROM pagos p WHERE p.id_recibo=r.id_recibo)
 ON CONFLICT DO NOTHING RETURNING id_notificacion`)
    ).rowCount;
  });
}
async function retire(pool) {
  return tx(pool, async (c) => {
    await c.query(
      "UPDATE push_dispositivos SET activo=FALSE,token_cifrado=NULL,token_hash=NULL WHERE autorizado_hasta<=clock_timestamp() AND token_cifrado IS NOT NULL",
    );
    await c.query(
      "UPDATE push_entregas SET estado='caducado',lease=NULL,bloqueado_hasta=NULL,finalizado_en=clock_timestamp() WHERE vence_en<=clock_timestamp() AND estado IN('pendiente','reintento')",
    );
    // Retirar vínculos personales SOLO de metadatos push, conservando centro/historial.
    await c.query(
      "UPDATE push_entregas SET id_dispositivo=NULL,id_notificacion=NULL WHERE finalizado_en<clock_timestamp()-INTERVAL '30 days' AND id_dispositivo IS NOT NULL",
    );
    await c.query(
      "UPDATE push_dispositivos SET id_usuario=NULL,id_suministro=NULL WHERE NOT activo AND actualizado_en<clock_timestamp()-INTERVAL '30 days' AND id_usuario IS NOT NULL",
    );
  });
}
module.exports = { payload, createPushWorker, reminders, retire };
