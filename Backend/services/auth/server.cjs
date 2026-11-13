'use strict';
// MS-03: servicio Auth como proceso independiente.
// Conserva como unidad usuarios, identidad/ubicación de suministro, MFA,
// recuperación y registro (docs/microservices/01, extracción 2). Reutiliza los
// módulos de dominio del monolito tal como los compone server.js: NO importa
// server.js y no expone rutas de Billing/Operations/Notifications/Realtime.
// La revocación activa sigue siendo fail-closed: cada petición JWT rele usuarios,
// suministros y usuario_2fa (permiteSesion) en PostgreSQL.
const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const http = require('node:http');
const { Pool } = require('pg');

const { obtenerConfiguracion } = require('../../config');
const { AUTH_CONTRACT } = require('../../auth-contract');
const { crearDosFactores, permiteSesion } = require('../../two-factor');
const { crearRegistroCorreo, registrarRutasCorreo } = require('../../email-registration');
const { createPasswordRecovery, registerPasswordRecovery, transaction: passwordTransaction } = require('../../password-recovery');
const { obtenerClaveOutbox } = require('../../outbox-crypto');
const { obtenerConfigCorreo } = require('../../email-provider');
const INTROSPECT = require('./internal-transport.cjs');

const READY_TABLES = ['usuarios', 'suministros', 'usuario_2fa', 'usuario_2fa_recuperacion', 'desafios_2fa',
    'registros_correo_pendientes', 'registros_correo_envios', 'correo_outbox',
    'recuperacion_clave_limites', 'recuperaciones_clave', 'recuperacion_clave_outbox'];

function log(evento, campos = {}) {
    // Logs JSON sin JWT, OTP, contraseñas, correo ni cuerpos.
    console.log(JSON.stringify({ service: 'auth', event: evento, ...campos }));
}

function createService({ pool, env = process.env, hooks = {} }) {
    const cerrarSocketsUsuario = hooks.cerrarSocketsUsuario || ((id, motivo) => log('session_revoked', { id_usuario: id, motivo: motivo || 'desactivada' }));
    const cerrarSocketsSuministro = hooks.cerrarSocketsSuministro || (id => log('session_revoked', { id_suministro: id, motivo: 'desactivada' }));
    const emitirPerfilActualizado = hooks.emitirPerfil || (id => log('perfil_actualizado', { id_suministro: id }));
    const secretoAuth = () => env.AUTH_TOKEN_SECRET || '';

    const app = express();
    app.set('trust proxy', 1); // Internet -> proxy único -> servicio.
    app.disable('x-powered-by');
    app.use(helmet({ contentSecurityPolicy: false }));
    const ORIGENES_PERMITIDOS = obtenerConfiguracion(env).origenes;
    const origenPermitido = origen => !origen || ORIGENES_PERMITIDOS.includes(origen);
    app.use(cors({ origin: (origen, cb) => cb(null, origenPermitido(origen)),
        methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Hidro-Auth-Contract'], maxAge: 600 }));
    // Límite acotado igual al monolito; verify conserva los bytes originales
    // porque la firma HMAC del contrato interno cubre el cuerpo exacto.
    app.use(express.json({ limit: '3mb', verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); } }));

    function limitadorGenerico(maxPeticiones, ventanaMinutos) {
        return rateLimit({ windowMs: ventanaMinutos * 60 * 1000, max: maxPeticiones,
            standardHeaders: true, legacyHeaders: false,
            message: { estado: 'error', mensaje: 'Demasiadas solicitudes. Intenta nuevamente más tarde.' } });
    }
    const limiteLogin = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
        skipSuccessfulRequests: true,
        message: { estado: 'error', mensaje: 'Demasiadas solicitudes. Intenta nuevamente más tarde.' } });
    const limiteRegistro = limitadorGenerico(10, 15);
    const limiteCambioClave = limitadorGenerico(10, 15);

    // --- Criptografía de credenciales (idéntica al monolito) ---
    function verificarClave(password, almacenado) {
        try {
            const partes = String(almacenado || '').split('$');
            if (partes.length !== 3 || partes[0] !== 'scrypt') return false;
            const salt = partes[1];
            const hashOriginal = Buffer.from(partes[2], 'hex');
            const hashCalculado = crypto.scryptSync(password, salt, 64);
            return hashOriginal.length === hashCalculado.length &&
                crypto.timingSafeEqual(hashOriginal, hashCalculado);
        } catch (_) { return false; }
    }
    function generarClaveHash(password) {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.scryptSync(password, salt, 64).toString('hex');
        return 'scrypt$' + salt + '$' + hash;
    }

    // --- JWT (mismas claims y vigencia de 8 h) ---
    function generarTokenAcceso(datos) {
        return jwt.sign({ id_usuario: datos.id_usuario, id_suministro: datos.id_suministro,
            numero_suministro: datos.numero_suministro, rol: datos.rol, token_use: 'access',
            mfa_version: Number(datos.mfa_version || 0), amr: datos.amr || ['pwd'] },
        secretoAuth(), { expiresIn: '8h' });
    }
    function respuestaSesion(fila) {
        return { token: generarTokenAcceso(fila),
            usuario: { id_usuario: fila.id_usuario, correo: fila.correo, rol: fila.rol },
            suministro: { id_suministro: fila.id_suministro, numero_suministro: fila.numero_suministro } };
    }

    // --- Composición de dominio Auth (igual que server.js) ---
    const dosFactores = crearDosFactores({ pool, verificarClave, emitirSesion: respuestaSesion,
        cerrarSockets: id => cerrarSocketsUsuario(id, 'mfa'), env });
    const passwordRecovery = createPasswordRecovery({ pool, hashPassword: generarClaveHash, verifyPassword: verificarClave,
        verifyFactor: (...args) => dosFactores.verifyPasswordRecovery(...args),
        closeSockets: id => cerrarSocketsUsuario(id, 'credenciales'), env });
    let configCorreo = null;
    try {
        const config = obtenerConfigCorreo(env, { requiereApiKey: false });
        if (config) configCorreo = { ...config, key: obtenerClaveOutbox(env) };
    } catch (_) { log('config_correo_invalida'); }
    const registroCorreo = crearRegistroCorreo({ pool, key: configCorreo && configCorreo.key,
        from: configCorreo && configCorreo.from, proveedor: configCorreo?.provider || 'resend',
        secreto: configCorreo && configCorreo.secreto, generarClaveHash, verificarClave,
        correoPermitido: env.EMAIL_REGISTRATION_ALLOWED_EMAIL || null,
        altasHabilitadas: env.EMAIL_REGISTRATION_ENABLED === '1',
        emitirSesion: async ({ id_usuario, numero_suministro }) => {
            const { rows: [fila] } = await pool.query(`SELECT u.id_usuario,u.correo,u.rol,u.activo,s.id_suministro,s.numero_suministro
                FROM usuarios u JOIN suministros s ON s.id_usuario=u.id_usuario
                WHERE u.id_usuario=$1 AND s.numero_suministro=$2`, [id_usuario, numero_suministro]);
            if (!fila || fila.activo !== true || fila.rol !== 'usuario') return null;
            return { token: generarTokenAcceso(fila),
                usuario: { id_usuario: fila.id_usuario, correo: fila.correo, rol: fila.rol },
                suministro: { id_suministro: fila.id_suministro, numero_suministro: fila.numero_suministro } };
        } });

    // --- Autenticación por petición (fail-closed, verbatim del monolito) ---
    async function requiereAuth(req, res, next) {
        const partes = (req.headers.authorization || '').split(' ');
        if (partes.length !== 2 || partes[0] !== 'Bearer' || !partes[1]) {
            return res.status(401).json({ estado: 'error', codigo: 'SESSION_REAUTH_REQUIRED', mensaje: 'Autenticación requerida.' });
        }
        let datosToken;
        try { datosToken = jwt.verify(partes[1], secretoAuth()); }
        catch (_) { return res.status(401).json({ estado: 'error', codigo: 'SESSION_REAUTH_REQUIRED', mensaje: 'Autenticación requerida.' }); }
        const idUsuarioToken = Number(datosToken.id_usuario);
        if (!Number.isInteger(idUsuarioToken) || idUsuarioToken <= 0) {
            return res.status(401).json({ estado: 'error', codigo: 'SESSION_REAUTH_REQUIRED', mensaje: 'Autenticación requerida.' });
        }
        try {
            const verif = await pool.query(
                `SELECT u.id_usuario, u.rol, u.activo, COALESCE(m.version,0) AS mfa_version, COALESCE(m.activo,FALSE) AS mfa_activo,
                        s.id_suministro, s.numero_suministro
                 FROM usuarios u
                 LEFT JOIN suministros s ON s.id_usuario = u.id_usuario
                 LEFT JOIN usuario_2fa m ON m.id_usuario=u.id_usuario
                 WHERE u.id_usuario = $1
                 LIMIT 1;`, [idUsuarioToken]);
            if (verif.rowCount === 0) {
                return res.status(403).json({ estado: 'error', codigo: 'SESSION_REAUTH_REQUIRED', mensaje: 'Acceso denegado.' });
            }
            const fila = verif.rows[0];
            if (fila.activo === false) {
                return res.status(403).json({ estado: 'error', codigo: 'SESSION_REAUTH_REQUIRED', mensaje: 'Acceso denegado.' });
            }
            if (!permiteSesion(datosToken, fila)) {
                return res.status(401).json({ estado: 'error', codigo: 'SESSION_REAUTH_REQUIRED', mensaje: 'Inicia sesión nuevamente para verificar tu cuenta.' });
            }
            req.user = { id_usuario: fila.id_usuario, id_suministro: fila.id_suministro,
                numero_suministro: fila.numero_suministro, rol: fila.rol, mfa_version: fila.mfa_version };
            return next();
        } catch (_) {
            return res.status(500).json({ estado: 'error', mensaje: 'Error interno del servidor.' });
        }
    }
    function requiereAdmin(req, res, next) {
        requiereAuth(req, res, () => {
            if (!req.user || req.user.rol !== 'admin') return res.status(403).json({ estado: 'error', mensaje: 'Acceso denegado.' });
            return next();
        });
    }
    function puedeVerSuministro(req, numeroSuministro) {
        if (!req.user) return false;
        if (req.user.rol === 'admin') return true;
        return String(req.user.numero_suministro || '') === String(numeroSuministro || '');
    }

    // ================== RUTAS PÚBLICAS DE AUTH ==================
    app.post('/api/auth/login', limiteLogin, async (req, res) => {
        res.set('Cache-Control', 'no-store');
        try {
            const { numero_suministro, password } = req.body || {};
            if (!/^\d{9}$/.test(String(numero_suministro || ''))) {
                return res.status(400).json({ estado: 'error', mensaje: 'El número de suministro debe contener 9 dígitos.' });
            }
            if (typeof password !== 'string' || password.length < 4 || password.length > 128) {
                return res.status(401).json({ estado: 'error', mensaje: 'Número de suministro o contraseña incorrectos.' });
            }
            const resultado = await pool.query(
                `SELECT u.id_usuario, u.correo, u.clave_hash, u.rol, u.activo,
                        COALESCE(m.version,0) AS mfa_version, COALESCE(m.activo,FALSE) AS mfa_activo,
                        s.id_suministro, s.numero_suministro
                 FROM suministros s
                 JOIN usuarios u ON u.id_usuario = s.id_usuario
                 LEFT JOIN usuario_2fa m ON m.id_usuario=u.id_usuario
                 WHERE s.numero_suministro = $1
                 LIMIT 1;`, [String(numero_suministro)]);
            if (resultado.rowCount === 0) {
                return res.status(401).json({ estado: 'error', mensaje: 'Número de suministro o contraseña incorrectos.' });
            }
            const fila = resultado.rows[0];
            if (fila.activo === false) {
                return res.status(403).json({ estado: 'error', mensaje: 'Esta cuenta no se encuentra habilitada.' });
            }
            if (!verificarClave(password, fila.clave_hash)) {
                return res.status(401).json({ estado: 'error', mensaje: 'Número de suministro o contraseña incorrectos.' });
            }
            if (fila.mfa_activo) {
                const challenge = await dosFactores.challenge(fila);
                if (challenge.error) return res.status(challenge.error.status).json({ estado: 'error', mensaje: challenge.error.mensaje });
                return res.set('Cache-Control', 'no-store').status(202).json(challenge);
            }
            return res.status(200).json({ estado: 'ok', token: generarTokenAcceso(fila),
                usuario: { id_usuario: fila.id_usuario, correo: fila.correo, rol: fila.rol },
                suministro: { id_suministro: fila.id_suministro, numero_suministro: fila.numero_suministro } });
        } catch (_) {
            return res.status(500).json({ estado: 'error', mensaje: 'Error interno del servidor.' });
        }
    });

    // Restauración Android: verifica JWT y estado actual; no emite tokens nuevos.
    app.get('/api/auth/session', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); },
        requiereAuth, async (req, res) => {
            if (req.user.rol !== 'usuario' || !req.user.numero_suministro) {
                return res.status(403).json({ estado: 'error', mensaje: 'Acceso denegado.' });
            }
            try {
                const result = await pool.query('SELECT correo FROM usuarios WHERE id_usuario=$1', [req.user.id_usuario]);
                if (!result.rowCount) return res.status(403).json({ estado: 'error', mensaje: 'Acceso denegado.' });
                return res.json({ estado: 'ok', usuario: { id_usuario: req.user.id_usuario, rol: req.user.rol, correo: result.rows[0].correo },
                    suministro: { id_suministro: req.user.id_suministro, numero_suministro: req.user.numero_suministro } });
            } catch (_) {
                return res.status(500).json({ estado: 'error', mensaje: 'No se pudo comprobar la sesión.' });
            }
        });

    registrarRutasCorreo(app, registroCorreo, { registro: limiteRegistro,
        verificacion: limitadorGenerico(30, 15), reenvio: limitadorGenerico(10, 15), consulta: limitadorGenerico(240, 15) });

    for (const [ruta, action, autenticada] of [
        ['login', 'login', false], ['setup', 'setup', true], ['confirm', 'confirm', true],
        ['disable', 'disable', true], ['recovery', 'regenerate', true]
    ]) {
        const handlers = [limitadorGenerico(20, 15)];
        if (autenticada) handlers.push(requiereAuth);
        app.post('/api/auth/2fa/' + ruta, ...handlers, async (req, res) => {
            res.set('Cache-Control', 'no-store');
            if (autenticada && !['usuario', 'admin'].includes(req.user.rol)) return res.status(403).json({ estado: 'error', mensaje: 'Acceso denegado.' });
            try {
                const result = autenticada ? await dosFactores[action](req.user.id_usuario, req.body || {}, req.user) : await dosFactores[action](req.body || {});
                if (result.error) return res.status(result.error.status).json({ estado: 'error', mensaje: result.error.mensaje, ...(result.error.codigo ? { codigo: result.error.codigo } : {}) });
                return res.json(result);
            } catch (_) { return res.status(503).json({ estado: 'error', mensaje: 'No se pudo completar la operación de seguridad. Reintenta más tarde.' }); }
        });
    }
    app.get('/api/auth/2fa', requiereAuth, async (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!['usuario', 'admin'].includes(req.user.rol)) return res.status(403).json({ estado: 'error', mensaje: 'Acceso denegado.' });
        try { return res.json(await dosFactores.status(req.user.id_usuario)); }
        catch (_) { return res.status(503).json({ estado: 'error', mensaje: 'No se pudo consultar la seguridad de la cuenta.' }); }
    });

    registerPasswordRecovery(app, passwordRecovery, { requestLimit: limitadorGenerico(10, 15),
        verifyLimit: limitadorGenerico(30, 15), completeLimit: limitadorGenerico(10, 15) });

    // ================== RUTAS AUTENTICADAS DE AUTH ==================
    app.post('/api/auth/change-password', limiteCambioClave, requiereAuth, async (req, res) => {
        try {
            const { password_actual, password_nueva, password_confirmacion } = req.body || {};
            if (typeof password_actual !== 'string' || password_actual.length === 0) {
                return res.status(400).json({ estado: 'error', mensaje: 'La contraseña actual es obligatoria.' });
            }
            if (typeof password_nueva !== 'string' || password_nueva.length < 8 || password_nueva.length > 128) {
                return res.status(400).json({ estado: 'error', mensaje: 'La contraseña nueva debe tener entre 8 y 128 caracteres.' });
            }
            if (!/[A-Za-z]/.test(password_nueva) || !/[0-9]/.test(password_nueva)) {
                return res.status(400).json({ estado: 'error', mensaje: 'La contraseña nueva debe contener al menos una letra y un número.' });
            }
            if (password_nueva !== password_confirmacion) {
                return res.status(400).json({ estado: 'error', mensaje: 'La confirmación no coincide con la contraseña nueva.' });
            }
            if (password_nueva === password_actual) {
                return res.status(400).json({ estado: 'error', mensaje: 'La contraseña nueva no debe ser idéntica a la actual.' });
            }
            const updated = await passwordTransaction(pool, async c => {
                const { rows: [u] } = await c.query(`SELECT u.id_usuario,u.clave_hash,COALESCE(m.version,0) AS version
                    FROM usuarios u LEFT JOIN usuario_2fa m USING(id_usuario) WHERE u.id_usuario=$1 FOR UPDATE OF u`, [req.user.id_usuario]);
                if (!u || u.version !== req.user.mfa_version || !verificarClave(password_actual, u.clave_hash)) return false;
                await c.query('UPDATE usuarios SET clave_hash=$2 WHERE id_usuario=$1', [u.id_usuario, generarClaveHash(password_nueva)]);
                return true;
            });
            if (!updated) return res.status(401).json({ estado: 'error', mensaje: 'No fue posible validar las credenciales actuales.' });
            res.json({ estado: 'ok', mensaje: 'Contraseña actualizada. Inicia sesión nuevamente.' });
            await cerrarSocketsUsuario(req.user.id_usuario, 'credenciales');
            return;
        } catch (_) {
            return res.status(500).json({ estado: 'error', mensaje: 'Error interno del servidor.' });
        }
    });

    app.get('/api/me/perfil', requiereAuth, async (req, res) => {
        try {
            const resultado = await pool.query(
                `SELECT u.correo, s.numero_suministro, u.fecha_registro, s.distrito, s.zona
                 FROM suministros s
                 JOIN usuarios u ON u.id_usuario = s.id_usuario
                 WHERE s.id_suministro = $1
                 LIMIT 1;`, [req.user.id_suministro]);
            if (resultado.rowCount === 0) return res.status(404).json({ estado: 'error', mensaje: 'Suministro no encontrado.' });
            return res.json(resultado.rows[0]);
        } catch (_) {
            return res.status(500).json({ estado: 'error', mensaje: 'Error interno del servidor.' });
        }
    });

    app.get('/api/perfil/:suministro', requiereAuth, async (req, res) => {
        try {
            const numeroSuministro = String(req.params.suministro || '').trim();
            if (!/^\d{9}$/.test(numeroSuministro)) {
                return res.status(400).json({ estado: 'error', mensaje: 'El número de suministro debe contener 9 dígitos.' });
            }
            if (!puedeVerSuministro(req, numeroSuministro)) {
                return res.status(403).json({ estado: 'error', mensaje: 'Acceso denegado.' });
            }
            const resultado = await pool.query(
                `SELECT u.correo, s.numero_suministro, u.fecha_registro
                 FROM suministros s
                 JOIN usuarios u ON u.id_usuario = s.id_usuario
                 WHERE s.numero_suministro = $1
                 LIMIT 1;`, [numeroSuministro]);
            if (resultado.rowCount === 0) return res.status(404).json({ estado: 'error', mensaje: 'Suministro no encontrado.' });
            return res.json(resultado.rows[0]);
        } catch (_) {
            return res.status(500).json({ estado: 'error', mensaje: 'Error interno del servidor.' });
        }
    });

    // ================== RUTAS ADMIN DE AUTH ==================
    app.patch('/api/admin/usuarios/:id/estado', requiereAdmin, async (req, res) => {
        try {
            const idUsuario = Number(req.params.id);
            const activo = (req.body || {}).activo;
            if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
                return res.status(404).json({ estado: 'error', mensaje: 'Usuario no encontrado.' });
            }
            if (typeof activo !== 'boolean') {
                return res.status(400).json({ estado: 'error', mensaje: 'El campo activo debe ser true o false.' });
            }
            if (req.user && Number(req.user.id_usuario) === idUsuario) {
                return res.status(409).json({ estado: 'error', mensaje: 'No puedes desactivar tu propia cuenta administrativa.' });
            }
            const resultado = await pool.query(
                `UPDATE usuarios SET activo = $1 WHERE id_usuario = $2
                 RETURNING id_usuario, correo, rol, fecha_registro, activo;`, [activo, idUsuario]);
            if (resultado.rowCount === 0) {
                return res.status(404).json({ estado: 'error', mensaje: 'Usuario no encontrado.' });
            }
            if (activo === false) {
                try {
                    const sum = await pool.query('SELECT id_suministro FROM suministros WHERE id_usuario = $1 LIMIT 1;', [idUsuario]);
                    if (sum.rowCount) await cerrarSocketsSuministro(sum.rows[0].id_suministro);
                    await cerrarSocketsUsuario(idUsuario, 'desactivada');
                } catch (_) {}
            }
            return res.json({ estado: 'ok', usuario: resultado.rows[0] });
        } catch (_) {
            return res.status(500).json({ estado: 'error', mensaje: 'Error interno del servidor.' });
        }
    });

    app.patch('/api/admin/suministros/:id/ubicacion', requiereAdmin, async (req, res) => {
        try {
            const idSuministro = Number(req.params.id);
            if (!Number.isInteger(idSuministro) || idSuministro <= 0) {
                return res.status(404).json({ estado: 'error', mensaje: 'Suministro no encontrado.' });
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
                return res.status(400).json({ estado: 'error', mensaje: 'Distrito (máx. 100) o zona (máx. 150) demasiado largos.' });
            }
            const resultado = await pool.query(
                `UPDATE suministros SET distrito = $1, zona = $2 WHERE id_suministro = $3
                 RETURNING id_suministro, numero_suministro, distrito, zona;`, [dNorm, zNorm, idSuministro]);
            if (resultado.rowCount === 0) {
                return res.status(404).json({ estado: 'error', mensaje: 'Suministro no encontrado.' });
            }
            await emitirPerfilActualizado(idSuministro);
            return res.json({ estado: 'ok', suministro: resultado.rows[0] });
        } catch (_) {
            return res.status(500).json({ estado: 'error', mensaje: 'Error interno del servidor.' });
        }
    });

    // ================== CONTRATO INTERNO: INTROSPECCIÓN ==================
    // Bearer original -> identidad vigente tras releer PostgreSQL. Fail-closed,
    // sin caché permisiva y sin clave_hash, OTP ni secretos (docs/microservices/04).
    let stopping = false;
    const nonces = new Map();
    app.post(INTROSPECT.PATH, (req, res) => {
        const reply = (status, data) => res.status(status).set('Cache-Control', 'no-store').json(data);
        const timestamp = req.headers['x-hidro-time'], nonce = req.headers['x-hidro-nonce'], mac = req.headers['x-hidro-signature'];
        if (!/^\d{13}$/.test(timestamp || '') || Math.abs(Date.now() - Number(timestamp)) > 30000 ||
            !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(nonce || '') ||
            !/^[a-f0-9]{64}$/.test(mac || '')) return reply(401, { version: 1, vigente: false, motivo: 'unauthorized' });
        const body = req.rawBody || '';
        if (Buffer.byteLength(body) > 4096) return reply(413, { version: 1, vigente: false, motivo: 'too_large' });
        const expected = Buffer.from(INTROSPECT.signature(env.AUTH_INTERNAL_SECRET || '', timestamp, nonce, body), 'hex');
        let provided;
        try { provided = Buffer.from(mac, 'hex'); } catch (_) { return reply(401, { version: 1, vigente: false, motivo: 'unauthorized' }); }
        if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
            return reply(401, { version: 1, vigente: false, motivo: 'unauthorized' });
        }
        for (const [id, expires] of nonces) if (expires < Date.now()) nonces.delete(id);
        if (nonces.has(nonce)) return reply(409, { version: 1, vigente: false, motivo: 'replay' });
        if (nonces.size >= 10000) return reply(503, { version: 1, vigente: false, motivo: 'unavailable' });
        nonces.set(nonce, Number(timestamp) + 30001);
        let solicitud;
        try { solicitud = JSON.parse(body); } catch (_) { return reply(400, { version: 1, vigente: false, motivo: 'invalid' }); }
        if (!solicitud || solicitud.version !== 1 || typeof solicitud.token !== 'string' || solicitud.token.length > 4096) {
            return reply(400, { version: 1, vigente: false, motivo: 'invalid' });
        }
        let datos;
        try { datos = jwt.verify(solicitud.token, secretoAuth()); }
        catch (_) { return reply(200, { version: 1, vigente: false, motivo: 'sesion' }); }
        const idUsuario = Number(datos.id_usuario);
        if (!Number.isInteger(idUsuario) || idUsuario <= 0) return reply(200, { version: 1, vigente: false, motivo: 'sesion' });
        (async () => {
            try {
                const verif = await pool.query(
                    `SELECT u.id_usuario, u.rol, u.activo, COALESCE(m.version,0) AS mfa_version, COALESCE(m.activo,FALSE) AS mfa_activo,
                            s.id_suministro, s.numero_suministro
                     FROM usuarios u
                     LEFT JOIN suministros s ON s.id_usuario = u.id_usuario
                     LEFT JOIN usuario_2fa m ON m.id_usuario=u.id_usuario
                     WHERE u.id_usuario = $1
                     LIMIT 1;`, [idUsuario]);
                const fila = verif.rows[0];
                if (verif.rowCount === 0) return reply(200, { version: 1, vigente: false, motivo: 'desconocido' });
                if (fila.activo === false) return reply(200, { version: 1, vigente: false, motivo: 'inactivo' });
                if (!permiteSesion(datos, fila)) return reply(200, { version: 1, vigente: false, motivo: 'sesion' });
                return reply(200, { version: 1, vigente: true, identidad: INTROSPECT.identidad(fila) });
            } catch (_) {
                return reply(503, { version: 1, vigente: false, motivo: 'unavailable' });
            }
        })();
    });

    // ================== SALUD DEL PROCESO ==================
    app.get('/live', (req, res) => res.status(stopping ? 503 : 200).json({ service: 'auth', status: stopping ? 'stopping' : 'ok' }));
    app.get('/ready', async (req, res) => {
        try {
            for (const tabla of READY_TABLES) await pool.query(`SELECT 1 FROM ${tabla} LIMIT 0`);
            return res.status(200).json({ service: 'auth', status: 'ok', auth_contract: AUTH_CONTRACT });
        } catch (_) {
            return res.status(503).json({ service: 'auth', status: 'degraded' });
        }
    });

    return { app, cerrarSocketsUsuario, cerrarSocketsSuministro, emitirPerfilActualizado,
        marcarParada: () => { stopping = true; } };
}

function fromEnvironment(env = process.env) {
    const port = Number(env.PORT || 3100);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('PORT debe ser un entero entre 1 y 65535.');
    const secreto = env.AUTH_TOKEN_SECRET || '';
    if (typeof secreto !== 'string' || Buffer.byteLength(secreto) < 16) throw Error('AUTH_TOKEN_SECRET es obligatorio para el servicio Auth.');
    const { database } = obtenerConfiguracion(env);
    const pool = new Pool({ ...database, application_name: 'hidro-auth-service' });
    pool.on('error', error => log('pool_error', { codigo: error.code || 'desconocido' }));
    const service = createService({ pool, env });
    const server = http.createServer(service.app);
    server.requestTimeout = 30000; server.headersTimeout = 20000;
    const stop = async () => {
        service.marcarParada();
        await new Promise(resolve => server.close(resolve));
        await pool.end();
    };
    return { ...service, server, port, stop };
}

if (require.main === module) {
    try {
        const service = fromEnvironment(process.env);
        service.server.on('error', () => { console.error(JSON.stringify({ service: 'auth', event: 'listen_error' })); process.exitCode = 1; });
        service.server.listen(service.port, '0.0.0.0', () => {
            log('ready', { port: service.port });
            if (process.send) process.send({ event: 'ready', port: service.port });
        });
        const terminar = () => { const timer = setTimeout(() => process.exit(1), 20000); timer.unref();
            service.stop().then(() => { clearTimeout(timer); process.exit(0); }); };
        process.once('SIGTERM', terminar); process.once('SIGINT', terminar);
    } catch (_) {
        console.error(JSON.stringify({ service: 'auth', event: 'configuration_error' }));
        process.exitCode = 1;
    }
}
module.exports = { createService, fromEnvironment };
