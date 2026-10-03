const express = require("express");
const cors = require("cors");
const crypto = require('crypto');
const { Pool } = require("pg");

const app = express();
const PORT = 3000;

app.use(cors());
// Límite acotado: fotografías de incidencias hasta 2 MB + overhead base64.
app.use(express.json({ limit: '3mb' }));

const pool = new Pool({
    host: process.env.DB_HOST || "db",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD
});


// ==========================================
// PRUEBA DE CONEXIÓN
// ==========================================

app.get("/api/health", async (req, res) => {
    try {
        const resultado = await pool.query(
            "SELECT NOW() AS fecha_servidor"
        );

        res.json({
            estado: "ok",
            mensaje: "API de Hidro Mejora conectada a PostgreSQL",
            fecha: resultado.rows[0].fecha_servidor
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            estado: "error",
            mensaje: "No se pudo conectar con PostgreSQL"
        });
    }
});


// ==========================================
// CONSULTAR RECIBOS POR SUMINISTRO
// ==========================================

app.get("/api/recibos/:suministro", async (req, res) => {

    try {

        const numeroSuministro = req.params.suministro;

        const consulta = `
            SELECT
                r.id_recibo,
                r.periodo,
                r.fecha_emision,
                r.fecha_vencimiento,
                r.monto,
                r.consumo_m3,
                r.estado
            FROM recibos r
            INNER JOIN suministros s
                ON s.id_suministro = r.id_suministro
            WHERE s.numero_suministro = $1
            ORDER BY r.fecha_emision DESC;
        `;

        const resultado = await pool.query(
            consulta,
            [numeroSuministro]
        );

        res.json({
            suministro: numeroSuministro,
            cantidad: resultado.rowCount,
            recibos: resultado.rows
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            mensaje: "Error al consultar los recibos"
        });
    }

});


// ==========================================
// CONSULTAR INCIDENCIAS POR SUMINISTRO
// ==========================================

app.get("/api/incidencias/:suministro", async (req, res) => {

    try {

        const numeroSuministro = req.params.suministro;

        const consulta = `
            SELECT
                i.id_incidencia,
                i.tipo,
                i.descripcion,
                i.referencia,
                i.latitud,
                i.longitud,
                (i.foto IS NOT NULL) AS tiene_foto,
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

        console.error(error);

        res.status(500).json({
            mensaje: "Error al consultar las incidencias"
        });
    }

});


// ==========================================
// FOTOGRAFÍA DE INCIDENCIA (bytes reales)
// Sin sesión/token por diseño actual; mismo
// nivel de acceso que el resto del prototipo.
// ==========================================

app.get("/api/incidencias/:id/foto", async (req, res) => {
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
        console.error(error);

        return res.status(500).json({
            estado: "error",
            mensaje: "Error interno del servidor."
        });
    }
});


function verificarClave(password, almacenado){
  try{
    const partes = String(almacenado || '').split('$');

    if(partes.length !== 3 || partes[0] !== 'scrypt'){
      return false;
    }

    const salt = partes[1];
    const hashOriginal = Buffer.from(partes[2], 'hex');
    const hashCalculado = crypto.scryptSync(password, salt, 64);

    return hashOriginal.length === hashCalculado.length &&
      crypto.timingSafeEqual(hashOriginal, hashCalculado);
  }catch(error){
    return false;
  }
}


function generarClaveHash(password){
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');

  return 'scrypt$' + salt + '$' + hash;
}


// ==========================================
// AUTENTICACIÓN DE USUARIO POR SUMINISTRO
// ==========================================

app.post("/api/auth/login", async (req, res) => {
    try {
        const { numero_suministro, password } = req.body || {};

        if (!/^\d{7,9}$/.test(String(numero_suministro || ''))) {
            return res.status(401).json({
                estado: "error",
                mensaje: "Número de suministro o contraseña incorrectos."
            });
        }

        if (typeof password !== 'string' || password.length < 4) {
            return res.status(401).json({
                estado: "error",
                mensaje: "Número de suministro o contraseña incorrectos."
            });
        }

        const consulta = `
            SELECT
              u.id_usuario,
              u.correo,
              u.clave_hash,
              s.id_suministro,
              s.numero_suministro
            FROM suministros s
            JOIN usuarios u ON u.id_usuario = s.id_usuario
            WHERE s.numero_suministro = $1
            LIMIT 1;
        `;

        const resultado = await pool.query(consulta, [String(numero_suministro)]);

        if (resultado.rowCount === 0) {
            return res.status(401).json({
                estado: "error",
                mensaje: "Número de suministro o contraseña incorrectos."
            });
        }

        const fila = resultado.rows[0];

        if (!verificarClave(password, fila.clave_hash)) {
            return res.status(401).json({
                estado: "error",
                mensaje: "Número de suministro o contraseña incorrectos."
            });
        }

        return res.status(200).json({
            estado: "ok",
            usuario: {
                id_usuario: fila.id_usuario,
                correo: fila.correo
            },
            suministro: {
                id_suministro: fila.id_suministro,
                numero_suministro: fila.numero_suministro
            }
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            estado: "error",
            mensaje: "Error interno del servidor."
        });
    }
});


// ==========================================
// REGISTRO DE USUARIO + SUMINISTRO
// Prototipo académico: el suministro informado por
// el usuario no se valida contra sistemas oficiales.
// ==========================================

app.post("/api/auth/register", async (req, res) => {
    let cliente = null;

    try {
        const { correo, numero_suministro, password } = req.body || {};

        const correoNormalizado = String(correo || '').trim().toLowerCase();
        const suministroNormalizado = String(numero_suministro || '').trim();

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoNormalizado) || correoNormalizado.length > 120) {
            return res.status(400).json({
                estado: "error",
                mensaje: "Correo electrónico inválido."
            });
        }

        if (!/^\d{7,9}$/.test(suministroNormalizado)) {
            return res.status(400).json({
                estado: "error",
                mensaje: "Número de suministro inválido. Debe tener entre 7 y 9 dígitos."
            });
        }

        if (typeof password !== 'string' || password.length < 8) {
            return res.status(400).json({
                estado: "error",
                mensaje: "La contraseña debe tener al menos 8 caracteres."
            });
        }

        if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
            return res.status(400).json({
                estado: "error",
                mensaje: "La contraseña debe contener al menos una letra y un número."
            });
        }

        cliente = await pool.connect();
        await cliente.query('BEGIN');

        const correoExistente = await cliente.query(
            `SELECT id_usuario FROM usuarios WHERE correo = $1 LIMIT 1;`,
            [correoNormalizado]
        );

        if (correoExistente.rowCount > 0) {
            await cliente.query('ROLLBACK');
            return res.status(409).json({
                estado: "error",
                mensaje: "El correo ya se encuentra registrado."
            });
        }

        const suministroExistente = await cliente.query(
            `SELECT id_suministro FROM suministros WHERE numero_suministro = $1 LIMIT 1;`,
            [suministroNormalizado]
        );

        if (suministroExistente.rowCount > 0) {
            await cliente.query('ROLLBACK');
            return res.status(409).json({
                estado: "error",
                mensaje: "El número de suministro ya se encuentra registrado."
            });
        }

        const claveHash = generarClaveHash(password);

        const usuarioResultado = await cliente.query(
            `INSERT INTO usuarios (correo, clave_hash)
             VALUES ($1, $2)
             RETURNING id_usuario, correo;`,
            [correoNormalizado, claveHash]
        );

        const idUsuario = usuarioResultado.rows[0].id_usuario;

        await cliente.query(
            `INSERT INTO suministros (numero_suministro, id_usuario)
             VALUES ($1, $2);`,
            [suministroNormalizado, idUsuario]
        );

        await cliente.query('COMMIT');

        return res.status(201).json({
            estado: "ok",
            mensaje: "Cuenta creada correctamente.",
            usuario: {
                id_usuario: idUsuario,
                correo: correoNormalizado,
                numero_suministro: suministroNormalizado
            }
        });

    } catch (error) {
        if (cliente) {
            try { await cliente.query('ROLLBACK'); } catch (e) {}
        }

        if (error && error.code === '23505') {
            const restriccion = String(error.constraint || '');
            const esCorreo = restriccion.indexOf('usuarios') > -1 || /correo/i.test(restriccion);

            return res.status(409).json({
                estado: "error",
                mensaje: esCorreo
                    ? "El correo ya se encuentra registrado."
                    : "El número de suministro ya se encuentra registrado."
            });
        }

        console.error(error);

        return res.status(500).json({
            estado: "error",
            mensaje: "Error interno del servidor."
        });
    } finally {
        if (cliente) {
            try { cliente.release(); } catch (e) {}
        }
    }
});


// ==========================================
// REGISTRAR INCIDENCIA (foto opcional en BYTEA)
// NOTA: sin sesión/token de servidor por diseño actual;
// el endpoint identifica por suministro, igual que el resto.
// ==========================================

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
// ==========================================

app.post("/api/incidencias", async (req, res) => {
    try {
        const { numero_suministro, tipo, descripcion, referencia, latitud, longitud, foto_base64, foto_mime } = req.body || {};

        if (!/^\d{7,9}$/.test(String(numero_suministro || '').trim())) {
            return res.status(400).json({
                estado: "error",
                mensaje: "Número de suministro inválido."
            });
        }

        if (!String(tipo || '').trim()) {
            return res.status(400).json({
                estado: "error",
                mensaje: "El tipo de incidencia es obligatorio."
            });
        }

        if (String(descripcion || '').trim().length < 10) {
            return res.status(400).json({
                estado: "error",
                mensaje: "La descripción debe tener al menos 10 caracteres."
            });
        }

        if (!String(referencia || '').trim()) {
            return res.status(400).json({
                estado: "error",
                mensaje: "La referencia es obligatoria."
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

        const suministroResultado = await pool.query(
            `SELECT id_suministro
             FROM suministros
             WHERE numero_suministro = $1
             LIMIT 1;`,
            [String(numero_suministro).trim()]
        );

        if (suministroResultado.rowCount === 0) {
            return res.status(404).json({
                estado: "error",
                mensaje: "Suministro no encontrado."
            });
        }

        const idSuministro = suministroResultado.rows[0].id_suministro;

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

        return res.status(201).json({
            estado: "ok",
            incidencia: insertResultado.rows[0]
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            estado: "error",
            mensaje: "Error interno del servidor."
        });
    }
});


// ==========================================
// REGISTRAR PAGO REAL EN POSTGRESQL
// Movimiento bancario SIMULADO con fines académicos.
// Todo lo demás es real: monto desde DB, código en
// backend, fecha, método, cambio a Pagado, historial.
// ==========================================

app.post("/api/pagos", async (req, res) => {
    let cliente = null;

    try {
        const { numero_suministro, id_recibo, metodo } = req.body || {};

        if (!/^\d{7,9}$/.test(String(numero_suministro || '').trim())) {
            return res.status(400).json({
                estado: "error",
                mensaje: "Número de suministro inválido."
            });
        }

        const idRecibo = Number(id_recibo);

        if (!Number.isInteger(idRecibo) || idRecibo <= 0) {
            return res.status(400).json({
                estado: "error",
                mensaje: "Identificador de recibo inválido."
            });
        }

        if (!String(metodo || '').trim()) {
            return res.status(400).json({
                estado: "error",
                mensaje: "El método de pago es obligatorio."
            });
        }

        cliente = await pool.connect();

        await cliente.query('BEGIN');

        const reciboResultado = await cliente.query(
            `SELECT
               r.id_recibo,
               r.monto,
               r.estado,
               r.periodo,
               s.numero_suministro
             FROM recibos r
             JOIN suministros s
               ON s.id_suministro = r.id_suministro
             WHERE r.id_recibo = $1
               AND s.numero_suministro = $2
             FOR UPDATE;`,
            [idRecibo, String(numero_suministro).trim()]
        );

        if (reciboResultado.rowCount === 0) {
            await cliente.query('ROLLBACK');
            return res.status(404).json({
                estado: "error",
                mensaje: "Recibo no encontrado."
            });
        }

        const recibo = reciboResultado.rows[0];

        if (recibo.estado === 'Pagado') {
            await cliente.query('ROLLBACK');
            return res.status(409).json({
                estado: "error",
                mensaje: "El recibo ya se encuentra pagado."
            });
        }

        // El monto se obtiene de PostgreSQL, nunca del frontend.
        // El código se deriva del id_pago (PK) para garantizar
        // unicidad con formato HM-PAG-2026-000002. No se genera
        // en el navegador ni se acepta desde el cliente.
        const pagoProvisional = await cliente.query(
            `INSERT INTO pagos (
               id_recibo,
               monto,
               metodo,
               codigo_operacion
             )
             VALUES ($1,$2,$3,$4)
             RETURNING
               id_pago,
               id_recibo,
               monto,
               metodo,
               codigo_operacion,
               fecha_pago;`,
            [
                idRecibo,
                recibo.monto,
                String(metodo).trim(),
                'PENDIENTE'
            ]
        );

        const idPago = pagoProvisional.rows[0].id_pago;
        const anioActual = new Date().getFullYear();
        const codigoOperacion = 'HM-PAG-' + anioActual + '-' + String(idPago).padStart(6, '0');

        const pagoResultado = await cliente.query(
            `UPDATE pagos
             SET codigo_operacion = $1
             WHERE id_pago = $2
             RETURNING
               id_pago,
               id_recibo,
               monto,
               metodo,
               codigo_operacion,
               fecha_pago;`,
            [codigoOperacion, idPago]
        );

        await cliente.query(
            `UPDATE recibos
             SET estado = 'Pagado'
             WHERE id_recibo = $1;`,
            [idRecibo]
        );

        await cliente.query('COMMIT');

        return res.status(201).json({
            estado: "ok",
            pago: pagoResultado.rows[0],
            recibo: {
                id_recibo: idRecibo,
                estado: "Pagado"
            }
        });

    } catch (error) {
        if (cliente) {
            try { await cliente.query('ROLLBACK'); } catch (e) {}
        }
        console.error(error);

        return res.status(500).json({
            estado: "error",
            mensaje: "Error interno del servidor."
        });
    } finally {
        if (cliente) {
            try { cliente.release(); } catch (e) {}
        }
    }
});


// ==========================================
// CONSULTAR PAGOS POR SUMINISTRO
// ==========================================

app.get("/api/pagos/:suministro", async (req, res) => {
    try {
        const numeroSuministro = req.params.suministro;

        const consulta = `
            SELECT
              p.id_pago,
              p.id_recibo,
              p.monto,
              p.metodo,
              p.codigo_operacion,
              p.fecha_pago,
              r.periodo
            FROM pagos p
            JOIN recibos r
              ON r.id_recibo = p.id_recibo
            JOIN suministros s
              ON s.id_suministro = r.id_suministro
            WHERE s.numero_suministro = $1
            ORDER BY p.fecha_pago DESC;
        `;

        const resultado = await pool.query(
            consulta,
            [numeroSuministro]
        );

        res.json({
            suministro: numeroSuministro,
            cantidad: resultado.rowCount,
            pagos: resultado.rows
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            estado: "error",
            mensaje: "Error interno del servidor."
        });
    }
});


// ==========================================
// CONSULTAR CORTES DE SERVICIO POR SUMINISTRO
// Avisos demostrativos del prototipo académico.
// No provienen de sistemas oficiales.
// ==========================================

app.get("/api/cortes/:suministro", async (req, res) => {
    try {
        const numeroSuministro = String(req.params.suministro || '').trim();

        if (!/^\d{7,9}$/.test(numeroSuministro)) {
            return res.status(400).json({
                estado: "error",
                mensaje: "Número de suministro inválido."
            });
        }

        const consulta = `
            SELECT
              c.id_corte,
              c.distrito,
              c.zona,
              c.motivo,
              c.fecha,
              c.hora,
              c.estado
            FROM cortes_suministros cs
            JOIN cortes_servicio c
              ON c.id_corte = cs.id_corte
            JOIN suministros s
              ON s.id_suministro = cs.id_suministro
            WHERE s.numero_suministro = $1
            ORDER BY c.fecha DESC, c.id_corte DESC;
        `;

        const resultado = await pool.query(
            consulta,
            [numeroSuministro]
        );

        res.json({
            suministro: numeroSuministro,
            cantidad: resultado.rowCount,
            cortes: resultado.rows
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            estado: "error",
            mensaje: "Error interno del servidor."
        });
    }
});


// ==========================================
// INICIO DEL SERVIDOR
// ==========================================

app.listen(PORT, "0.0.0.0", () => {
    console.log(
        `API Hidro Mejora ejecutándose en el puerto ${PORT}`
    );
});
