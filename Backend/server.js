const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Pool } = require("pg");

const app = express();
const PORT = 3000;

// Confiar solo en el primer proxy (arquitectura: Internet -> Nginx -> Backend).
// Necesario para que express-rate-limit vea la IP real vía X-Forwarded-For.
// No usar 'true' (confiaría en cadena completa externa).
app.set('trust proxy', 1);

// Cabecera X-Powered-By desactivada explícitamente (verificación: curl -I).
app.disable('x-powered-by');

// Helmet: headers de seguridad. CSP desactivada por ahora porque el
// frontend actual usa scripts inline (imponerla rompería la web sin
// refactorizar). Se protege el resto (HSTS, nosniff, frameguard, etc.).
app.use(helmet({ contentSecurityPolicy: false }));

function esProduccion(){
    return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

// CORS restringido por env (nunca '*' para APIs privadas).
// CORS_ALLOWED_ORIGINS="http://localhost:8080,https://DOMINIO"
// En desarrollo sin variable: se permite http://localhost:8080 por comodidad.
// En producción sin variable: solo same-origin (sin cabecera CORS).
function obtenerOrigenesPermitidos(){
    const crudo = String(process.env.CORS_ALLOWED_ORIGINS || '').trim();
    if (crudo) {
        return crudo.split(',').map(s => s.trim()).filter(Boolean);
    }
    return esProduccion() ? [] : ['http://localhost:8080'];
}

const ORIGENES_PERMITIDOS = obtenerOrigenesPermitidos();

app.use(cors({
    origin: function (origen, cb) {
        // Peticiones same-origin / curl sin Origin: permitir (Nginx proxea /api/).
        if (!origen) return cb(null, true);
        if (ORIGENES_PERMITIDOS.indexOf(origen) !== -1) return cb(null, true);
        return cb(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600
}));
// Límite acotado: fotografías de incidencias hasta 2 MB + overhead base64.
app.use(express.json({ limit: '3mb' }));

// Rate limits (por IP, detrás de Nginx gracias a trust proxy = 1).
// Mensajes genéricos para no revelar política exacta al atacante.
function limitadorGenerico(maxPeticiones, ventanaMinutos){
    return rateLimit({
        windowMs: ventanaMinutos * 60 * 1000,
        max: maxPeticiones,
        standardHeaders: true,
        legacyHeaders: false,
        message: { estado: "error", mensaje: "Demasiadas solicitudes. Intenta nuevamente más tarde." }
    });
}

// Login/registro/cambio-clave: estrictos pero sin bloquear pruebas normales.
// LOGIN demostrativo: 20 FALLIDOS por 15 min por IP; los exitosos no consumen
// contador (skipSuccessfulRequests) para varias personas tras la misma NAT.
const limiteLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { estado: "error", mensaje: "Demasiadas solicitudes. Intenta nuevamente más tarde." }
});
const limiteRegistro = limitadorGenerico(10, 15);
const limiteCambioClave = limitadorGenerico(10, 15);
// Operaciones sensibles de usuario: más amplio (uso legítimo frecuente).
const limiteOperacionesSensibles = limitadorGenerico(60, 15);

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
            mensaje: "Servicio de Hidro Mejora operativo",
            fecha: resultado.rows[0].fecha_servidor
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            estado: "error",
            mensaje: "No se pudo conectar con el servicio"
        });
    }
});


// ==========================================
// CONSULTAR RECIBOS POR SUMINISTRO
// LEGACY: candidata a eliminar. Usar GET /api/me/recibos (JWT).
// Ahora exige token y solo permite el suministro propio
// (admin puede consultar cualquiera).
// ==========================================

app.get("/api/recibos/:suministro", requiereAuth, async (req, res) => {

    try {

        const numeroSuministro = req.params.suministro;

        if (!puedeVerSuministro(req, numeroSuministro)) {
            return res.status(403).json({ estado: "error", mensaje: "Acceso denegado." });
        }

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
// LEGACY: candidata a eliminar. Usar GET /api/me/incidencias (JWT).
// Exige token y aislamiento por suministro.
// ==========================================

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

        console.error(error);

        res.status(500).json({
            mensaje: "Error al consultar las incidencias"
        });
    }

});


// ==========================================
// FOTOGRAFÍA DE INCIDENCIA (bytes reales)
// Requiere token y solo la incidencia propia
// (404 para no revelar recursos ajenos).
// ==========================================

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

// ==========================================
// AUTENTICACIÓN POR TOKEN (JWT 8h) + verificación en DB
// HARDENING: no se confía 8h en rol/activo del token.
// En cada petición se consulta usuarios (sin clave_hash) para
// obtener rol actual y activo. Si no existe o activo=false -> 403.
// req.user se reconstruye desde DB (nunca hashes).
// ==========================================

async function requiereAuth(req, res, next){
    const autorizacion = req.headers.authorization || '';
    const partes = autorizacion.split(' ');

    if (partes.length !== 2 || partes[0] !== 'Bearer' || !partes[1]) {
        return res.status(401).json({
            estado: "error",
            mensaje: "Autenticación requerida."
        });
    }

    let datosToken;
    try {
        datosToken = jwt.verify(partes[1], obtenerSecretoAuth());
    } catch (e) {
        return res.status(401).json({
            estado: "error",
            mensaje: "Autenticación requerida."
        });
    }

    const idUsuarioToken = Number(datosToken.id_usuario);
    if (!Number.isInteger(idUsuarioToken) || idUsuarioToken <= 0) {
        return res.status(401).json({
            estado: "error",
            mensaje: "Autenticación requerida."
        });
    }

    try {
        // Sin clave_hash, sin foto, sin secretos. Solo estado y rol actual.
        const verif = await pool.query(
            `SELECT u.id_usuario, u.rol, u.activo,
                    s.id_suministro, s.numero_suministro
             FROM usuarios u
             LEFT JOIN suministros s ON s.id_usuario = u.id_usuario
             WHERE u.id_usuario = $1
             LIMIT 1;`,
            [idUsuarioToken]
        );

        if (verif.rowCount === 0) {
            return res.status(403).json({
                estado: "error",
                mensaje: "Acceso denegado."
            });
        }

        const fila = verif.rows[0];

        if (fila.activo === false) {
            return res.status(403).json({
                estado: "error",
                mensaje: "Acceso denegado."
            });
        }

        req.user = {
            id_usuario: fila.id_usuario,
            id_suministro: fila.id_suministro,
            numero_suministro: fila.numero_suministro,
            rol: fila.rol
        };

        return next();
    } catch (e) {
        // En producción, mensaje genérico; detalle solo en log servidor.
        console.error(esProduccion() ? 'Error de autenticación.' : e);
        return res.status(500).json({
            estado: "error",
            mensaje: "Error interno del servidor."
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

app.post("/api/auth/login", limiteLogin, async (req, res) => {
    try {
        const { numero_suministro, password } = req.body || {};

        if (!/^\d{9}$/.test(String(numero_suministro || ''))) {
            return res.status(400).json({
                estado: "error",
                mensaje: "El número de suministro debe contener 9 dígitos."
            });
        }

        if (typeof password !== 'string' || password.length < 4 || password.length > 128) {
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
              u.activo,
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

        if (fila.activo === false) {
            return res.status(403).json({
                estado: "error",
                mensaje: "Esta cuenta no se encuentra habilitada."
            });
        }

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

app.post("/api/auth/register", limiteRegistro, async (req, res) => {
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

        if (!/^\d{9}$/.test(suministroNormalizado)) {
            return res.status(400).json({
                estado: "error",
                mensaje: "El número de suministro debe contener 9 dígitos."
            });
        }

        if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
            return res.status(400).json({
                estado: "error",
                mensaje: "La contraseña debe tener entre 8 y 128 caracteres."
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
// LEGACY: candidata a eliminar. Usar GET /api/me/perfil (JWT).
// Exige token y aislamiento por suministro.
// ==========================================

app.get("/api/perfil/:suministro", requiereAuth, async (req, res) => {
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
// Con JWT: el suministro se obtiene del token, nunca del body.
// ==========================================

app.post("/api/auth/change-password", limiteCambioClave, requiereAuth, async (req, res) => {
    try {
        const { password_actual, password_nueva, password_confirmacion } = req.body || {};

        if (typeof password_actual !== 'string' || password_actual.length === 0) {
            return res.status(400).json({
                estado: "error",
                mensaje: "La contraseña actual es obligatoria."
            });
        }

        if (typeof password_nueva !== 'string' || password_nueva.length < 8 || password_nueva.length > 128) {
            return res.status(400).json({
                estado: "error",
                mensaje: "La contraseña nueva debe tener entre 8 y 128 caracteres."
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
            `SELECT id_usuario, clave_hash
             FROM usuarios
             WHERE id_usuario = $1
             LIMIT 1;`,
            [req.user.id_usuario]
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
// Requiere JWT; el suministro se obtiene del token.
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

app.post("/api/pagos", limiteOperacionesSensibles, requiereAuth, async (req, res) => {
    let cliente = null;

    try {
        // El recibo debe pertenecer al suministro del JWT (FASE 26).
        // No se acepta numero_suministro del body como autoridad.
        const { id_recibo, metodo } = req.body || {};

        const idRecibo = Number(id_recibo);

        if (!Number.isInteger(idRecibo) || idRecibo <= 0) {
            return res.status(400).json({
                estado: "error",
                mensaje: "Identificador de recibo inválido."
            });
        }

        if (!String(metodo || '').trim() || String(metodo || '').trim().length > 30) {
            return res.status(400).json({
                estado: "error",
                mensaje: "El método de pago es obligatorio (máximo 30 caracteres)."
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
               AND s.id_suministro = $2
             FOR UPDATE;`,
            [idRecibo, req.user.id_suministro]
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

        if (recibo.estado === 'Anulado') {
            await cliente.query('ROLLBACK');
            return res.status(409).json({
                estado: "error",
                mensaje: "No se puede pagar un recibo anulado."
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
// LEGACY: candidata a eliminar. Usar GET /api/me/pagos (JWT).
// Exige token y aislamiento por suministro.
// ==========================================

app.get("/api/pagos/:suministro", requiereAuth, async (req, res) => {
    try {
        const numeroSuministro = req.params.suministro;

        if (!puedeVerSuministro(req, numeroSuministro)) {
            return res.status(403).json({ estado: "error", mensaje: "Acceso denegado." });
        }

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
// LEGACY: candidata a eliminar. Usar GET /api/me/cortes (JWT).
// HARDENING: ahora exige requiereAuth + puedeVerSuministro para
// evitar enumeración libre de suministros. Admin autorizado.
// Avisos demostrativos del prototipo académico.
// No provienen de sistemas oficiales.
// Fuente: zona del suministro + avisos generales.
// El estado se calcula por tiempo (CASE), sin
// actualizar filas. Los finalizados se guardan
// pero no aparecen en la vista activa.
// ==========================================

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
// ADMINISTRACIÓN DE INCIDENCIAS (solo admin)
// Sin BYTEA/base64 en JSON. Sin DELETE.
// ==========================================

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
        console.error(error);

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
        console.error(error);

        return res.status(500).json({
            estado: "error",
            mensaje: "Error interno del servidor."
        });
    }
});

app.patch("/api/admin/incidencias/:id/estado", requiereAdmin, async (req, res) => {
    try {
        const idIncidencia = Number(req.params.id);
        const estado = String((req.body || {}).estado || '').trim();

        if (!Number.isInteger(idIncidencia) || idIncidencia <= 0) {
            return res.status(404).json({
                estado: "error",
                mensaje: "Incidencia no encontrada."
            });
        }

        if (INCIDENCIA_ESTADOS.indexOf(estado) === -1) {
            return res.status(400).json({
                estado: "error",
                mensaje: "Estado inválido. Debe ser Registrada, En revisión o Resuelta."
            });
        }

        const resultado = await pool.query(
            `UPDATE incidencias
             SET estado = $1
             WHERE id_incidencia = $2
             RETURNING
               id_incidencia,
               id_suministro,
               tipo,
               descripcion,
               referencia,
               latitud,
               longitud,
               fecha_registro,
               estado,
               (foto IS NOT NULL) AS tiene_foto;`,
            [estado, idIncidencia]
        );

        if (resultado.rowCount === 0) {
            return res.status(404).json({
                estado: "error",
                mensaje: "Incidencia no encontrada."
            });
        }

        // FASE 19: cambio de estado de incidencia => notificación al suministro.
        try {
            await crearNotificacion({
                id_suministro: resultado.rows[0].id_suministro,
                alcance: 'Usuario',
                titulo: 'Incidencia #' + resultado.rows[0].id_incidencia + ' cambió a ' + estado,
                mensaje: 'Tu reporte "' + resultado.rows[0].tipo + '" ahora está: ' + estado + '.',
                tipo: 'incidencia'
            });
        } catch (e) {}

        return res.json({
            estado: "ok",
            incidencia: resultado.rows[0]
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
// ADMINISTRACIÓN DE RECIBOS (solo admin)
// Pagado solo proviene del flujo de pagos.
// Sin DELETE físico: anulación por estado.
// ==========================================

function validarReciboAdmin(body){
    const numero = String((body || {}).numero_suministro || '').trim();
    const periodo = String((body || {}).periodo || '').trim();
    const emision = new Date((body || {}).fecha_emision);
    const vencimiento = new Date((body || {}).fecha_vencimiento);
    const monto = Number((body || {}).monto);
    const consumo = Number((body || {}).consumo_m3);

    if (!/^\d{9}$/.test(numero)) {
        return { error: 'El número de suministro debe contener 9 dígitos.' };
    }

    if (!periodo || periodo.length > 20) {
        return { error: 'El periodo es obligatorio (máximo 20 caracteres).' };
    }

    if (isNaN(emision.getTime()) || isNaN(vencimiento.getTime())) {
        return { error: 'Fechas de emisión y vencimiento inválidas.' };
    }

    if (vencimiento < emision) {
        return { error: 'La fecha de vencimiento debe ser igual o posterior a la emisión.' };
    }

    if (!Number.isFinite(monto) || monto <= 0 || monto > 99999999.99) {
        return { error: 'Ingresa un monto válido.' };
    }

    if (!Number.isFinite(consumo) || consumo < 0 || consumo > 99999999.99) {
        return { error: 'Ingresa un consumo válido.' };
    }

    return { numero, periodo, emision, vencimiento, monto, consumo };
}

function filaReciboAdmin(fila){
    return {
        id_recibo: fila.id_recibo,
        numero_suministro: fila.numero_suministro,
        periodo: fila.periodo,
        fecha_emision: fila.fecha_emision,
        fecha_vencimiento: fila.fecha_vencimiento,
        monto: fila.monto,
        consumo_m3: fila.consumo_m3,
        estado: fila.estado,
        tiene_pago: !!fila.tiene_pago
    };
}

app.get("/api/admin/recibos", requiereAdmin, async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT
               r.id_recibo,
               s.numero_suministro,
               r.periodo,
               r.fecha_emision,
               r.fecha_vencimiento,
               r.monto,
               r.consumo_m3,
               r.estado,
               EXISTS(SELECT 1 FROM pagos p WHERE p.id_recibo = r.id_recibo) AS tiene_pago
             FROM recibos r
             JOIN suministros s ON s.id_suministro = r.id_suministro
             ORDER BY r.fecha_emision DESC, r.id_recibo DESC;`
        );

        res.json({
            cantidad: resultado.rowCount,
            recibos: resultado.rows.map(filaReciboAdmin)
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            estado: "error",
            mensaje: "Error interno del servidor."
        });
    }
});

app.post("/api/admin/recibos", requiereAdmin, async (req, res) => {
    try {
        const validado = validarReciboAdmin(req.body);

        if (validado.error) {
            return res.status(400).json({
                estado: "error",
                mensaje: validado.error
            });
        }

        const suministro = await pool.query(
            `SELECT id_suministro FROM suministros WHERE numero_suministro = $1 LIMIT 1;`,
            [validado.numero]
        );

        if (suministro.rowCount === 0) {
            return res.status(404).json({
                estado: "error",
                mensaje: "Suministro no encontrado."
            });
        }

        const duplicado = await pool.query(
            `SELECT r.id_recibo
             FROM recibos r
             JOIN suministros s ON s.id_suministro = r.id_suministro
             WHERE s.numero_suministro = $1 AND r.periodo = $2
             LIMIT 1;`,
            [validado.numero, validado.periodo]
        );

        if (duplicado.rowCount > 0) {
            return res.status(409).json({
                estado: "error",
                mensaje: "Ya existe un recibo para este suministro y periodo."
            });
        }

        const insertado = await pool.query(
            `INSERT INTO recibos
               (id_suministro, periodo, fecha_emision, fecha_vencimiento, monto, consumo_m3, estado)
             VALUES ($1, $2, $3, $4, $5, $6, 'Emitido')
             RETURNING
               id_recibo, $7 AS numero_suministro, periodo,
               fecha_emision, fecha_vencimiento, monto, consumo_m3, estado,
               FALSE AS tiene_pago;`,
            [suministro.rows[0].id_suministro, validado.periodo, validado.emision,
             validado.vencimiento, validado.monto, validado.consumo, validado.numero]
        );

        // FASE 19: nuevo recibo => notificación al suministro.
        try {
            await crearNotificacion({
                id_suministro: suministro.rows[0].id_suministro,
                alcance: 'Usuario',
                titulo: 'Nuevo recibo disponible: ' + validado.periodo,
                mensaje: 'Se publicó tu recibo ' + validado.periodo + ' por S/ ' + Number(validado.monto).toFixed(2) + '.',
                tipo: 'recibo'
            });
        } catch (e) {}

        return res.status(201).json({
            estado: "ok",
            recibo: filaReciboAdmin(insertado.rows[0])
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            estado: "error",
            mensaje: "Error interno del servidor."
        });
    }
});

app.patch("/api/admin/recibos/:id", requiereAdmin, async (req, res) => {
    try {
        const idRecibo = Number(req.params.id);

        if (!Number.isInteger(idRecibo) || idRecibo <= 0) {
            return res.status(404).json({
                estado: "error",
                mensaje: "Recibo no encontrado."
            });
        }

        const actual = await pool.query(
            `SELECT r.id_recibo, s.numero_suministro,
                    EXISTS(SELECT 1 FROM pagos p WHERE p.id_recibo = r.id_recibo) AS tiene_pago
             FROM recibos r
             JOIN suministros s ON s.id_suministro = r.id_suministro
             WHERE r.id_recibo = $1
             LIMIT 1;`,
            [idRecibo]
        );

        if (actual.rowCount === 0) {
            return res.status(404).json({
                estado: "error",
                mensaje: "Recibo no encontrado."
            });
        }

        if (actual.rows[0].tiene_pago) {
            return res.status(409).json({
                estado: "error",
                mensaje: "No se puede modificar un recibo que ya tiene un pago registrado."
            });
        }

        const cuerpo = Object.assign({}, req.body, { numero_suministro: actual.rows[0].numero_suministro });
        const validado = validarReciboAdmin(cuerpo);

        if (validado.error) {
            return res.status(400).json({
                estado: "error",
                mensaje: validado.error
            });
        }

        const duplicado = await pool.query(
            `SELECT r.id_recibo
             FROM recibos r
             JOIN suministros s ON s.id_suministro = r.id_suministro
             WHERE s.numero_suministro = $1 AND r.periodo = $2 AND r.id_recibo <> $3
             LIMIT 1;`,
            [validado.numero, validado.periodo, idRecibo]
        );

        if (duplicado.rowCount > 0) {
            return res.status(409).json({
                estado: "error",
                mensaje: "Ya existe un recibo para este suministro y periodo."
            });
        }

        const resultado = await pool.query(
            `UPDATE recibos
             SET periodo = $1, fecha_emision = $2, fecha_vencimiento = $3,
                 monto = $4, consumo_m3 = $5
             WHERE id_recibo = $6
             RETURNING
               id_recibo, $7 AS numero_suministro, periodo,
               fecha_emision, fecha_vencimiento, monto, consumo_m3, estado,
               FALSE AS tiene_pago;`,
            [validado.periodo, validado.emision, validado.vencimiento,
             validado.monto, validado.consumo, idRecibo, validado.numero]
        );

        return res.json({
            estado: "ok",
            recibo: filaReciboAdmin(resultado.rows[0])
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            estado: "error",
            mensaje: "Error interno del servidor."
        });
    }
});

app.patch("/api/admin/recibos/:id/anular", requiereAdmin, async (req, res) => {
    try {
        const idRecibo = Number(req.params.id);

        if (!Number.isInteger(idRecibo) || idRecibo <= 0) {
            return res.status(404).json({
                estado: "error",
                mensaje: "Recibo no encontrado."
            });
        }

        const actual = await pool.query(
            `SELECT EXISTS(SELECT 1 FROM pagos p WHERE p.id_recibo = $1) AS tiene_pago,
                    EXISTS(SELECT 1 FROM recibos WHERE id_recibo = $1) AS existe;`,
            [idRecibo]
        );

        if (!actual.rows[0].existe) {
            return res.status(404).json({
                estado: "error",
                mensaje: "Recibo no encontrado."
            });
        }

        if (actual.rows[0].tiene_pago) {
            return res.status(409).json({
                estado: "error",
                mensaje: "No se puede anular un recibo que ya tiene un pago registrado."
            });
        }

        const resultado = await pool.query(
            `UPDATE recibos
             SET estado = 'Anulado'
             WHERE id_recibo = $1;`,
            [idRecibo]
        );

        if (resultado.rowCount === 0) {
            return res.status(404).json({
                estado: "error",
                mensaje: "Recibo no encontrado."
            });
        }

        const actualizado = await pool.query(
            `SELECT
               r.id_recibo, s.numero_suministro, r.periodo,
               r.fecha_emision, r.fecha_vencimiento, r.monto,
               r.consumo_m3, r.estado,
               FALSE AS tiene_pago
             FROM recibos r
             JOIN suministros s ON s.id_suministro = r.id_suministro
             WHERE r.id_recibo = $1
             LIMIT 1;`,
            [idRecibo]
        );

        return res.json({
            estado: "ok",
            recibo: filaReciboAdmin(actualizado.rows[0])
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
// HELPERS COMPARTIDOS (admin + notificaciones)
// ==========================================

function puedeVerSuministro(req, numeroSuministro){
    if (!req.user) return false;
    if (req.user.rol === 'admin') return true;
    return String(req.user.numero_suministro || '') === String(numeroSuministro || '');
}

async function crearNotificacion(datos){
    try {
        const alcance = String((datos || {}).alcance || 'Usuario');
        const titulo = String((datos || {}).titulo || '').trim().slice(0, 150);
        const mensaje = String((datos || {}).mensaje || '').trim();
        const tipo = String((datos || {}).tipo || 'general').trim().slice(0, 40) || 'general';
        let idSuministro = (datos || {}).id_suministro;
        if (idSuministro !== null && idSuministro !== undefined && idSuministro !== '') {
            idSuministro = Number(idSuministro);
            if (!Number.isInteger(idSuministro) || idSuministro <= 0) idSuministro = null;
        } else {
            idSuministro = null;
        }
        if (alcance !== 'Usuario' && alcance !== 'General') return null;
        if (!titulo || !mensaje) return null;
        if (alcance === 'Usuario' && !idSuministro) return null;
        if (alcance === 'General') idSuministro = null;
        const r = await pool.query(
            `INSERT INTO notificaciones (id_suministro, alcance, titulo, mensaje, tipo)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id_notificacion;`,
            [idSuministro, alcance, titulo, mensaje, tipo]
        );
        return r.rows[0] ? r.rows[0].id_notificacion : null;
    } catch (e) {
        console.error('No se pudo crear la notificación.', e);
        return null;
    }
}


// ==========================================
// ADMIN: USUARIOS Y SUMINISTROS
// Sin clave_hash, sin fotos, sin secretos.
// ==========================================

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
        console.error(error);
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
                        (foto IS NOT NULL) AS tiene_foto
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
        console.error(error);
        return res.status(500).json({ estado: "error", mensaje: "Error interno del servidor." });
    }
});

app.patch("/api/admin/usuarios/:id/estado", requiereAdmin, async (req, res) => {
    try {
        const idUsuario = Number(req.params.id);
        const activo = (req.body || {}).activo;
        if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
            return res.status(404).json({ estado: "error", mensaje: "Usuario no encontrado." });
        }
        if (typeof activo !== 'boolean') {
            return res.status(400).json({ estado: "error", mensaje: "El campo activo debe ser true o false." });
        }
        if (req.user && Number(req.user.id_usuario) === idUsuario) {
            return res.status(409).json({ estado: "error", mensaje: "No puedes desactivar tu propia cuenta administrativa." });
        }
        const resultado = await pool.query(
            `UPDATE usuarios SET activo = $1 WHERE id_usuario = $2
             RETURNING id_usuario, correo, rol, fecha_registro, activo;`,
            [activo, idUsuario]
        );
        if (resultado.rowCount === 0) {
            return res.status(404).json({ estado: "error", mensaje: "Usuario no encontrado." });
        }
        return res.json({ estado: "ok", usuario: resultado.rows[0] });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ estado: "error", mensaje: "Error interno del servidor." });
    }
});

app.patch("/api/admin/suministros/:id/ubicacion", requiereAdmin, async (req, res) => {
    try {
        const idSuministro = Number(req.params.id);
        if (!Number.isInteger(idSuministro) || idSuministro <= 0) {
            return res.status(404).json({ estado: "error", mensaje: "Suministro no encontrado." });
        }
        let { distrito, zona } = req.body || {};
        const normalizar = (v, max) => {
            if (v === null || v === undefined) return null;
            const s = String(v).trim();
            if (s === '') return null;
            if (s.length > max) return { error: true };
            return s;
        };
        const dNorm = normalizar(distrito, 100);
        const zNorm = normalizar(zona, 150);
        if ((dNorm && dNorm.error) || (zNorm && zNorm.error)) {
            return res.status(400).json({ estado: "error", mensaje: "Distrito (máx. 100) o zona (máx. 150) demasiado largos." });
        }
        const resultado = await pool.query(
            `UPDATE suministros SET distrito = $1, zona = $2 WHERE id_suministro = $3
             RETURNING id_suministro, numero_suministro, distrito, zona;`,
            [dNorm, zNorm, idSuministro]
        );
        if (resultado.rowCount === 0) {
            return res.status(404).json({ estado: "error", mensaje: "Suministro no encontrado." });
        }
        // No se copian cortes: el modelo dinámico por distrito/zona refleja
        // automáticamente el cambio en la siguiente consulta/polling.
        return res.json({ estado: "ok", suministro: resultado.rows[0] });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ estado: "error", mensaje: "Error interno del servidor." });
    }
});


// ==========================================
// ADMIN: PAGOS (SOLO CONSULTA)
// Sin crear/editar/borrar. Sin marcar pagados.
// ==========================================

app.get("/api/admin/pagos", requiereAdmin, async (req, res) => {
    try {
        const { suministro, periodo, metodo } = req.query || {};
        const condiciones = [];
        const valores = [];
        // Filtros acotados: suministro admite búsqueda parcial numérica (1-9
        // dígitos; el valor almacenado siempre tiene 9), periodo parcial
        // (máx. 60) y método exacto de la lista (máx. 30).
        if (suministro && String(suministro).trim() !== '') {
            const fSum = String(suministro).trim();
            if (!/^\d{1,9}$/.test(fSum)) {
                return res.status(400).json({ estado: "error", mensaje: "El filtro de suministro debe contener entre 1 y 9 dígitos." });
            }
            valores.push('%' + fSum + '%');
            condiciones.push('s.numero_suministro ILIKE $' + valores.length);
        }
        if (periodo && String(periodo).trim() !== '') {
            const fPer = String(periodo).trim().slice(0, 60);
            valores.push('%' + fPer + '%');
            condiciones.push('r.periodo ILIKE $' + valores.length);
        }
        if (metodo && String(metodo).trim() !== '' && String(metodo).trim() !== 'Todos') {
            const fMet = String(metodo).trim().slice(0, 30);
            valores.push(fMet);
            condiciones.push('p.metodo ILIKE $' + valores.length);
        }
        const filtro = condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : '';
        const resultado = await pool.query(
            `SELECT
                p.id_pago,
                s.numero_suministro,
                p.id_recibo,
                r.periodo,
                p.monto,
                p.metodo,
                p.codigo_operacion,
                p.fecha_pago
              FROM pagos p
              JOIN recibos r ON r.id_recibo = p.id_recibo
              JOIN suministros s ON s.id_suministro = r.id_suministro
              ${filtro}
              ORDER BY p.fecha_pago DESC, p.id_pago DESC
              LIMIT 500;`,
            valores
        );
        return res.json({ cantidad: resultado.rowCount, pagos: resultado.rows });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ estado: "error", mensaje: "Error interno del servidor." });
    }
});


// ==========================================
// ATENCIÓN AL CLIENTE (solicitudes persistentes)
// ==========================================

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
        console.error(error);
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
        console.error(error);
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
        console.error(error);
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
        return res.json({ estado: "ok", solicitud: sol });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ estado: "error", mensaje: "Error interno del servidor." });
    }
});


// ==========================================
// NOTIFICACIONES INTERNAS (solo app)
// ==========================================

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
        console.error(error);
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
        console.error(error);
        return res.status(500).json({ estado: "error", mensaje: "Error interno del servidor." });
    }
});


// ==========================================
// ENDPOINTS PROPIOS CON JWT (/api/me/*)
// Fuente de verdad para datos privados.
// Rutas legacy /api/recibos/:suministro, /api/pagos/:suministro,
// /api/incidencias/:suministro y /api/perfil/:suministro se mantienen
// temporalmente como LEGACY candidatas a eliminar (ver comentarios).
// ==========================================

app.get("/api/me/recibos", requiereAuth, async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT r.id_recibo, r.periodo, r.fecha_emision, r.fecha_vencimiento,
                    r.monto, r.consumo_m3, r.estado
             FROM recibos r
             WHERE r.id_suministro = $1
             ORDER BY r.fecha_emision DESC;`,
            [req.user.id_suministro]
        );
        return res.json({ suministro: req.user.numero_suministro, cantidad: resultado.rowCount, recibos: resultado.rows });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ mensaje: "Error al consultar los recibos" });
    }
});

app.get("/api/me/pagos", requiereAuth, async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT p.id_pago, p.id_recibo, p.monto, p.metodo, p.codigo_operacion, p.fecha_pago, r.periodo
             FROM pagos p
             JOIN recibos r ON r.id_recibo = p.id_recibo
             WHERE r.id_suministro = $1
             ORDER BY p.fecha_pago DESC;`,
            [req.user.id_suministro]
        );
        return res.json({ suministro: req.user.numero_suministro, cantidad: resultado.rowCount, pagos: resultado.rows });
    } catch (error) {
        console.error(error);
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
        console.error(error);
        return res.status(500).json({ mensaje: "Error al consultar las incidencias" });
    }
});

app.get("/api/me/perfil", requiereAuth, async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT u.correo, s.numero_suministro, u.fecha_registro, s.distrito, s.zona
             FROM suministros s
             JOIN usuarios u ON u.id_usuario = s.id_usuario
             WHERE s.id_suministro = $1
             LIMIT 1;`,
            [req.user.id_suministro]
        );
        if (resultado.rowCount === 0) {
            return res.status(404).json({ estado: "error", mensaje: "Suministro no encontrado." });
        }
        return res.json(resultado.rows[0]);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ estado: "error", mensaje: "Error interno del servidor." });
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
        console.error(error);
        return res.status(500).json({ estado: "error", mensaje: "Error interno del servidor." });
    }
});


// ==========================================
// ADMIN: RESUMEN PARA DASHBOARD (datos reales)
// ==========================================

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
        console.error(error);
        return res.status(500).json({ estado: "error", mensaje: "Error interno del servidor." });
    }
});


app.listen(PORT, "0.0.0.0", () => {
    console.log(
        `API Hidro Mejora ejecutándose en el puerto ${PORT}`
    );
});
