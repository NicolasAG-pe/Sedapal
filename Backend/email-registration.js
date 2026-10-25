'use strict';
const crypto = require('node:crypto');
const { AUTH_CONTRACT } = require('./auth-contract');
const { encolarCorreo, cancelarEventos } = require('./email-outbox');
const { crearCodigo, coincideCodigo, OTP_MAX_ATTEMPTS,
    OTP_RESEND_SECONDS, OTP_MAX_SENDS_HOUR, REGISTRATION_TTL_SECONDS } = require('./email-otp');

class ErrorRegistro extends Error {
    constructor(status, mensaje, retryAfter) {
        super(mensaje); this.status = status; this.retryAfter = retryAfter;
    }
}
const invalido = () => new ErrorRegistro(400, 'Código inválido, vencido o sin intentos. Inicia un nuevo registro si es necesario.');
const ocupado = () => new ErrorRegistro(409, 'No se puede registrar esta cuenta con los datos proporcionados.');
const uuid = valor => typeof valor === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(valor);

const CONTRATO_CORREO = 'otp-outbox-v1';
const ACTUALIZAR_CLIENTE = 'Actualiza Hidro-Mejora para crear una cuenta y verificar tu correo. Si ya tienes cuenta, puedes iniciar sesión normalmente.';

function crearRegistroCorreo({ pool, key, from, secreto, generarClaveHash, verificarClave, altasHabilitadas = true, proveedor = 'resend', correoPermitido = null, emitirSesion = null }) {
    if (correoPermitido !== null && (typeof correoPermitido !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoPermitido))) throw new Error('Destinatario canario inválido.');
    function permitirCorreo(correo) {
        if (correoPermitido !== null && correo !== correoPermitido.toLowerCase()) throw new ErrorRegistro(503, 'El registro no está disponible temporalmente. Intenta más tarde.');
    }
    function disponible(paraAlta = false) {
        if ((paraAlta && !altasHabilitadas) || !key || !from || !secreto) throw new ErrorRegistro(503, 'El registro no está disponible temporalmente. Intenta más tarde.');
    }
    async function transaccion(operacion) {
        const cliente = await pool.connect();
        let discard;
        try {
            await cliente.query('BEGIN ISOLATION LEVEL READ COMMITTED');
            await cliente.query("SET LOCAL lock_timeout='2s'");
            await cliente.query("SET LOCAL statement_timeout='10s'");
            const resultado = await operacion(cliente);
            await cliente.query('COMMIT');
            return resultado;
        } catch (error) {
            await cliente.query('ROLLBACK').catch(() => { discard = new Error('Descartar conexión de registro.'); });
            if (error.code === '23505') throw ocupado();
            if (['55P03','57014','40P01'].includes(error.code)) throw new ErrorRegistro(503, 'Registro ocupado temporalmente. Intenta más tarde.', 1);
            throw error;
        } finally { cliente.release(discard); }
    }
    // Todas las operaciones toman los mismos locks en el mismo orden, antes
    // del lock de fila: evita carreras entre registro, reenvío y confirmación.
    async function bloquear(cliente, correo, suministro) {
        for (const clave of [`correo:${correo}`, `suministro:${suministro}`].sort()) {
            await cliente.query('SELECT pg_advisory_xact_lock(7401, hashtext($1))', [clave]);
        }
    }
    async function comprobarEnvios(cliente, correo, suministro) {
        const { rows: [r] } = await cliente.query(`SELECT
            COUNT(*) FILTER (WHERE p.correo=$1)::int AS correo,
            COUNT(*) FILTER (WHERE p.numero_suministro=$2)::int AS suministro,
            EXTRACT(EPOCH FROM (clock_timestamp()-MAX(e.enviado_en))) AS transcurrido
            FROM registros_correo_envios e JOIN registros_correo_pendientes p ON p.id=e.registro_id
            WHERE e.enviado_en > clock_timestamp()-INTERVAL '1 hour'
            AND (p.correo=$1 OR p.numero_suministro=$2)`, [correo, suministro]);
        if (r.correo >= OTP_MAX_SENDS_HOUR || r.suministro >= OTP_MAX_SENDS_HOUR) {
            throw new ErrorRegistro(429, 'Alcanzaste el límite de envíos. Intenta nuevamente en una hora.', 3600);
        }
        if (r.transcurrido !== null && Number(r.transcurrido) < OTP_RESEND_SECONDS) {
            throw new ErrorRegistro(429, 'Espera antes de solicitar otro código.',
                Math.max(1, Math.ceil(OTP_RESEND_SECONDS - Number(r.transcurrido))));
        }
    }
    async function comprobarCuenta(cliente, correo, suministro) {
        const { rows: [r] } = await cliente.query(`SELECT
            EXISTS(SELECT 1 FROM usuarios WHERE lower(correo)=$1) OR
            EXISTS(SELECT 1 FROM suministros WHERE numero_suministro=$2) AS existe`, [correo, suministro]);
        if (r.existe) throw ocupado();
    }
    async function enviar(cliente, pendiente) {
        let nuevo;
        do { nuevo = crearCodigo(pendiente.id, secreto); } while (nuevo.hash === pendiente.codigo_hash);
        const { codigo, hash } = nuevo;
        await cancelarEventos(cliente, pendiente.id);
        await cliente.query(`UPDATE registros_correo_pendientes
            SET codigo_hash=$2,codigo_vence_en=clock_timestamp() WHERE id=$1`, [pendiente.id, hash]);
        await encolarCorreo(cliente, { registroId: pendiente.id, correo: pendiente.correo, codigo, hash, from, key, proveedor });
        const { rows: [r] } = await cliente.query('SELECT vence_en FROM registros_correo_pendientes WHERE id=$1', [pendiente.id]);
        return { estado: 'pendiente', estado_envio: 'en_cola', registro_id: pendiente.id, vence_en: null,
            solicitud_vence_en: r.vence_en, reenvio_en_segundos: OTP_RESEND_SECONDS,
            mensaje: 'Solicitud aceptada. El correo está en cola; espera el código para continuar.' };
    }

    async function estadoSolicitud(cliente, r) {
        if (r.consumido_en) return {estado:'verificado',registro_id:r.id};
        const motivo = r.invalidado ? 'sustituido' : !r.vigente ? 'solicitud_vencida' : r.intentos>=OTP_MAX_ATTEMPTS ? 'sin_intentos' : null;
        if (motivo) return {estado:'cerrado',motivo,registro_id:r.id};
        const { rows: [o] } = await cliente.query(`SELECT o.estado,o.iniciado_en FROM public.correo_outbox o
            JOIN public.registros_correo_envios e ON e.id=o.id WHERE e.registro_id=$1
            AND o.codigo_hash=$2 ORDER BY o.creado_en DESC,o.id LIMIT 1`, [r.id,r.codigo_hash]);
        const { rows: [h] } = await cliente.query(`SELECT GREATEST(0,CEIL($2-EXTRACT(EPOCH FROM
            (clock_timestamp()-MAX(enviado_en)))))::int AS espera FROM registros_correo_envios WHERE registro_id=$1`,[r.id,OTP_RESEND_SECONDS]);
        const estados = { pendiente:'en_cola',reintento:'en_cola',procesando:'procesando',aceptado:'aceptado',
            fallido:'fallido',caducado:'caducado',cancelado:'cancelado',ambiguo:'ambiguo' };
        return { estado:'pendiente',registro_id:r.id,estado_envio:o ? estados[o.estado] : 'anterior',
            vence_en:o && !o.iniciado_en ? null : r.codigo_vence_en,solicitud_vence_en:r.vence_en,
            reenvio_en_segundos:h.espera || 0 };
    }
    async function buscar(cliente, id, consulta = false) {
        // Primera lectura para conocer las claves de los advisory locks.
        const { rows: [datos] } = await cliente.query('SELECT correo,numero_suministro FROM registros_correo_pendientes WHERE id=$1', [id]);
        if (!datos) { if(consulta)throw new ErrorRegistro(404,'No se encontró la solicitud. Puedes reintentar el registro con los mismos datos.'); throw invalido(); }
        await bloquear(cliente, datos.correo, datos.numero_suministro);
        const { rows: [r] } = await cliente.query(`SELECT *,
            vence_en>clock_timestamp() AS vigente,
            codigo_vence_en>clock_timestamp() AS codigo_vigente
            FROM registros_correo_pendientes WHERE id=$1 FOR UPDATE`, [id]);
        if (!r || (!consulta && (!r.vigente || r.consumido_en || r.invalidado || r.intentos >= OTP_MAX_ATTEMPTS))) throw invalido();
        return r;
    }
    return {
        async registrar(body = {}) {
            disponible(true);
            const correo = typeof body.correo === 'string' ? body.correo.trim().toLowerCase() : '';
            const suministro = typeof body.numero_suministro === 'string' ? body.numero_suministro.trim() : '';
            const password = body.password;
            if (correo.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
                throw new ErrorRegistro(400, 'Correo electrónico inválido.');
            }
            permitirCorreo(correo);
            if (!/^\d{9}$/.test(suministro)) throw new ErrorRegistro(400, 'El número de suministro debe contener 9 dígitos.');
            if (typeof password !== 'string' || password.length < 8 || password.length > 128 ||
                !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
                throw new ErrorRegistro(400, 'La contraseña debe tener entre 8 y 128 caracteres, al menos una letra y un número.');
            }
            if(body.solicitud_id!==undefined && !uuid(body.solicitud_id))throw new ErrorRegistro(400,'Identificador de solicitud inválido.');
            const id=body.solicitud_id || crypto.randomUUID();
            const claveHash = generarClaveHash(password);
            return transaccion(async cliente => {
                // Idempotencia de registro: mismo UUID serializa también cuerpos distintos.
                await cliente.query('SELECT pg_advisory_xact_lock(7403,hashtext($1))',[id]);
                await bloquear(cliente, correo, suministro);
                const {rows:[existente]}=await cliente.query(`SELECT *,vence_en>clock_timestamp() AS vigente
                    FROM registros_correo_pendientes WHERE id=$1 FOR UPDATE`,[id]);
                if(existente){
                    if(existente.correo!==correo || existente.numero_suministro!==suministro || !existente.clave_hash ||
                        !verificarClave || !verificarClave(password,existente.clave_hash))throw ocupado();
                    if(!existente.vigente || existente.invalidado || existente.intentos>=OTP_MAX_ATTEMPTS)throw invalido();
                    return estadoSolicitud(cliente,existente);
                }
                await comprobarEnvios(cliente, correo, suministro);
                await comprobarCuenta(cliente, correo, suministro);
                // Una nueva solicitud sustituye las anteriores para el mismo correo.
                const { rows: anteriores } = await cliente.query(`UPDATE registros_correo_pendientes
                    SET invalidado=TRUE,clave_hash='',codigo_hash=$2
                    WHERE correo=$1 AND consumido_en IS NULL AND NOT invalidado RETURNING id`, [correo, '0'.repeat(64)]);
                for (const anterior of anteriores) await cancelarEventos(cliente, anterior.id);
                await cliente.query(`INSERT INTO registros_correo_pendientes
                    (id,correo,numero_suministro,clave_hash,codigo_hash,codigo_vence_en,vence_en)
                    VALUES ($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+make_interval(secs=>$6))`,
                [id, correo, suministro, claveHash, '0'.repeat(64), REGISTRATION_TTL_SECONDS]);
                return enviar(cliente, { id, correo });
            });
        },
        async reenviar(body = {}) {
            disponible(true);
            if (!uuid(body.registro_id)) throw invalido();
            return transaccion(async cliente => {
                const r = await buscar(cliente, body.registro_id);
                permitirCorreo(r.correo);
                await comprobarEnvios(cliente, r.correo, r.numero_suministro);
                await comprobarCuenta(cliente, r.correo, r.numero_suministro);
                // Los reenvíos NO reinician el contador de intentos.
                return enviar(cliente, r);
            });
        },
        async consultar(body = {}) {
            disponible();
            if (!uuid(body.registro_id)) throw invalido();
            return transaccion(async cliente => {
                const r = await buscar(cliente, body.registro_id, true);
                return estadoSolicitud(cliente,r);
            });
        },
        async verificar(body = {}) {
            disponible();
            if (!uuid(body.registro_id) || typeof body.codigo !== 'string' || !/^\d{6}$/.test(body.codigo)) throw invalido();
            const resultado = await transaccion(async cliente => {
                const r = await buscar(cliente, body.registro_id);
                if (!r.codigo_vigente) throw invalido();
                if (!coincideCodigo(r.id, body.codigo, r.codigo_hash, secreto)) {
                    await cliente.query('UPDATE registros_correo_pendientes SET intentos=intentos+1 WHERE id=$1', [r.id]);
                    // El fallo se devuelve después del COMMIT para persistir el intento.
                    return null;
                }
                await comprobarCuenta(cliente, r.correo, r.numero_suministro);
                const { rows: [u] } = await cliente.query(`INSERT INTO usuarios(correo,clave_hash,correo_verificado_en)
                    VALUES ($1,$2,clock_timestamp()) RETURNING id_usuario`, [r.correo, r.clave_hash]);
                await cliente.query('INSERT INTO suministros(numero_suministro,id_usuario) VALUES ($1,$2)', [r.numero_suministro, u.id_usuario]);
                await cliente.query(`UPDATE registros_correo_pendientes SET consumido_en=clock_timestamp(),
                    clave_hash='',codigo_hash=$2 WHERE id=$1`, [r.id, '0'.repeat(64)]);
                await cancelarEventos(cliente, r.id);
                return { estado: 'ok', mensaje: 'Correo verificado. Ya puedes iniciar sesión.',
                    usuario: { numero_suministro: r.numero_suministro }, identidad: { id_usuario: u.id_usuario, numero_suministro: r.numero_suministro } };
            });
            if (!resultado) throw invalido();
            // La cuenta debe estar confirmada en PostgreSQL antes de emitir un JWT.
            // Consultar el estado o repetir el OTP nunca recupera esta credencial.
            const { identidad, ...respuesta } = resultado;
            if (!emitirSesion) return respuesta;
            const sesion = await emitirSesion(identidad);
            if (!sesion) throw new ErrorRegistro(403, 'La cuenta no está habilitada para iniciar sesión.');
            return { ...respuesta, ...sesion, usuario: { ...respuesta.usuario, ...sesion.usuario } };
        }
    };
}

function registrarRutasCorreo(app, servicio, { registro, verificacion, reenvio, consulta }) {
    app.get('/api/auth/capabilities', consulta, (req,res)=>res.set('Cache-Control','no-store').json({
        estado:'ok',contratos_registro:[CONTRATO_CORREO],verificacion_correo_obligatoria:true,auth_contract:AUTH_CONTRACT
    }));
    for (const [ruta, accion, limite, status] of [
        ['register', 'registrar', registro, 202], ['verify-email', 'verificar', verificacion, 201],
        ['resend-verification', 'reenviar', reenvio, 202],
        ['otp/register', 'registrar', registro, 202], ['otp/resend-verification', 'reenviar', reenvio, 202],
        ['verification-status', 'consultar', consulta, 200]
    ]) {
        app.post(`/api/auth/${ruta}`, limite, async (req, res) => {
            res.set('Cache-Control', 'no-store');
            if(['registrar','reenviar'].includes(accion) && req.get('X-Hidro-Auth-Contract')!==CONTRATO_CORREO){
                return res.status(426).json({estado:'error',codigo:'CLIENT_UPDATE_REQUIRED',mensaje:ACTUALIZAR_CLIENTE});
            }
            if(accion==='registrar' && !uuid(req.body?.solicitud_id))return res.status(400).json({estado:'error',mensaje:'Identificador de solicitud inválido.'});
            try { return res.status(status).json(await servicio[accion](req.body || {})); }
            catch (error) {
                if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
                if (!(error instanceof ErrorRegistro)) console.error('Fallo interno en verificación de correo.');
                return res.status(error.status && error instanceof ErrorRegistro ? error.status : 500)
                    .json({ estado: 'error', mensaje: error instanceof ErrorRegistro ? error.message : 'Error interno del servidor.' });
            }
        });
    }
}

module.exports = { crearRegistroCorreo, registrarRutasCorreo, CONTRATO_CORREO };
