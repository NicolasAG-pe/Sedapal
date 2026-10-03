const express = require("express");
const cors = require("cors");
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Pool } = require("pg");

const app = express();
const PORT = 3000;

app.use(cors());
// Límite acotado: fotografías de incidencias hasta 2 MB + overhead base64.
app.use(express.json({ limit: '3mb' }));

function obtenerSecretoAuth(){
    return process.env.AUTH_TOKEN_SECRET || '';
}

if (!obtenerSecretoAuth()) {
    console.error('Falta AUTH_TOKEN_SECRET: las rutas protegidas responderán 401.');
}

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
// AUTENTICACIÓN POR TOKEN (JWT 8h, rol en token)
// ==========================================

function generarTokenAcceso(datos){
    return jwt.sign(
        {
            id_usuario: datos.id_usuario,
            id_suministro: datos.id_suministro,
            numero_suministro: datos.numero_suministro,
            rol: datos.rol
        },
        obtenerSecretoAuth(),
        { expiresIn: '8h' }
    );
}

function requiereAuth(req, res, next){
    const autorizacion = req.headers.authorization || '';
    const partes = autorizacion.split(' ');

    if (partes.length !== 2 || partes[0] !== 'Bearer' || !partes[1]) {
        return res.status(401).json({
            estado: "error",
            mensaje: "Autenticación requerida."
        });
    }

    try {
        req.user = jwt.verify(partes[1], obtenerSecretoAuth());
        return next();
    } catch (e) {
        return res.status(401).json({
            estado: "error",
            mensaje: "Autenticación requerida."
        });
    }
}

function requiereAdmin(req, res, next){
    requiereAuth(req, res, () => {
        if (!req.user || req.user.rol !== 'admin') {
            return res.status(403).json({
                estado: "error",
                mensaje: "Acceso denegado."
            });
        }

        return next();
    });
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
              u.rol,
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
            token: generarTokenAcceso(fila),
            usuario: {
                id_usuario: fila.id_usuario,
                correo: fila.correo,
                rol: fila.rol
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
// PERFIL DE USUARIO (solo datos no sensibles)
// ==========================================

app.get("/api/perfil/:suministro", async (req, res) => {
    try {
        const numeroSuministro = String(req.params.suministro || '').trim();

        if (!/^\d{7,9}$/.test(numeroSuministro)) {
            return res.status(400).json({
                estado: "error",
                mensaje: "Número de suministro inválido."
            });
        }

        const resultado = await pool.query(
            `SELECT
               u.correo,
               s.numero_suministro,
               u.fecha_registro
             FROM suministros s
             JOIN usuarios u ON u.id_usuario = s.id_usuario
             WHERE s.numero_suministro = $1
             LIMIT 1;`,
            [numeroSuministro]
        );

        if (resultado.rowCount === 0) {
            return res.status(404).json({
                estado: "error",
                mensaje: "Suministro no encontrado."
            });
        }

        return res.json(resultado.rows[0]);

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            estado: "error",
            mensaje: "Error interno del servidor."
        });
    }
});


// ==========================================
// CAMBIO DE CONTRASEÑA (verifica la actual)
// ==========================================

app.post("/api/auth/change-password", async (req, res) => {
    try {
        const { numero_suministro, password_actual, password_nueva, password_confirmacion } = req.body || {};

        const suministroNormalizado = String(numero_suministro || '').trim();

        if (!/^\d{7,9}$/.test(suministroNormalizado)) {
            return res.status(400).json({
                estado: "error",
                mensaje: "Número de suministro inválido."
            });
        }

        if (typeof password_actual !== 'string' || password_actual.length === 0) {
            return res.status(400).json({
                estado: "error",
                mensaje: "La contraseña actual es obligatoria."
            });
        }

        if (typeof password_nueva !== 'string' || password_nueva.length < 8) {
            return res.status(400).json({
                estado: "error",
                mensaje: "La contraseña nueva debe tener al menos 8 caracteres."
            });
        }

        if (!/[A-Za-z]/.test(password_nueva) || !/[0-9]/.test(password_nueva)) {
            return res.status(400).json({
                estado: "error",
                mensaje: "La contraseña nueva debe contener al menos una letra y un número."
            });
        }

        if (password_nueva !== password_confirmacion) {
            return res.status(400).json({
                estado: "error",
                mensaje: "La confirmación no coincide con la contraseña nueva."
            });
        }

        if (password_nueva === password_actual) {
            return res.status(400).json({
                estado: "error",
                mensaje: "La contraseña nueva no debe ser idéntica a la actual."
            });
        }

        const resultado = await pool.query(
            `SELECT
               u.id_usuario,
               u.clave_hash
             FROM suministros s
             JOIN usuarios u ON u.id_usuario = s.id_usuario
             WHERE s.numero_suministro = $1
             LIMIT 1;`,
            [suministroNormalizado]
        );

        if (resultado.rowCount === 0 || !verificarClave(password_actual, resultado.rows[0].clave_hash)) {
            return res.status(401).json({
                estado: "error",
                mensaje: "No fue posible validar las credenciales actuales."
            });
        }

        const nuevoHash = generarClaveHash(password_nueva);

        await pool.query(
            `UPDATE usuarios
             SET clave_hash = $1
             WHERE id_usuario = $2;`,
            [nuevoHash, resultado.rows[0].id_usuario]
        );

        return res.json({
            estado: "ok",
            mensaje: "Contraseña actualizada correctamente."
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
// CATÁLOGO GENERAL DE CORTES ACTIVOS/PROGRAMADOS
// Avisos demostrativos del prototipo académico.
// Misma lógica temporal que por suministro.
// Los finalizados se guardan pero no se listan.
// ==========================================

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
        console.error(error);

        return res.status(500).json({
            estado: "error",
            mensaje: "Error interno del servidor."
        });
    }
});


// ==========================================
// CONSULTAR CORTES DE SERVICIO POR SUMINISTRO
// Avisos demostrativos del prototipo académico.
// No provienen de sistemas oficiales.
// Fuente: zona del suministro + avisos generales.
// El estado se calcula por tiempo (CASE), sin
// actualizar filas. Los finalizados se guardan
// pero no aparecen en la vista activa.
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
        console.error(error);

        return res.status(500).json({
            estado: "error",
            mensaje: "Error interno del servidor."
        });
    }
});


// ==========================================
// ADMINISTRACIÓN DE CORTES (solo admin)
// ==========================================

function validarCorteAdmin(body){
    const alcance = String((body || {}).alcance || '').trim();
    const motivo = String((body || {}).motivo || '').trim();
    const inicio = new Date((body || {}).fecha_inicio);
    const fin = new Date((body || {}).fecha_fin);

    if (alcance !== 'Zona' && alcance !== 'General') {
        return { error: 'Alcance inválido. Debe ser Zona o General.' };
    }

    if (!motivo || motivo.length > 200) {
        return { error: 'El motivo es obligatorio (máximo 200 caracteres).' };
    }

    if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) {
        return { error: 'Fechas de inicio y fin inválidas.' };
    }

    if (fin <= inicio) {
        return { error: 'La fecha de fin debe ser posterior a la fecha de inicio.' };
    }

    let distrito = null;
    let zona = null;

    if (alcance === 'Zona') {
        distrito = String((body || {}).distrito || '').trim();
        zona = String((body || {}).zona || '').trim();

        if (!distrito || !zona) {
            return { error: 'Distrito y zona son obligatorios para alcance Zona.' };
        }

        if (distrito.length > 80 || zona.length > 120) {
            return { error: 'Distrito o zona demasiado largos.' };
        }
    }

    return { alcance, motivo, distrito, zona, inicio, fin };
}

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
        console.error(error);

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

        return res.status(201).json({
            estado: "ok",
            corte: filaCorteAdmin(insertado.rows[0])
        });

    } catch (error) {
        console.error(error);

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

        return res.json({
            estado: "ok",
            corte: filaCorteAdmin(resultado.rows[0])
        });

    } catch (error) {
        console.error(error);

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

        return res.json({
            estado: "ok",
            corte: filaCorteAdmin(resultado.rows[0])
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
// INICIO DEL SERVIDOR
// ==========================================

app.listen(PORT, "0.0.0.0", () => {
    console.log(
        `API Hidro Mejora ejecutándose en el puerto ${PORT}`
    );
});
