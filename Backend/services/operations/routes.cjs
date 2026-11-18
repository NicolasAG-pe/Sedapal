'use strict';
const { createIncidentTracking, registerIncidentTracking, TrackingError } = require('../../incident-tracking');
const { validarCorteAdmin } = require('../../admin-date-validation');

function registerRoutes(app, { pool, requiereAuth, requiereAdmin, limitadorGenerico, limiteOperacionesSensibles, puedeVerSuministro, emitirASuministro, emitirAAdmins, emitirAAutenticados, crearNotificacion, sharedStorage = false }) {
    app.get("/api/incidencias/:suministro", requiereAuth, async (req, res) => {

        try {

            const numeroSuministro = req.params.suministro;

            if (!puedeVerSuministro(req, numeroSuministro)) {
                return res.status(403).json({ estado: "error", mensaje: "Acceso denegado." });
            }

            const consulta = `
                SELECT
                    i.id_incidencia,
                    i.tipo,
                    i.descripcion,
                    i.referencia,
                    i.latitud,
                    i.longitud,
                    (i.foto IS NOT NULL) AS tiene_foto,
                    i.estado,
                    i.fecha_registro
                FROM incidencias i
                JOIN suministros s
                  ON s.id_suministro = i.id_suministro
                WHERE s.numero_suministro = $1
                ORDER BY i.fecha_registro DESC;
            `;

            const resultado = await pool.query(
                consulta,
                [numeroSuministro]
            );

            res.json({
                suministro: numeroSuministro,
                cantidad: resultado.rowCount,
                incidencias: resultado.rows
            });

        } catch (error) {

            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });

            res.status(500).json({
                mensaje: "Error al consultar las incidencias"
            });
        }

    });

    app.get("/api/incidencias/:id/foto", requiereAuth, async (req, res) => {
        try {
            const idIncidencia = Number(req.params.id);

            if (!Number.isInteger(idIncidencia) || idIncidencia <= 0) {
                return res.status(404).json({
                    estado: "error",
                    mensaje: "Fotografía no encontrada."
                });
            }

            const resultado = await pool.query(
                `SELECT foto, foto_mime
                 FROM incidencias
                 WHERE id_incidencia = $1
                   AND id_suministro = $2
                 LIMIT 1;`,
                [idIncidencia, req.user.id_suministro]
            );

            if (resultado.rowCount === 0 || !resultado.rows[0].foto) {
                return res.status(404).json({
                    estado: "error",
                    mensaje: "Fotografía no encontrada."
                });
            }

            const mime = String(resultado.rows[0].foto_mime || '').toLowerCase();

            if (FOTO_MIMES_PERMITIDOS.indexOf(mime) === -1) {
                return res.status(404).json({
                    estado: "error",
                    mensaje: "Fotografía no encontrada."
                });
            }

            res.set('Content-Type', mime);
            res.set('Content-Length', String(resultado.rows[0].foto.length));
            return res.send(resultado.rows[0].foto);

        } catch (error) {
            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });

            return res.status(500).json({
                estado: "error",
                mensaje: "Error interno del servidor."
            });
        }
    });

    const FOTO_MIMES_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];

    const FOTO_MAX_BYTES = 2 * 1024 * 1024;

    function validarFotoIncidencia(fotoBase64, fotoMime){
        if (fotoBase64 === null || fotoBase64 === undefined || fotoBase64 === '') {
            return { foto: null, mime: null };
        }

        if (typeof fotoBase64 !== 'string' || fotoBase64.length > 4 * 1024 * 1024) {
            return { error: 'La imagen supera el tamaño máximo permitido de 2 MB.' };
        }

        const coincidencia = fotoBase64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);

        if (!coincidencia) {
            return { error: 'Formato de imagen inválido.' };
        }

        const mimeReal = coincidencia[1].toLowerCase();

        if (FOTO_MIMES_PERMITIDOS.indexOf(mimeReal) === -1) {
            return { error: 'Formato de imagen no permitido. Solo JPG, PNG o WebP.' };
        }

        if (fotoMime !== null && fotoMime !== undefined && fotoMime !== '' &&
            String(fotoMime).toLowerCase() !== mimeReal) {
            return { error: 'Formato de imagen no permitido. Solo JPG, PNG o WebP.' };
        }

        let bytes;

        try {
            bytes = Buffer.from(coincidencia[2].replace(/\s/g, ''), 'base64');
        } catch (e) {
            return { error: 'Formato de imagen inválido.' };
        }

        if (bytes.length === 0 || bytes.length > FOTO_MAX_BYTES) {
            return { error: 'La imagen supera el tamaño máximo permitido de 2 MB.' };
        }

        const esJpeg = bytes.length > 2 && bytes[0] === 0xFF && bytes[1] === 0xD8;
        const esPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 &&
            bytes[2] === 0x4E && bytes[3] === 0x47;
        const esWebp = bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' &&
            bytes.toString('ascii', 8, 12) === 'WEBP';
        const coherente = (mimeReal === 'image/jpeg' && esJpeg) ||
            (mimeReal === 'image/png' && esPng) ||
            (mimeReal === 'image/webp' && esWebp);

        if (!coherente) {
            return { error: 'Formato de imagen inválido.' };
        }

        return { foto: bytes, mime: mimeReal };
    }

    app.post("/api/incidencias", limiteOperacionesSensibles, requiereAuth, async (req, res) => {
        try {
            const { tipo, descripcion, referencia, latitud, longitud, foto_base64, foto_mime } = req.body || {};
            // El suministro se obtiene del JWT, nunca del body (FASE 27).

            if (!String(tipo || '').trim() || String(tipo || '').trim().length > 80) {
                return res.status(400).json({
                    estado: "error",
                    mensaje: "El tipo de incidencia es obligatorio (máximo 80 caracteres)."
                });
            }

            if (String(descripcion || '').trim().length < 10) {
                return res.status(400).json({
                    estado: "error",
                    mensaje: "La descripción debe tener al menos 10 caracteres."
                });
            }

            if (String(descripcion || '').trim().length > 2000) {
                return res.status(400).json({
                    estado: "error",
                    mensaje: "La descripción supera el límite permitido (máximo 2000 caracteres)."
                });
            }

            if (!String(referencia || '').trim() || String(referencia || '').trim().length > 200) {
                return res.status(400).json({
                    estado: "error",
                    mensaje: "La referencia es obligatoria (máximo 200 caracteres)."
                });
            }

            const fotoValidada = validarFotoIncidencia(foto_base64, foto_mime);

            if (fotoValidada.error) {
                const esTamano = fotoValidada.error.indexOf('2 MB') > -1;

                return res.status(esTamano ? 413 : 400).json({
                    estado: "error",
                    mensaje: fotoValidada.error
                });
            }

            const idSuministro = Number(req.user.id_suministro);

            if (!Number.isInteger(idSuministro) || idSuministro <= 0) {
                return res.status(401).json({ estado: "error", mensaje: "Autenticación requerida." });
            }

            const latitudValor = (latitud === null || latitud === undefined || latitud === '')
                ? null
                : Number(latitud);
            const longitudValor = (longitud === null || longitud === undefined || longitud === '')
                ? null
                : Number(longitud);

            const insertResultado = await pool.query(
                `INSERT INTO incidencias (
                  id_suministro,
                  tipo,
                  descripcion,
                  referencia,
                  latitud,
                  longitud,
                  foto,
                  foto_mime
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                RETURNING
                  id_incidencia,
                  tipo,
                  descripcion,
                  referencia,
                  latitud,
                  longitud,
                  (foto IS NOT NULL) AS tiene_foto,
                  estado,
                  fecha_registro;`,
                [
                    idSuministro,
                    String(tipo).trim(),
                    String(descripcion).trim(),
                    String(referencia).trim(),
                    Number.isFinite(latitudValor) ? latitudValor : null,
                    Number.isFinite(longitudValor) ? longitudValor : null,
                    fotoValidada.foto,
                    fotoValidada.mime
                ]
            );

            // Tiempo real (post-persistencia): aviso mínimo a admins y al propio
            // suministro (otras pestañas del mismo usuario). El detalle se
            // consulta por REST; aquí solo el id.
            emitirAAdmins('incidencia:nueva', { id: insertResultado.rows[0].id_incidencia });
            emitirASuministro(idSuministro, 'incidencia:nueva', { id: insertResultado.rows[0].id_incidencia });

            return res.status(201).json({
                estado: "ok",
                incidencia: insertResultado.rows[0]
            });

        } catch (error) {
            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });

            return res.status(500).json({
                estado: "error",
                mensaje: "Error interno del servidor."
            });
        }
    });

    app.get("/api/cortes", async (req, res) => {
        try {
            const consulta = `
                SELECT
                  c.id_corte,
                  c.alcance,
                  c.distrito,
                  c.zona,
                  c.motivo,
                  c.fecha_inicio,
                  c.fecha_fin,
                  CASE
                    WHEN NOW() < c.fecha_inicio THEN 'Programado'
                    WHEN NOW() > c.fecha_fin THEN 'Finalizado'
                    ELSE 'En proceso'
                  END AS estado
                FROM cortes_servicio c
                WHERE c.alcance IN ('Zona', 'General')
                  AND c.fecha_inicio IS NOT NULL
                  AND c.fecha_fin IS NOT NULL
                  AND NOT COALESCE(c.cancelado, FALSE)
                  AND NOW() <= c.fecha_fin
                ORDER BY c.fecha_inicio ASC;
            `;

            const resultado = await pool.query(consulta);

            res.json({
                actualizado_en: new Date().toISOString(),
                cantidad: resultado.rowCount,
                cortes: resultado.rows
            });

        } catch (error) {
            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });

            return res.status(500).json({
                estado: "error",
                mensaje: "Error interno del servidor."
            });
        }
    });

    app.get("/api/cortes/:suministro", requiereAuth, async (req, res) => {
        try {
            const numeroSuministro = String(req.params.suministro || '').trim();

            if (!/^\d{9}$/.test(numeroSuministro)) {
                return res.status(400).json({
                    estado: "error",
                    mensaje: "El número de suministro debe contener 9 dígitos."
                });
            }

            if (!puedeVerSuministro(req, numeroSuministro)) {
                return res.status(403).json({ estado: "error", mensaje: "Acceso denegado." });
            }

            const suministroResultado = await pool.query(
                `SELECT distrito, zona
                 FROM suministros
                 WHERE numero_suministro = $1
                 LIMIT 1;`,
                [numeroSuministro]
            );

            const distritoSuministro = suministroResultado.rowCount > 0
                ? suministroResultado.rows[0].distrito
                : null;
            const zonaSuministro = suministroResultado.rowCount > 0
                ? suministroResultado.rows[0].zona
                : null;

            const consulta = `
                SELECT
                  c.id_corte,
                  c.alcance,
                  c.distrito,
                  c.zona,
                  c.motivo,
                  c.fecha_inicio,
                  c.fecha_fin,
                  CASE
                    WHEN NOW() < c.fecha_inicio THEN 'Programado'
                    WHEN NOW() > c.fecha_fin THEN 'Finalizado'
                    ELSE 'En proceso'
                  END AS estado
                FROM cortes_servicio c
                WHERE c.alcance IN ('Zona', 'General')
                  AND c.fecha_inicio IS NOT NULL
                  AND c.fecha_fin IS NOT NULL
                  AND NOT COALESCE(c.cancelado, FALSE)
                  AND NOW() <= c.fecha_fin
                  AND (
                    c.alcance = 'General'
                    OR (
                      $1::text IS NOT NULL AND $2::text IS NOT NULL
                      AND c.distrito = $1 AND c.zona = $2
                    )
                  )
                ORDER BY c.fecha_inicio ASC;
            `;

            const resultado = await pool.query(
                consulta,
                [distritoSuministro, zonaSuministro]
            );

            res.json({
                suministro: numeroSuministro,
                ubicacion: {
                    distrito: distritoSuministro,
                    zona: zonaSuministro
                },
                actualizado_en: new Date().toISOString(),
                cantidad: resultado.rowCount,
                cortes: resultado.rows
            });

        } catch (error) {
            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });

            return res.status(500).json({
                estado: "error",
                mensaje: "Error interno del servidor."
            });
        }
    });

    function filaCorteAdmin(fila){
        let estado = 'En proceso';

        if (fila.cancelado) {
            estado = 'Cancelado';
        } else if (fila.fecha_inicio && new Date() < new Date(fila.fecha_inicio)) {
            estado = 'Programado';
        } else if (fila.fecha_fin && new Date() > new Date(fila.fecha_fin)) {
            estado = 'Finalizado';
        }

        return {
            id_corte: fila.id_corte,
            alcance: fila.alcance,
            distrito: fila.distrito,
            zona: fila.zona,
            motivo: fila.motivo,
            fecha_inicio: fila.fecha_inicio,
            fecha_fin: fila.fecha_fin,
            cancelado: !!fila.cancelado,
            estado: estado
        };
    }

    app.get("/api/admin/cortes", requiereAdmin, async (req, res) => {
        try {
            const resultado = await pool.query(
                `SELECT
                   id_corte, alcance, distrito, zona, motivo,
                   fecha_inicio, fecha_fin, cancelado
                 FROM cortes_servicio
                 WHERE alcance IN ('Zona', 'General')
                 ORDER BY cancelado ASC, fecha_inicio DESC NULLS LAST;`
            );

            res.json({
                cantidad: resultado.rowCount,
                cortes: resultado.rows.map(filaCorteAdmin)
            });

        } catch (error) {
            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });

            return res.status(500).json({
                estado: "error",
                mensaje: "Error interno del servidor."
            });
        }
    });

    app.post("/api/admin/cortes", requiereAdmin, async (req, res) => {
        try {
            const validado = validarCorteAdmin(req.body);

            if (validado.error) {
                return res.status(400).json({
                    estado: "error",
                    mensaje: validado.error
                });
            }

            const insertado = await pool.query(
                `INSERT INTO cortes_servicio
                   (alcance, distrito, zona, motivo, fecha_inicio, fecha_fin, cancelado)
                 VALUES ($1, $2, $3, $4, $5, $6, FALSE)
                 RETURNING
                   id_corte, alcance, distrito, zona, motivo,
                   fecha_inicio, fecha_fin, cancelado;`,
                [validado.alcance, validado.distrito, validado.zona, validado.motivo, validado.inicio, validado.fin]
            );

            // FASE 19: corte GENERAL => notificación General (sin fila por usuario).
            // Corte de Zona => aviso dinámico vía Cortes (sin notificación masiva).
            try {
                if (validado.alcance === 'General') {
                    await crearNotificacion({
                        id_suministro: null,
                        alcance: 'General',
                        titulo: 'Aviso general: corte de servicio',
                        mensaje: validado.motivo + ' (del ' + validado.inicio.toLocaleString('es-PE') + ' al ' + validado.fin.toLocaleString('es-PE') + ').',
                        tipo: 'corte'
                    });
                }
            } catch (e) {}

            // Tiempo real: aviso a todos los autenticados (sin datos privados).
            // Cada cliente filtra por General/Distrito/Zona vía GET /api/me/cortes.
            emitirAAutenticados('corte:actualizado', { id: insertado.rows[0].id_corte, accion: 'creado' });

            return res.status(201).json({
                estado: "ok",
                corte: filaCorteAdmin(insertado.rows[0])
            });

        } catch (error) {
            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });

            return res.status(500).json({
                estado: "error",
                mensaje: "Error interno del servidor."
            });
        }
    });

    app.patch("/api/admin/cortes/:id/cancelar", requiereAdmin, async (req, res) => {
        try {
            const idCorte = Number(req.params.id);

            if (!Number.isInteger(idCorte) || idCorte <= 0) {
                return res.status(404).json({
                    estado: "error",
                    mensaje: "Corte no encontrado."
                });
            }

            const resultado = await pool.query(
                `UPDATE cortes_servicio
                 SET cancelado = TRUE
                 WHERE id_corte = $1
                 RETURNING
                   id_corte, alcance, distrito, zona, motivo,
                   fecha_inicio, fecha_fin, cancelado;`,
                [idCorte]
            );

            if (resultado.rowCount === 0) {
                return res.status(404).json({
                    estado: "error",
                    mensaje: "Corte no encontrado."
                });
            }

            emitirAAutenticados('corte:actualizado', { id: idCorte, accion: 'cancelado' });

            return res.json({
                estado: "ok",
                corte: filaCorteAdmin(resultado.rows[0])
            });

        } catch (error) {
            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });

            return res.status(500).json({
                estado: "error",
                mensaje: "Error interno del servidor."
            });
        }
    });

    app.patch("/api/admin/cortes/:id", requiereAdmin, async (req, res) => {
        try {
            const idCorte = Number(req.params.id);

            if (!Number.isInteger(idCorte) || idCorte <= 0) {
                return res.status(404).json({
                    estado: "error",
                    mensaje: "Corte no encontrado."
                });
            }

            const actual = await pool.query(
                `SELECT cancelado FROM cortes_servicio WHERE id_corte = $1 LIMIT 1;`,
                [idCorte]
            );

            if (actual.rowCount === 0) {
                return res.status(404).json({
                    estado: "error",
                    mensaje: "Corte no encontrado."
                });
            }

            if (actual.rows[0].cancelado) {
                return res.status(409).json({
                    estado: "error",
                    mensaje: "No se puede editar un corte cancelado."
                });
            }

            const validado = validarCorteAdmin(req.body);

            if (validado.error) {
                return res.status(400).json({
                    estado: "error",
                    mensaje: validado.error
                });
            }

            const resultado = await pool.query(
                `UPDATE cortes_servicio
                 SET alcance = $1, distrito = $2, zona = $3, motivo = $4,
                     fecha_inicio = $5, fecha_fin = $6
                 WHERE id_corte = $7
                 RETURNING
                   id_corte, alcance, distrito, zona, motivo,
                   fecha_inicio, fecha_fin, cancelado;`,
                [validado.alcance, validado.distrito, validado.zona, validado.motivo, validado.inicio, validado.fin, idCorte]
            );

            emitirAAutenticados('corte:actualizado', { id: idCorte, accion: 'editado' });

            return res.json({
                estado: "ok",
                corte: filaCorteAdmin(resultado.rows[0])
            });

        } catch (error) {
            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });

            return res.status(500).json({
                estado: "error",
                mensaje: "Error interno del servidor."
            });
        }
    });

    const INCIDENCIA_ESTADOS = ['Registrada', 'En revisión', 'Resuelta'];

    app.get("/api/admin/incidencias", requiereAdmin, async (req, res) => {
        try {
            const resultado = await pool.query(
                `SELECT
                   i.id_incidencia,
                   s.numero_suministro,
                   i.tipo,
                   i.descripcion,
                   i.referencia,
                   i.latitud,
                   i.longitud,
                   i.fecha_registro,
                   i.estado,
                   (i.foto IS NOT NULL) AS tiene_foto
                 FROM incidencias i
                 JOIN suministros s
                   ON s.id_suministro = i.id_suministro
                 ORDER BY i.fecha_registro DESC;`
            );

            res.json({
                cantidad: resultado.rowCount,
                incidencias: resultado.rows
            });

        } catch (error) {
            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });

            return res.status(500).json({
                estado: "error",
                mensaje: "Error interno del servidor."
            });
        }
    });

    app.get("/api/admin/incidencias/:id/foto", requiereAdmin, async (req, res) => {
        try {
            const idIncidencia = Number(req.params.id);

            if (!Number.isInteger(idIncidencia) || idIncidencia <= 0) {
                return res.status(404).json({
                    estado: "error",
                    mensaje: "Fotografía no encontrada."
                });
            }

            const resultado = await pool.query(
                `SELECT foto, foto_mime
                 FROM incidencias
                 WHERE id_incidencia = $1
                 LIMIT 1;`,
                [idIncidencia]
            );

            if (resultado.rowCount === 0 || !resultado.rows[0].foto) {
                return res.status(404).json({
                    estado: "error",
                    mensaje: "Fotografía no encontrada."
                });
            }

            const mime = String(resultado.rows[0].foto_mime || '').toLowerCase();

            if (FOTO_MIMES_PERMITIDOS.indexOf(mime) === -1) {
                return res.status(404).json({
                    estado: "error",
                    mensaje: "Fotografía no encontrada."
                });
            }

            res.set('Content-Type', mime);
            res.set('Content-Length', String(resultado.rows[0].foto.length));
            return res.send(resultado.rows[0].foto);

        } catch (error) {
            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });

            return res.status(500).json({
                estado: "error",
                mensaje: "Error interno del servidor."
            });
        }
    });

    const seguimientoIncidencias=createIncidentTracking({ pool, sharedStorage });

    registerIncidentTracking(app,{service:seguimientoIncidencias,auth:requiereAuth,admin:requiereAdmin});

    app.patch("/api/admin/incidencias/:id/estado", limitadorGenerico(60,15), requiereAdmin, async(req,res)=>{
        try{
            const result=await seguimientoIncidencias.change(req.user,req.params.id,req.body||{});
            // El estado, evento y notificación/outbox ya confirmaron COMMIT.
            if(result.cambiada){
                const incidente=result.incidencia;
                emitirASuministro(incidente.id_suministro,'notificacion:nueva',{id:result.notificacion_id,alcance:'Usuario',tipo:'incidencia'});
                const aviso={id:incidente.id_incidencia,estado:incidente.estado};
                emitirASuministro(incidente.id_suministro,'incidencia:actualizada',aviso);
                emitirAAdmins('incidencia:actualizada',aviso);
            }
            return res.set('Cache-Control','no-store').json({estado:'ok',incidencia:result.incidencia,cambiada:result.cambiada,repetida:result.repetida===true});
        }catch(error){
            const status=error instanceof TrackingError?error.status:503;
            if(status===503)console.error('No se pudo actualizar el estado de incidencia.');
            return res.status(status).json({estado:'error',mensaje:status===503?'No se pudo confirmar el cambio. Consulta el historial antes de reintentar.':error.message});
        }
    });

    const ATENCION_ESTADOS = ['Registrada', 'En atención', 'Respondida', 'Cerrada'];

    function validarSolicitudAtencion(body){
        const categoria = String((body || {}).categoria || '').trim();
        const asunto = String((body || {}).asunto || '').trim();
        const descripcion = String((body || {}).descripcion || '').trim();
        if (!categoria || categoria.length > 80) return { error: 'La categoría es obligatoria (máximo 80 caracteres).' };
        if (!asunto || asunto.length > 150) return { error: 'El asunto es obligatorio (máximo 150 caracteres).' };
        if (descripcion.length < 10) return { error: 'La descripción debe tener al menos 10 caracteres.' };
        if (descripcion.length > 2000) return { error: 'La descripción es demasiado larga (máximo 2000 caracteres).' };
        return { categoria, asunto, descripcion };
    }

    app.post("/api/atencion", limiteOperacionesSensibles, requiereAuth, async (req, res) => {
        try {
            const validado = validarSolicitudAtencion(req.body);
            if (validado.error) {
                return res.status(400).json({ estado: "error", mensaje: validado.error });
            }
            const idSuministro = Number(req.user.id_suministro);
            if (!Number.isInteger(idSuministro) || idSuministro <= 0) {
                return res.status(401).json({ estado: "error", mensaje: "Autenticación requerida." });
            }
            const insertado = await pool.query(
                `INSERT INTO solicitudes_atencion (id_suministro, categoria, asunto, descripcion)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id_solicitud, categoria, asunto, descripcion, estado, fecha_registro;`,
                [idSuministro, validado.categoria, validado.asunto, validado.descripcion]
            );
            // Tiempo real: aviso mínimo a admins y al propio suministro.
            emitirAAdmins('atencion:nueva', { id: insertado.rows[0].id_solicitud });
            emitirASuministro(idSuministro, 'atencion:nueva', { id: insertado.rows[0].id_solicitud });
            return res.status(201).json({
                estado: "ok",
                solicitud: {
                    id_solicitud: insertado.rows[0].id_solicitud,
                    estado: insertado.rows[0].estado,
                    fecha: insertado.rows[0].fecha_registro,
                    categoria: insertado.rows[0].categoria,
                    asunto: insertado.rows[0].asunto
                }
            });
        } catch (error) {
            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });
            return res.status(500).json({ estado: "error", mensaje: "Error interno del servidor." });
        }
    });

    app.get("/api/atencion", requiereAuth, async (req, res) => {
        try {
            const idSuministro = Number(req.user.id_suministro);
            const resultado = await pool.query(
                `SELECT id_solicitud, categoria, asunto, descripcion, estado, respuesta,
                        fecha_registro, fecha_actualizacion
                 FROM solicitudes_atencion
                 WHERE id_suministro = $1
                 ORDER BY fecha_registro DESC;`,
                [idSuministro]
            );
            return res.json({ cantidad: resultado.rowCount, solicitudes: resultado.rows });
        } catch (error) {
            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });
            return res.status(500).json({ estado: "error", mensaje: "Error interno del servidor." });
        }
    });

    app.get("/api/admin/atencion", requiereAdmin, async (req, res) => {
        try {
            const { estado, categoria, suministro } = req.query || {};
            const condiciones = [];
            const valores = [];
            // Filtros acotados: estado solo de la lista válida, categoría (máx. 80)
            // y suministro parcial (máx. 120).
            if (estado && String(estado).trim() !== '' && String(estado).trim() !== 'Todos') {
                const fEst = String(estado).trim();
                if (ATENCION_ESTADOS.indexOf(fEst) === -1) {
                    return res.status(400).json({ estado: "error", mensaje: "Filtro de estado inválido." });
                }
                valores.push(fEst);
                condiciones.push('a.estado = $' + valores.length);
            }
            if (categoria && String(categoria).trim() !== '' && String(categoria).trim() !== 'Todos') {
                const fCat = String(categoria).trim().slice(0, 80);
                valores.push(fCat);
                condiciones.push('a.categoria = $' + valores.length);
            }
            if (suministro && String(suministro).trim() !== '') {
                const fSum = String(suministro).trim();
                if (!/^\d{1,9}$/.test(fSum)) {
                    return res.status(400).json({ estado: "error", mensaje: "El filtro de suministro debe contener entre 1 y 9 dígitos." });
                }
                valores.push('%' + fSum + '%');
                condiciones.push('s.numero_suministro ILIKE $' + valores.length);
            }
            const filtro = condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : '';
            const resultado = await pool.query(
                `SELECT
                    a.id_solicitud, s.numero_suministro, a.categoria, a.asunto, a.descripcion,
                    a.estado, a.respuesta, a.fecha_registro, a.fecha_actualizacion
                  FROM solicitudes_atencion a
                  JOIN suministros s ON s.id_suministro = a.id_suministro
                  ${filtro}
                  ORDER BY a.fecha_registro DESC
                  LIMIT 500;`,
                valores
            );
            return res.json({ cantidad: resultado.rowCount, solicitudes: resultado.rows });
        } catch (error) {
            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });
            return res.status(500).json({ estado: "error", mensaje: "Error interno del servidor." });
        }
    });

    app.patch("/api/admin/atencion/:id", requiereAdmin, async (req, res) => {
        try {
            const idSolicitud = Number(req.params.id);
            if (!Number.isInteger(idSolicitud) || idSolicitud <= 0) {
                return res.status(404).json({ estado: "error", mensaje: "Solicitud no encontrada." });
            }
            const { estado, respuesta } = req.body || {};
            const campos = [];
            const valores = [];
            if (estado !== undefined && estado !== null && String(estado).trim() !== '') {
                const est = String(estado).trim();
                if (ATENCION_ESTADOS.indexOf(est) === -1) {
                    return res.status(400).json({ estado: "error", mensaje: "Estado inválido. Debe ser Registrada, En atención, Respondida o Cerrada." });
                }
                valores.push(est);
                campos.push('estado = $' + valores.length);
            }
            if (respuesta !== undefined) {
                const resp = respuesta === null ? null : String(respuesta).trim();
                if (resp !== null && resp !== '' && resp.length > 2000) {
                    return res.status(400).json({ estado: "error", mensaje: "La respuesta es demasiado larga (máximo 2000 caracteres)." });
                }
                valores.push(resp === '' ? null : resp);
                campos.push('respuesta = $' + valores.length);
            }
            if (!campos.length) {
                return res.status(400).json({ estado: "error", mensaje: "Indica estado y/o respuesta para actualizar." });
            }
            valores.push(idSolicitud);
            const resultado = await pool.query(
                `UPDATE solicitudes_atencion
                 SET ${campos.join(', ')}, fecha_actualizacion = CURRENT_TIMESTAMP
                 WHERE id_solicitud = $${valores.length}
                 RETURNING id_solicitud, id_suministro, categoria, asunto, descripcion, estado, respuesta,
                           fecha_registro, fecha_actualizacion;`,
                valores
            );
            if (resultado.rowCount === 0) {
                return res.status(404).json({ estado: "error", mensaje: "Solicitud no encontrada." });
            }
            const sol = resultado.rows[0];
            // Notificar al suministro si hay respuesta o cambio importante (Respondida/Cerrada).
            try {
                const hayRespuesta = sol.respuesta && String(sol.respuesta).trim() !== '';
                if (hayRespuesta || sol.estado === 'Respondida' || sol.estado === 'Cerrada' || sol.estado === 'En atención') {
                    await crearNotificacion({
                        id_suministro: sol.id_suministro,
                        alcance: 'Usuario',
                        titulo: 'Atención al cliente: solicitud #' + sol.id_solicitud + ' ' + sol.estado,
                        mensaje: hayRespuesta
                            ? 'Tu solicitud "' + sol.asunto + '" cambió a ' + sol.estado + '. Respuesta: ' + String(sol.respuesta).slice(0, 300)
                            : 'Tu solicitud "' + sol.asunto + '" cambió a ' + sol.estado + '.',
                        tipo: 'atencion'
                    });
                }
            } catch (e) {}
            // Tiempo real: el propietario recarga Atención + Notificaciones por REST.
            emitirASuministro(sol.id_suministro, 'atencion:actualizada', { id: sol.id_solicitud, estado: sol.estado });
            return res.json({ estado: "ok", solicitud: sol });
        } catch (error) {
            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });
            return res.status(500).json({ estado: "error", mensaje: "Error interno del servidor." });
        }
    });

    app.get("/api/me/incidencias", requiereAuth, async (req, res) => {
        try {
            const resultado = await pool.query(
                `SELECT id_incidencia, tipo, descripcion, referencia, latitud, longitud,
                        (foto IS NOT NULL) AS tiene_foto, estado, fecha_registro
                 FROM incidencias
                 WHERE id_suministro = $1
                 ORDER BY fecha_registro DESC;`,
                [req.user.id_suministro]
            );
            return res.json({ suministro: req.user.numero_suministro, cantidad: resultado.rowCount, incidencias: resultado.rows });
        } catch (error) {
            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });
            return res.status(500).json({ mensaje: "Error al consultar las incidencias" });
        }
    });

    app.get("/api/me/cortes", requiereAuth, async (req, res) => {
        try {
            const sum = await pool.query(
                `SELECT distrito, zona FROM suministros WHERE id_suministro = $1 LIMIT 1;`,
                [req.user.id_suministro]
            );
            const distritoSuministro = sum.rowCount > 0 ? sum.rows[0].distrito : null;
            const zonaSuministro = sum.rowCount > 0 ? sum.rows[0].zona : null;
            const resultado = await pool.query(
                `SELECT c.id_corte, c.alcance, c.distrito, c.zona, c.motivo, c.fecha_inicio, c.fecha_fin,
                        CASE WHEN NOW() < c.fecha_inicio THEN 'Programado'
                             WHEN NOW() > c.fecha_fin THEN 'Finalizado'
                             ELSE 'En proceso' END AS estado
                 FROM cortes_servicio c
                 WHERE c.alcance IN ('Zona', 'General')
                   AND c.fecha_inicio IS NOT NULL AND c.fecha_fin IS NOT NULL
                   AND NOT COALESCE(c.cancelado, FALSE)
                   AND NOW() <= c.fecha_fin
                   AND (c.alcance = 'General'
                        OR ($1::text IS NOT NULL AND $2::text IS NOT NULL AND c.distrito = $1 AND c.zona = $2))
                 ORDER BY c.fecha_inicio ASC;`,
                [distritoSuministro, zonaSuministro]
            );
            return res.json({
                suministro: req.user.numero_suministro,
                ubicacion: { distrito: distritoSuministro, zona: zonaSuministro },
                actualizado_en: new Date().toISOString(),
                cantidad: resultado.rowCount,
                cortes: resultado.rows
            });
        } catch (error) {
            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });
            return res.status(500).json({ estado: "error", mensaje: "Error interno del servidor." });
        }
    });
}

module.exports = { registerRoutes };
