"use strict";
const crypto = require("node:crypto");
const { transaction: tx } = require("./password-recovery");
const states = ["Registrada", "En revisión", "Resuelta"];
const uuid = (v) =>
  typeof v === "string" &&
  /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
function identifier(v) {
  if (!/^[1-9][0-9]{0,18}$/.test(String(v))) return false;
  return BigInt(v) <= 9223372036854775807n;
}
class TrackingError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const missing = () => new TrackingError(404, "Incidencia no encontrada.");
const fields =
  "id_incidencia,id_suministro,tipo,descripcion,referencia,latitud,longitud,fecha_registro,estado,(foto IS NOT NULL) AS tiene_foto";
function createIncidentTracking({ pool }) {
  async function change(user, id, body) {
    if (!identifier(id)) throw missing();
    const estado = String(body.estado || "").trim(),
      comment =
        body.comentario_publico === undefined ? null : body.comentario_publico;
    if (!states.includes(estado))
      throw new TrackingError(
        400,
        "Estado inválido. Debe ser Registrada, En revisión o Resuelta.",
      );
    if (
      comment !== null &&
      (typeof comment !== "string" ||
        comment.length > 300 ||
        /[\x00-\x1f\x7f]/.test(comment))
    )
      throw new TrackingError(
        400,
        "El comentario público debe ser un texto breve de hasta 300 caracteres, sin controles.",
      );
    const publicComment = comment?.trim() || null,
      request = body.solicitud_id;
    if (request !== undefined && !uuid(request))
      throw new TrackingError(400, "Solicitud de cambio inválida.");
    const hash = crypto
      .createHash("sha256")
      .update(JSON.stringify([String(id), estado, publicComment]))
      .digest("hex");
    return tx(pool, async (c) => {
      if (request)
        await c.query("SELECT pg_advisory_xact_lock(7413,hashtext($1))", [
          request,
        ]);
      const {
        rows: [actor],
      } = await c.query(
        "SELECT u.rol,u.activo,COALESCE(m.version,0) AS version FROM usuarios u LEFT JOIN usuario_2fa m USING(id_usuario) WHERE u.id_usuario=$1 FOR SHARE OF u",
        [user.id_usuario],
      );
      if (
        !actor ||
        !actor.activo ||
        actor.rol !== "admin" ||
        actor.version !== user.mfa_version
      )
        throw new TrackingError(
          401,
          "La sesión cambió. Inicia sesión nuevamente.",
        );
      if (request) {
        const old = (
          await c.query(
            "SELECT * FROM incidencia_cambios WHERE solicitud_id=$1",
            [request],
          )
        ).rows[0];
        if (old) {
          if (
            String(old.id_administrador) !== String(user.id_usuario) ||
            old.huella !== hash
          )
            throw new TrackingError(
              409,
              "La solicitud no corresponde a este cambio. Actualiza el historial.",
            );
          const actual = (
            await c.query(
              "SELECT " + fields + " FROM incidencias WHERE id_incidencia=$1",
              [id],
            )
          ).rows[0];
          if (!actual) throw missing();
          return { incidencia: actual, cambiada: false, repetida: true };
        }
      }
      const {
        rows: [current],
      } = await c.query(
        "SELECT " +
          fields +
          " FROM incidencias WHERE id_incidencia=$1 FOR UPDATE",
        [id],
      );
      if (!current) throw missing();
      let result = { incidencia: current, cambiada: false };
      if (current.estado !== estado) {
        await c.query(
          "SELECT set_config('hidro.incident_actor',$1,true),set_config('hidro.incident_request',$2,true),set_config('hidro.incident_comment',$3,true)",
          [String(user.id_usuario), request || "", publicComment || ""],
        );
        const {
          rows: [updated],
        } = await c.query(
          "UPDATE incidencias SET estado=$2 WHERE id_incidencia=$1 RETURNING " +
            fields,
          [id, estado],
        );
        const {
          rows: [notice],
        } = await c.query(
          "INSERT INTO notificaciones(id_suministro,alcance,titulo,mensaje,tipo) VALUES($1,'Usuario',$2,$3,'incidencia') RETURNING id_notificacion",
          [
            updated.id_suministro,
            "Incidencia #" + id + " cambió a " + estado,
            'Tu reporte "' + updated.tipo + '" ahora está: ' + estado + ".",
          ],
        );
        result = {
          incidencia: updated,
          cambiada: true,
          notificacion_id: notice.id_notificacion,
        };
      }
      if (request)
        await c.query(
          "INSERT INTO incidencia_cambios(solicitud_id,id_incidencia,id_administrador,huella,resultado) VALUES($1,$2,$3,$4,$5)",
          [
            request,
            id,
            user.id_usuario,
            hash,
            JSON.stringify({
              estado: result.incidencia.estado,
              cambiada: result.cambiada,
              notificacion_id: result.notificacion_id || null,
            }),
          ],
        );
      return result;
    });
  }
  async function history(user, id, query = {}) {
    if (!identifier(id)) throw missing();
    const after = query.despues || null,
      limit = query.limite === undefined ? 30 : Number(query.limite);
    if (
      (after && !uuid(after)) ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50
    )
      throw new TrackingError(
        400,
        "Paginación inválida. El límite permitido es de 1 a 50.",
      );
    const c = await pool.connect();
    try {
      await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await c.query("SET LOCAL statement_timeout='5s'");
      const {
        rows: [incident],
      } = await c.query(
        `SELECT i.id_incidencia,i.estado AS estado_actual,i.fecha_registro,to_char(i.fecha_registro,'YYYY-MM-DD HH24:MI:SS') AS fecha_registro_original,
    EXISTS(SELECT 1 FROM incidencia_eventos e WHERE e.id_incidencia=i.id_incidencia AND e.tipo='registro') AS historial_completo,
    (SELECT fecha FROM incidencia_eventos e WHERE e.id_incidencia=i.id_incidencia ORDER BY orden DESC LIMIT 1) AS ultima_actualizacion
    FROM incidencias i JOIN suministros s USING(id_suministro) JOIN usuarios u ON u.id_usuario=$2 LEFT JOIN usuario_2fa m ON m.id_usuario=u.id_usuario
    WHERE i.id_incidencia=$1 AND u.activo AND u.rol=$3 AND COALESCE(m.version,0)=$4 AND (u.rol='admin' OR (u.rol='usuario' AND s.id_usuario=u.id_usuario AND s.id_suministro=$5))`,
        [id, user.id_usuario, user.rol, user.mfa_version, user.id_suministro],
      );
      if (!incident) throw missing();
      let position = "0";
      if (after) {
        const cursor = (
          await c.query(
            "SELECT orden FROM incidencia_eventos WHERE id=$1 AND id_incidencia=$2",
            [after, id],
          )
        ).rows[0];
        if (!cursor) throw new TrackingError(400, "Paginación inválida.");
        position = cursor.orden;
      }
      const { rows } = await c.query(
        "SELECT id,fecha,tipo,estado_anterior,estado_nuevo,comentario_publico,id_administrador FROM incidencia_eventos WHERE id_incidencia=$1 AND orden>$2 ORDER BY orden ASC LIMIT $3",
        [id, position, limit + 1],
      );
      await c.query("COMMIT");
      const more = rows.length > limit,
        events = rows.slice(0, limit).map((row) => {
          const { id_administrador, ...rest } = row;
          return {
            ...rest,
            responsable:
              user.rol === "admin" && id_administrador
                ? {
                    id_usuario: id_administrador,
                    etiqueta: "Administrador #" + id_administrador,
                  }
                : null,
          };
        });
      return {
        estado: "ok",
        incidencia: incident,
        eventos: events,
        siguiente: more ? events.at(-1).id : null,
      };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  return { change, history };
}
function registerIncidentTracking(app, { service, auth, admin }) {
  const handle = (fn) => async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      res.json(await fn(req));
    } catch (e) {
      const status = e instanceof TrackingError ? e.status : 503;
      if (status === 503)
        console.error("No se pudo consultar el seguimiento de incidencia.");
      res.status(status).json({
        estado: "error",
        mensaje:
          status === 503
            ? "Seguimiento no disponible temporalmente. Intenta nuevamente."
            : e.message,
      });
    }
  };
  app.get(
    "/api/me/incidencias/:id/seguimiento",
    auth,
    handle((req) => {
      if (req.user.rol !== "usuario") throw missing();
      return service.history(req.user, req.params.id, req.query);
    }),
  );
  app.get(
    "/api/admin/incidencias/:id/seguimiento",
    admin,
    handle((req) => service.history(req.user, req.params.id, req.query)),
  );
}
module.exports = {
  createIncidentTracking,
  registerIncidentTracking,
  TrackingError,
};
