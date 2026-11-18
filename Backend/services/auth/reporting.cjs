'use strict';


function registerRoutes(app, { pool, requiereAdmin, sharedStorage = false }) {
    app.get("/api/admin/usuarios", requiereAdmin, async (req, res) => {
        try {
            const resultado = await pool.query(
                `SELECT
                    u.id_usuario,
                    u.correo,
                    u.rol,
                    u.fecha_registro,
                    u.activo,
                    s.id_suministro,
                    s.numero_suministro,
                    s.distrito,
                    s.zona,
                    (SELECT COUNT(*) FROM recibos r WHERE r.id_suministro = s.id_suministro) AS cantidad_recibos,
                    (SELECT COUNT(*) FROM pagos p JOIN recibos r ON r.id_recibo = p.id_recibo WHERE r.id_suministro = s.id_suministro) AS cantidad_pagos,
                    (SELECT COUNT(*) FROM incidencias i WHERE i.id_suministro = s.id_suministro) AS cantidad_incidencias
                  FROM usuarios u
                  JOIN suministros s ON s.id_usuario = u.id_usuario
                  ORDER BY u.fecha_registro DESC, u.id_usuario DESC;`
            );
            const usuarios = resultado.rows.map(f => ({
                id_usuario: f.id_usuario,
                correo: f.correo,
                rol: f.rol,
                fecha_registro: f.fecha_registro,
                activo: !!f.activo,
                id_suministro: f.id_suministro,
                numero_suministro: f.numero_suministro,
                distrito: f.distrito,
                zona: f.zona,
                cantidad_recibos: Number(f.cantidad_recibos || 0),
                cantidad_pagos: Number(f.cantidad_pagos || 0),
                cantidad_incidencias: Number(f.cantidad_incidencias || 0)
            }));
            return res.json({ cantidad: usuarios.length, usuarios });
        } catch (error) {
            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });
            return res.status(500).json({ estado: "error", mensaje: "Error interno del servidor." });
        }
    });

    app.get("/api/admin/usuarios/:id", requiereAdmin, async (req, res) => {
        try {
            const idUsuario = Number(req.params.id);
            if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
                return res.status(404).json({ estado: "error", mensaje: "Usuario no encontrado." });
            }
            const base = await pool.query(
                `SELECT
                    u.id_usuario, u.correo, u.rol, u.fecha_registro, u.activo,
                    s.id_suministro, s.numero_suministro, s.distrito, s.zona,
                    (SELECT COUNT(*) FROM recibos r WHERE r.id_suministro = s.id_suministro) AS cantidad_recibos,
                    (SELECT COUNT(*) FROM pagos p JOIN recibos r ON r.id_recibo = p.id_recibo WHERE r.id_suministro = s.id_suministro) AS cantidad_pagos,
                    (SELECT COUNT(*) FROM incidencias i WHERE i.id_suministro = s.id_suministro) AS cantidad_incidencias
                  FROM usuarios u
                  JOIN suministros s ON s.id_usuario = u.id_usuario
                  WHERE u.id_usuario = $1
                  LIMIT 1;`,
                [idUsuario]
            );
            if (base.rowCount === 0) {
                return res.status(404).json({ estado: "error", mensaje: "Usuario no encontrado." });
            }
            const f = base.rows[0];
            const [recibos, pagos, incidencias] = await Promise.all([
                pool.query(
                    `SELECT id_recibo, periodo, fecha_emision, fecha_vencimiento, monto, consumo_m3, estado
                     FROM recibos WHERE id_suministro = $1 ORDER BY fecha_emision DESC, id_recibo DESC LIMIT 5;`,
                    [f.id_suministro]
                ),
                pool.query(
                    `SELECT p.id_pago, p.id_recibo, p.monto, p.metodo, p.codigo_operacion, p.fecha_pago, r.periodo
                     FROM pagos p JOIN recibos r ON r.id_recibo = p.id_recibo
                     WHERE r.id_suministro = $1 ORDER BY p.fecha_pago DESC LIMIT 5;`,
                    [f.id_suministro]
                ),
                pool.query(
                    `SELECT id_incidencia, tipo, descripcion, referencia, estado, fecha_registro,
                            ${sharedStorage ? 'tiene_foto' : '(foto IS NOT NULL) AS tiene_foto'}
                     FROM incidencias WHERE id_suministro = $1 ORDER BY fecha_registro DESC LIMIT 5;`,
                    [f.id_suministro]
                )
            ]);
            return res.json({
                estado: "ok",
                cuenta: { correo: f.correo, rol: f.rol, fecha_registro: f.fecha_registro, activo: !!f.activo },
                suministro: { id_suministro: f.id_suministro, numero_suministro: f.numero_suministro, distrito: f.distrito, zona: f.zona },
                actividad: {
                    cantidad_recibos: Number(f.cantidad_recibos || 0),
                    cantidad_pagos: Number(f.cantidad_pagos || 0),
                    cantidad_incidencias: Number(f.cantidad_incidencias || 0)
                },
                ultimos_recibos: recibos.rows,
                ultimos_pagos: pagos.rows,
                ultimas_incidencias: incidencias.rows
            });
        } catch (error) {
            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });
            return res.status(500).json({ estado: "error", mensaje: "Error interno del servidor." });
        }
    });

    app.get("/api/admin/resumen", requiereAdmin, async (req, res) => {
        try {
            const [u, r, p, i, c, s] = await Promise.all([
                pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE activo) AS activos FROM usuarios;`),
                pool.query(`SELECT COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE estado IN ('Emitido','Pendiente')) AS emitidos,
                    COUNT(*) FILTER (WHERE estado = 'Pagado') AS pagados,
                    COUNT(*) FILTER (WHERE estado = 'Vencido') AS vencidos,
                    COUNT(*) FILTER (WHERE estado = 'Anulado') AS anulados FROM recibos;`),
                pool.query(`SELECT COUNT(*) AS total, COALESCE(SUM(monto),0) AS monto_total,
                    COUNT(*) FILTER (WHERE fecha_pago::date = CURRENT_DATE) AS hoy,
                    COUNT(*) FILTER (WHERE date_trunc('month', fecha_pago) = date_trunc('month', CURRENT_DATE)) AS mes
                    FROM pagos;`),
                pool.query(`SELECT COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE estado = 'Registrada') AS registradas,
                    COUNT(*) FILTER (WHERE estado = 'En revisión') AS revision,
                    COUNT(*) FILTER (WHERE estado = 'Resuelta') AS resueltas FROM incidencias;`),
                pool.query(`SELECT COUNT(*) FILTER (WHERE NOT COALESCE(cancelado,FALSE) AND NOW() BETWEEN fecha_inicio AND fecha_fin) AS activos,
                    COUNT(*) FILTER (WHERE NOT COALESCE(cancelado,FALSE) AND NOW() < fecha_inicio) AS programados,
                    COUNT(*) AS total FROM cortes_servicio WHERE alcance IN ('Zona','General');`),
                pool.query(`SELECT COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE estado = 'Registrada') AS registradas,
                    COUNT(*) FILTER (WHERE estado = 'En atención') AS atencion,
                    COUNT(*) FILTER (WHERE estado = 'Respondida') AS respondidas,
                    COUNT(*) FILTER (WHERE estado = 'Cerrada') AS cerradas FROM solicitudes_atencion;`)
            ]);
            return res.json({
                estado: "ok",
                usuarios: { total: Number(u.rows[0].total || 0), activos: Number(u.rows[0].activos || 0) },
                recibos: {
                    total: Number(r.rows[0].total || 0), emitidos: Number(r.rows[0].emitidos || 0),
                    pagados: Number(r.rows[0].pagados || 0), vencidos: Number(r.rows[0].vencidos || 0),
                    anulados: Number(r.rows[0].anulados || 0)
                },
                pagos: {
                    total: Number(p.rows[0].total || 0), monto_total: Number(p.rows[0].monto_total || 0),
                    hoy: Number(p.rows[0].hoy || 0), mes: Number(p.rows[0].mes || 0)
                },
                incidencias: {
                    total: Number(i.rows[0].total || 0), registradas: Number(i.rows[0].registradas || 0),
                    revision: Number(i.rows[0].revision || 0), resueltas: Number(i.rows[0].resueltas || 0)
                },
                cortes: {
                    total: Number(c.rows[0].total || 0), activos: Number(c.rows[0].activos || 0),
                    programados: Number(c.rows[0].programados || 0)
                },
                solicitudes: {
                    total: Number(s.rows[0].total || 0), registradas: Number(s.rows[0].registradas || 0),
                    atencion: Number(s.rows[0].atencion || 0), respondidas: Number(s.rows[0].respondidas || 0),
                    cerradas: Number(s.rows[0].cerradas || 0)
                }
            });
        } catch (error) {
            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });
            return res.status(500).json({ estado: "error", mensaje: "Error interno del servidor." });
        }
    });
}

module.exports = { registerRoutes };
