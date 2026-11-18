'use strict';
const jwt = require('jsonwebtoken');
const { createPush, registerPush } = require('../../push');

function registerRoutes(app, { pool, requiereAuth, limitadorGenerico, sharedStorage = false }) {
    registerPush(app,{service:createPush({ pool, sharedStorage }),auth:requiereAuth,limit:limitadorGenerico(60,15),
        // El middleware ya verificó este JWT; aquí solo se limita la vigencia push.
        expiry:req=>Number(jwt.decode(req.headers.authorization.split(' ')[1])?.exp)*1000});

    app.get("/api/notificaciones", requiereAuth, async (req, res) => {
        try {
            const idSuministro = Number(req.user.id_suministro);
            // Fuente de verdad: notificaciones_lecturas por suministro.
            // notificaciones.leida es LEGACY y ya no se usa.
            const resultado = await pool.query(
                `SELECT n.id_notificacion, n.alcance, n.titulo, n.mensaje, n.tipo,
                        (l.id_notificacion IS NOT NULL) AS leida,
                        n.fecha_registro
                  FROM notificaciones n
                  LEFT JOIN notificaciones_lecturas l
                    ON l.id_notificacion = n.id_notificacion
                   AND l.id_suministro = $1
                  WHERE n.alcance = 'General'
                     OR (n.alcance = 'Usuario' AND n.id_suministro = $1)
                  ORDER BY n.fecha_registro DESC
                  LIMIT 100;`,
                [idSuministro]
            );
            const notifs = resultado.rows.map(r => ({
                id_notificacion: r.id_notificacion,
                alcance: r.alcance,
                titulo: r.titulo,
                mensaje: r.mensaje,
                tipo: r.tipo,
                leida: !!r.leida,
                fecha_registro: r.fecha_registro
            }));
            const noLeidas = notifs.filter(n => !n.leida).length;
            return res.json({ cantidad: notifs.length, no_leidas: noLeidas, notificaciones: notifs });
        } catch (error) {
            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });
            return res.status(500).json({ estado: "error", mensaje: "Error interno del servidor." });
        }
    });

    app.patch("/api/notificaciones/:id/leida", requiereAuth, async (req, res) => {
        try {
            const idNotif = Number(req.params.id);
            if (!Number.isInteger(idNotif) || idNotif <= 0) {
                return res.status(404).json({ estado: "error", mensaje: "Notificación no encontrada." });
            }
            const idSuministro = Number(req.user.id_suministro);
            // 1) Existe y 2) es visible para este suministro (General o propia).
            const visible = await pool.query(
                `SELECT id_notificacion
                  FROM notificaciones
                  WHERE id_notificacion = $1
                    AND (alcance = 'General' OR (alcance = 'Usuario' AND id_suministro = $2))
                  LIMIT 1;`,
                [idNotif, idSuministro]
            );
            if (visible.rowCount === 0) {
                return res.status(404).json({ estado: "error", mensaje: "Notificación no encontrada." });
            }
            // 3) Lectura por suministro (idempotente, sin tocar la fila global).
            await pool.query(
                `INSERT INTO notificaciones_lecturas (id_notificacion, id_suministro)
                  VALUES ($1, $2)
                  ON CONFLICT DO NOTHING;`,
                [idNotif, idSuministro]
            );
            return res.json({ estado: "ok", notificacion: { id_notificacion: idNotif, leida: true } });
        } catch (error) {
            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });
            return res.status(500).json({ estado: "error", mensaje: "Error interno del servidor." });
        }
    });
}

module.exports = { registerRoutes };
