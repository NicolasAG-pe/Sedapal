const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require('crypto');
const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { Pool } = require("pg");
const { obtenerConfiguracion } = require('./config');
const { obtenerConfigCorreo } = require('./email-provider');
const { obtenerClaveOutbox } = require('./outbox-crypto');
const { crearRegistroCorreo, registrarRutasCorreo } = require('./email-registration');
const { crearDosFactores, permiteSesion } = require('./two-factor');
const { AUTH_CONTRACT } = require('./auth-contract');
const { createPasswordRecovery, registerPasswordRecovery, transaction: passwordTransaction } = require('./password-recovery');

const app = express();
const configuracion = obtenerConfiguracion();
const PORT = configuracion.port;

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
// En desarrollo se incluyen también los orígenes locales web y Android.
// En producción sin variable: solo same-origin (sin cabecera CORS).
const ORIGENES_PERMITIDOS = configuracion.origenes;

function origenPermitido(origen){
    return !origen || ORIGENES_PERMITIDOS.includes(origen);
}

function corsOrigen(origen, cb){
    cb(null, origenPermitido(origen));
}

app.use(cors({
    origin: corsOrigen,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Hidro-Auth-Contract'],
    maxAge: 600
}));
// Límite acotado: fotografías de incidencias hasta 2 MB + overhead base64.
app.use(express.json({ limit: '3mb' }));

// Opt-in de laboratorio: conserva la entrada /api existente para web y Android.
const authGateway = require('./auth-gateway.cjs');
const authGatewayConfig = authGateway.configuration(process.env);
app.use(authGateway.createGateway(authGatewayConfig, { afterMutation: reconciliarSocketsAuth }));

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

const pool = new Pool(configuracion.database);
// PostgreSQL puede cerrar conexiones inactivas durante reinicios o cortes de red.
// pg descarta esos clientes; manejar el evento evita terminar el proceso Node.
pool.on('error', (error) => {
    console.error('Conexión inactiva de PostgreSQL interrumpida; se renovará al consultar.', {
        codigo: error.code || 'desconocido'
    });
});


// ==========================================
// TIEMPO REAL (Socket.IO sobre el mismo HTTP)
// REST + PostgreSQL siguen siendo la fuente de verdad:
// el socket solo avisa "algo cambió" con payloads
// mínimos y el cliente reconsulta sus endpoints.
// ==========================================

let ioTiempoReal = null;

async function reconciliarSocketsAuth({ pathname }) {
    if (!ioTiempoReal) return;
    try {
        for (const socket of ioTiempoReal.sockets.sockets.values()) {
            const actual = await pool.query(`SELECT u.rol,u.activo,COALESCE(m.version,0) AS mfa_version,
                COALESCE(m.activo,FALSE) AS mfa_activo FROM usuarios u
                LEFT JOIN usuario_2fa m USING(id_usuario) WHERE u.id_usuario=$1`, [socket.user.id_usuario]);
            if (!actual.rows[0]?.activo || !permiteSesion(socket.authClaims, actual.rows[0]) ||
                socket.authClaims.exp * 1000 <= Date.now()) {
                socket.emit('sesion:invalidada', { motivo: 'credenciales' });
                socket.disconnect(true);
            }
        }
        const location = pathname.match(/^\/api\/admin\/suministros\/(\d+)\/ubicacion\/?$/i);
        if (location) emitirASuministro(Number(location[1]), 'perfil:actualizado', { id: Number(location[1]) });
    } catch (_) {
        // Nunca conservar sockets autorizados cuando no se puede releer el estado.
        ioTiempoReal.disconnectSockets(true);
    }
}

function rtLog(mensaje){
    // En producción, logs mínimos. Nunca JWT, hashes ni secretos.
    if (!esProduccion()) console.log(mensaje);
}

// Emits mínimos (sin objetos sensibles, sin hashes, sin secretos).
function emitirASuministro(idSuministro, evento, datos){
    try{
        if (!ioTiempoReal || !idSuministro) return;
        ioTiempoReal.to('suministro:' + Number(idSuministro)).emit(evento, datos || {});
    }catch(e){}
}

function emitirAAdmins(evento, datos){
    try{
        if (!ioTiempoReal) return;
        ioTiempoReal.to('admins').emit(evento, datos || {});
    }catch(e){}
}

function emitirAAutenticados(evento, datos){
    try{
        if (!ioTiempoReal) return;
        ioTiempoReal.to('authenticated').emit(evento, datos || {});
    }catch(e){}
}

async function desconectarSocketsDeSuministro(idSuministro){
    try{
        if (!ioTiempoReal || !idSuministro) return;
        const sala = 'suministro:' + Number(idSuministro);
        ioTiempoReal.to(sala).emit('sesion:invalidada', { motivo: 'desactivada' });
        await ioTiempoReal.in(sala).disconnectSockets(true);
    }catch(e){}
}

async function desconectarSocketsDeUsuario(idUsuario,motivo='desactivada'){
    try{
        if (!ioTiempoReal || !idUsuario) return;
        const salas = ['usuario:' + Number(idUsuario),'auth-revocacion:' + Number(idUsuario)];
        ioTiempoReal.to(salas).emit('sesion:invalidada', { motivo });
        await ioTiempoReal.in(salas).disconnectSockets(true);
    }catch(e){}
}

function configurarTiempoReal(httpServer){
    const io = new Server(httpServer, {
        path: '/socket.io/',
        // CORS cubre polling; allowRequest valida también el upgrade WebSocket.
        allowRequest: (req, cb) => cb(null, origenPermitido(req.headers.origin)),
        // Sin '*' indiscriminado: se reutilizan los orígenes de la API REST.
        cors: {
            origin: corsOrigen,
            methods: ['GET', 'POST'],
            credentials: true
        }
    });

    // Auth obligatoria: JWT del handshake, verificado contra PostgreSQL
    // (firma, expiración, usuario existe, activo, rol actual). Sin anónimos.
    io.use(async (socket, next) => {
        try{
            const token = socket.handshake && socket.handshake.auth && socket.handshake.auth.token;
            if (!token || typeof token !== 'string') return next(new Error('Autenticación requerida.'));
            let datos;
            try{
                datos = jwt.verify(token, obtenerSecretoAuth());
            }catch(e){
                return next(new Error('Autenticación requerida.'));
            }
            const idUsuario = Number(datos && datos.id_usuario);
            if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
                return next(new Error('Autenticación requerida.'));
            }
            const verif = await pool.query(
                `SELECT u.id_usuario, u.rol, u.activo, COALESCE(m.version,0) AS mfa_version, COALESCE(m.activo,FALSE) AS mfa_activo,
                        s.id_suministro, s.numero_suministro
                 FROM usuarios u
                 LEFT JOIN suministros s ON s.id_usuario = u.id_usuario
                 LEFT JOIN usuario_2fa m ON m.id_usuario=u.id_usuario
                 WHERE u.id_usuario = $1
                 LIMIT 1;`,
                [idUsuario]
            );
            if (verif.rowCount === 0 || verif.rows[0].activo === false) {
                return next(new Error('Acceso denegado.'));
            }
            const fila = verif.rows[0];
            if (!permiteSesion(datos, fila)) return next(new Error('Autenticación requerida.'));
            socket.authClaims=datos;
            socket.user = {
                id_usuario: fila.id_usuario,
                id_suministro: fila.id_suministro,
                numero_suministro: fila.numero_suministro,
                rol: fila.rol
            };
            return next();
        }catch(e){
            return next(new Error('Autenticación requerida.'));
        }
    });

    io.on('connection', async (socket) => {
        try{
            // Esta sala solo sirve para revocar; nunca recibe datos de negocio.
            // Entrar antes de releer cierra la carrera handshake/COMMIT/revocación.
            await socket.join('auth-revocacion:'+Number(socket.user.id_usuario));
            const actual=await pool.query(`SELECT u.rol,u.activo,COALESCE(m.version,0) AS mfa_version,COALESCE(m.activo,FALSE) AS mfa_activo
                FROM usuarios u LEFT JOIN usuario_2fa m USING(id_usuario) WHERE u.id_usuario=$1`,[socket.user.id_usuario]);
            if(!socket.connected || !actual.rows[0]?.activo || !permiteSesion(socket.authClaims,actual.rows[0])){socket.disconnect(true);return;}
            // Rooms asignadas por el SERVIDOR. El cliente nunca elige rooms.
            const u = socket.user;
            await socket.join(['authenticated','usuario:'+Number(u.id_usuario),
                ...(u.rol==='admin'?['admins']:u.id_suministro?['suministro:'+Number(u.id_suministro)]:[])]);
            // Invalidación existente tras estar suscrito: cierra la ventana entre
            // connect/primer GET y la comprobación asíncrona de revocación.
            if(socket.connected)socket.emit(u.rol==='admin'?'pago:nuevo':'pago:registrado',{sincronizacion:true});
            rtLog('Socket conectado: usuario ' + u.id_usuario + ' rol ' + u.rol);
        }catch(e){socket.disconnect(true);}
        socket.on('disconnect', () => {
            try{
                const id = socket.user ? socket.user.id_usuario : '?';
                rtLog('Socket desconectado: usuario ' + id);
            }catch(e){}
        });
        // Sin handler 'join': el cliente no solicita rooms.
    });

    ioTiempoReal = io;
    return io;
}


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
            auth_contract: AUTH_CONTRACT,
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
            rol: datos.rol,
            token_use: 'access',
            mfa_version: Number(datos.mfa_version || 0),
            amr: datos.amr || ['pwd']
        },
        obtenerSecretoAuth(),
        { expiresIn: '8h' }
    );
}

function respuestaSesion(fila) {
    return { token: generarTokenAcceso(fila),
        usuario: { id_usuario: fila.id_usuario, correo: fila.correo, rol: fila.rol },
        suministro: { id_suministro: fila.id_suministro, numero_suministro: fila.numero_suministro } };
}
const dosFactores = crearDosFactores({ pool, verificarClave, emitirSesion: respuestaSesion,
    cerrarSockets: id => { if (ioTiempoReal) ioTiempoReal.in(['usuario:' + Number(id),'auth-revocacion:'+Number(id)]).disconnectSockets(true); } });

const passwordRecovery = createPasswordRecovery({pool,hashPassword:generarClaveHash,verifyPassword:verificarClave,
    verifyFactor:(...args)=>dosFactores.verifyPasswordRecovery(...args),closeSockets:id=>desconectarSocketsDeUsuario(id,'credenciales')});
registerPasswordRecovery(app,passwordRecovery,{requestLimit:limitadorGenerico(10,15),verifyLimit:limitadorGenerico(30,15),completeLimit:limitadorGenerico(10,15)});

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
            estado: "error", codigo: "SESSION_REAUTH_REQUIRED",
            mensaje: "Autenticación requerida."
        });
    }

    let datosToken;
    try {
        datosToken = jwt.verify(partes[1], obtenerSecretoAuth());
    } catch (e) {
        return res.status(401).json({
            estado: "error", codigo: "SESSION_REAUTH_REQUIRED",
            mensaje: "Autenticación requerida."
        });
    }

    const idUsuarioToken = Number(datosToken.id_usuario);
    if (!Number.isInteger(idUsuarioToken) || idUsuarioToken <= 0) {
        return res.status(401).json({
            estado: "error", codigo: "SESSION_REAUTH_REQUIRED",
            mensaje: "Autenticación requerida."
        });
    }

    try {
        // Sin clave_hash, sin foto, sin secretos. Solo estado y rol actual.
        const verif = await pool.query(
            `SELECT u.id_usuario, u.rol, u.activo, COALESCE(m.version,0) AS mfa_version, COALESCE(m.activo,FALSE) AS mfa_activo,
                    s.id_suministro, s.numero_suministro
             FROM usuarios u
             LEFT JOIN suministros s ON s.id_usuario = u.id_usuario
             LEFT JOIN usuario_2fa m ON m.id_usuario=u.id_usuario
             WHERE u.id_usuario = $1
             LIMIT 1;`,
            [idUsuarioToken]
        );

        if (verif.rowCount === 0) {
            return res.status(403).json({
                estado: "error", codigo: "SESSION_REAUTH_REQUIRED",
                mensaje: "Acceso denegado."
            });
        }

        const fila = verif.rows[0];
        if (fila.activo === false) {
            return res.status(403).json({
                estado: "error", codigo: "SESSION_REAUTH_REQUIRED",
                mensaje: "Acceso denegado."
            });
        }

        if (!permiteSesion(datosToken, fila)) return res.status(401).json({ estado: 'error', codigo:'SESSION_REAUTH_REQUIRED', mensaje: 'Inicia sesión nuevamente para verificar tu cuenta.' });

        req.user = {
            id_usuario: fila.id_usuario,
            id_suministro: fila.id_suministro,
            numero_suministro: fila.numero_suministro,
            rol: fila.rol,
            mfa_version: fila.mfa_version
        };

        return next();
    } catch (e) {
        // En producción, mensaje genérico; detalle solo en log servidor.
        console.error('Error de autenticación.');
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
    res.set('Cache-Control','no-store');
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
              COALESCE(m.version,0) AS mfa_version,
              COALESCE(m.activo,FALSE) AS mfa_activo,
              s.id_suministro,
              s.numero_suministro
            FROM suministros s
            JOIN usuarios u ON u.id_usuario = s.id_usuario
            LEFT JOIN usuario_2fa m ON m.id_usuario=u.id_usuario
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

        if (fila.mfa_activo) {
            const challenge = await dosFactores.challenge(fila);
            if (challenge.error) return res.status(challenge.error.status).json({ estado: 'error', mensaje: challenge.error.mensaje });
            return res.set('Cache-Control','no-store').status(202).json(challenge);
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
        console.error('Fallo interno de inicio de sesión.');

        return res.status(500).json({
            estado: "error",
            mensaje: "Error interno del servidor."
        });
    }
});


// Restauración Android: verifica JWT y estado/rol actuales mediante requiereAuth.
// No emite tokens nuevos ni amplía sus ocho horas de vigencia.
app.get('/api/auth/session', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
}, requiereAuth, async (req, res) => {
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

// ==========================================
// REGISTRO DE USUARIO + SUMINISTRO
// Prototipo académico: el suministro informado por
// el usuario no se valida contra sistemas oficiales.
// ==========================================

let configCorreo = null;
try {
    const config = obtenerConfigCorreo(process.env, { requiereApiKey: false });
    if (config) configCorreo = { ...config, key: obtenerClaveOutbox() };
}
catch (_) { console.error('Configuración de correo inválida; registro deshabilitado.'); }
const registroCorreo = crearRegistroCorreo({ pool, key: configCorreo && configCorreo.key, from: configCorreo && configCorreo.from,
    proveedor: configCorreo?.provider || 'resend',
    secreto: configCorreo && configCorreo.secreto, generarClaveHash, verificarClave,
    correoPermitido: process.env.EMAIL_REGISTRATION_ALLOWED_EMAIL || null,
    altasHabilitadas: process.env.EMAIL_REGISTRATION_ENABLED === '1',
    emitirSesion: async ({ id_usuario, numero_suministro }) => {
        const { rows: [fila] } = await pool.query(`SELECT u.id_usuario,u.correo,u.rol,u.activo,s.id_suministro,s.numero_suministro
            FROM usuarios u JOIN suministros s ON s.id_usuario=u.id_usuario
            WHERE u.id_usuario=$1 AND s.numero_suministro=$2`, [id_usuario, numero_suministro]);
        if (!fila || fila.activo !== true || fila.rol !== 'usuario') return null;
        return { token: generarTokenAcceso(fila),
            usuario: { id_usuario: fila.id_usuario, correo: fila.correo, rol: fila.rol },
            suministro: { id_suministro: fila.id_suministro, numero_suministro: fila.numero_suministro } };
    } });
registrarRutasCorreo(app, registroCorreo, { registro: limiteRegistro,
    verificacion: limitadorGenerico(30, 15), reenvio: limitadorGenerico(10, 15), consulta: limitadorGenerico(240, 15) });


// ==========================================
// 2FA: desafíos opacos sin acceso a rutas JWT; operaciones de perfil autenticadas.
for (const [ruta, action, autenticada] of [
    ['login', 'login', false], ['setup', 'setup', true], ['confirm', 'confirm', true],
    ['disable', 'disable', true], ['recovery', 'regenerate', true]
]) {
    const handlers = [limitadorGenerico(20, 15)];
    if (autenticada) handlers.push(requiereAuth);
    app.post('/api/auth/2fa/' + ruta, ...handlers, async (req, res) => {
        res.set('Cache-Control','no-store');
        if (autenticada && !['usuario','admin'].includes(req.user.rol)) return res.status(403).json({ estado: 'error', mensaje: 'Acceso denegado.' });
        try {
            const result = autenticada ? await dosFactores[action](req.user.id_usuario, req.body || {},req.user) : await dosFactores[action](req.body || {});
            if (result.error) return res.status(result.error.status).json({ estado: 'error', mensaje: result.error.mensaje, ...(result.error.codigo?{codigo:result.error.codigo}:{}) });
            return res.json(result);
        } catch (_) { return res.status(503).json({ estado: 'error', mensaje: 'No se pudo completar la operación de seguridad. Reintenta más tarde.' }); }
    });
}
app.get('/api/auth/2fa', requiereAuth, async (req, res) => {
    res.set('Cache-Control','no-store');
    if (!['usuario','admin'].includes(req.user.rol)) return res.status(403).json({ estado: 'error', mensaje: 'Acceso denegado.' });
    try { return res.json(await dosFactores.status(req.user.id_usuario)); }
    catch (_) { return res.status(503).json({ estado:'error',mensaje:'No se pudo consultar la seguridad de la cuenta.' }); }
});

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

        const updated=await passwordTransaction(pool,async c=>{
            const {rows:[u]}=await c.query(`SELECT u.id_usuario,u.clave_hash,COALESCE(m.version,0) AS version
                FROM usuarios u LEFT JOIN usuario_2fa m USING(id_usuario) WHERE u.id_usuario=$1 FOR UPDATE OF u`,[req.user.id_usuario]);
            if(!u||u.version!==req.user.mfa_version||!verificarClave(password_actual,u.clave_hash))return false;
            await c.query('UPDATE usuarios SET clave_hash=$2 WHERE id_usuario=$1',[u.id_usuario,generarClaveHash(password_nueva)]);
            return true;
        });
        if(!updated)return res.status(401).json({estado:'error',mensaje:'No fue posible validar las credenciales actuales.'});

        res.json({estado:"ok",mensaje:"Contraseña actualizada. Inicia sesión nuevamente."});
        await desconectarSocketsDeUsuario(req.user.id_usuario,'credenciales');
        return;

    } catch (error) {
        console.error('Fallo interno al cambiar contraseña.');

        return res.status(500).json({
            estado: "error",
            mensaje: "Error interno del servidor."
        });
    }
});


// ==========================================


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
        const idNotif = r.rows[0] ? r.rows[0].id_notificacion : null;
        // Tiempo real centralizado (una sola fila en PostgreSQL, un solo aviso):
        // el frontend reconsulta GET /api/notificaciones y actualiza badges.
        if (idNotif) {
            if (alcance === 'General') emitirAAutenticados('notificacion:nueva', { id: idNotif, alcance: alcance, tipo: tipo });
            else emitirASuministro(idSuministro, 'notificacion:nueva', { id: idNotif, alcance: alcance, tipo: tipo });
        }
        return idNotif;
    } catch (e) {
        console.error('No se pudo crear la notificación.', e);
        return null;
    }
}


// ==========================================
// ADMIN: USUARIOS Y SUMINISTROS
// Sin clave_hash, sin fotos, sin secretos.
// ==========================================


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
        // Tiempo real: cuenta desactivada => el frontend cierra sesión y el
        // servidor desconecta sus sockets (complementa el 403 HTTP).
        if (activo === false) {
            try {
                const sum = await pool.query(`SELECT id_suministro FROM suministros WHERE id_usuario = $1 LIMIT 1;`, [idUsuario]);
                if (sum.rowCount) await desconectarSocketsDeSuministro(sum.rows[0].id_suministro);
                await desconectarSocketsDeUsuario(idUsuario);
            } catch (e) {}
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
        // Tiempo real: el cliente actualiza su perfil si está abierto.
        emitirASuministro(idSuministro, 'perfil:actualizado', { id: idSuministro });
        // No se copian cortes: el modelo dinámico por distrito/zona refleja
        // automáticamente el cambio en la siguiente consulta/polling.
        return res.json({ estado: "ok", suministro: resultado.rows[0] });
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


const routeContext = { pool, requiereAuth, requiereAdmin, limitadorGenerico, limiteOperacionesSensibles,
    puedeVerSuministro, emitirASuministro, emitirAAdmins, emitirAAutenticados, crearNotificacion };
require('./services/billing/routes.cjs').registerRoutes(app, routeContext);
require('./services/operations/routes.cjs').registerRoutes(app, routeContext);
require('./services/notifications/routes.cjs').registerRoutes(app, routeContext);
require('./services/auth/reporting.cjs').registerRoutes(app, routeContext);

const httpServer = http.createServer(app);
configurarTiempoReal(httpServer);
// Respaldo ante respuesta perdida después de un COMMIT o cambio interno en Auth.
// Solo en modo integrado; evita conservar indefinidamente sockets revocados.
if (authGatewayConfig) {
    let checking = false;
    const authTimer = setInterval(async () => {
        if (checking) return;
        checking = true;
        try { await reconciliarSocketsAuth({ pathname: '' }); } finally { checking = false; }
    }, 5000);
    authTimer.unref();
    httpServer.once('close', () => clearInterval(authTimer));
}

if (require.main === module) {
    let stopping = false;
    const shutdown = () => {
        if (stopping) return; stopping = true;
        const timer = setTimeout(() => process.exit(1), 20000); timer.unref();
        ioTiempoReal.close(() => {
            pool.end().then(() => { clearTimeout(timer); process.exit(0); })
                .catch(() => { console.error('No se completó el cierre de la API.'); process.exit(1); });
        });
    };
    process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
    httpServer.listen(PORT, "0.0.0.0", () => {
        console.log(`API Hidro Mejora ejecutándose en el puerto ${PORT}`);
    });
}

// Permite pruebas HTTP aisladas sin iniciar un puerto al importar.
module.exports = { app, pool, httpServer, io: ioTiempoReal };
