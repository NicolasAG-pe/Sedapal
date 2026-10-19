'use strict';
const crypto = require('node:crypto');
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

function crearRegistroCorreo({ pool, key, from, secreto, generarClaveHash }) {
    function disponible() {
        if (!key || !from || !secreto) throw new ErrorRegistro(503, 'El registro no está disponible temporalmente. Intenta más tarde.');
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
        await encolarCorreo(cliente, { registroId: pendiente.id, correo: pendiente.correo, codigo, hash, from, key });
        const { rows: [r] } = await cliente.query('SELECT vence_en FROM registros_correo_pendientes WHERE id=$1', [pendiente.id]);
        return { estado: 'pendiente', estado_envio: 'en_cola', registro_id: pendiente.id, vence_en: null,
            solicitud_vence_en: r.vence_en, reenvio_en_segundos: OTP_RESEND_SECONDS,
            mensaje: 'Solicitud aceptada. El correo está en cola; espera el código para continuar.' };
    }

    async function buscar(cliente, id) {
        // Primera lectura para conocer las claves de los advisory locks.
        const { rows: [datos] } = await cliente.query('SELECT correo,numero_suministro FROM registros_correo_pendientes WHERE id=$1', [id]);
        if (!datos) throw invalido();
        await bloquear(cliente, datos.correo, datos.numero_suministro);
        const { rows: [r] } = await cliente.query(`SELECT *,
            vence_en>clock_timestamp() AS vigente,
            codigo_vence_en>clock_timestamp() AS codigo_vigente
            FROM registros_correo_pendientes WHERE id=$1 FOR UPDATE`, [id]);
        if (!r || !r.vigente || r.consumido_en || r.invalidado || r.intentos >= OTP_MAX_ATTEMPTS) throw invalido();
        return r;
    }
    return {
        async registrar(body = {}) {
            disponible();
            const correo = typeof body.correo === 'string' ? body.correo.trim().toLowerCase() : '';
            const suministro = typeof body.numero_suministro === 'string' ? body.numero_suministro.trim() : '';
            const password = body.password;
            if (correo.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
                throw new ErrorRegistro(400, 'Correo electrónico inválido.');
            }
            if (!/^\d{9}$/.test(suministro)) throw new ErrorRegistro(400, 'El número de suministro debe contener 9 dígitos.');
            if (typeof password !== 'string' || password.length < 8 || password.length > 128 ||
                !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
                throw new ErrorRegistro(400, 'La contraseña debe tener entre 8 y 128 caracteres, al menos una letra y un número.');
            }
            const claveHash = generarClaveHash(password);
            return transaccion(async cliente => {
                await bloquear(cliente, correo, suministro);
                await comprobarEnvios(cliente, correo, suministro);
                await comprobarCuenta(cliente, correo, suministro);
                // Una nueva solicitud sustituye las anteriores para el mismo correo.
                const { rows: anteriores } = await cliente.query(`UPDATE registros_correo_pendientes
                    SET invalidado=TRUE,clave_hash='',codigo_hash=$2
                    WHERE correo=$1 AND consumido_en IS NULL AND NOT invalidado RETURNING id`, [correo, '0'.repeat(64)]);
                for (const anterior of anteriores) await cancelarEventos(cliente, anterior.id);
                const id = crypto.randomUUID();
                await cliente.query(`INSERT INTO registros_correo_pendientes
                    (id,correo,numero_suministro,clave_hash,codigo_hash,codigo_vence_en,vence_en)
                    VALUES ($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+make_interval(secs=>$6))`,
                [id, correo, suministro, claveHash, '0'.repeat(64), REGISTRATION_TTL_SECONDS]);
                return enviar(cliente, { id, correo });
            });
        },
        async reenviar(body = {}) {
            disponible();
            if (!uuid(body.registro_id)) throw invalido();
            return transaccion(async cliente => {
                const r = await buscar(cliente, body.registro_id);
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
                const r = await buscar(cliente, body.registro_id);
                const { rows: [o] } = await cliente.query(`SELECT o.estado,o.iniciado_en FROM public.correo_outbox o
                    JOIN public.registros_correo_envios e ON e.id=o.id WHERE e.registro_id=$1
                    AND o.codigo_hash=$2 ORDER BY o.creado_en DESC,o.id LIMIT 1`, [r.id,r.codigo_hash]);
                const estados = { pendiente:'en_cola',reintento:'en_cola',procesando:'procesando',aceptado:'aceptado',
                    fallido:'fallido',caducado:'caducado',cancelado:'cancelado',ambiguo:'ambiguo' };
                return { estado:'pendiente',registro_id:r.id,estado_envio:o ? estados[o.estado] : 'anterior',
                    vence_en:o && !o.iniciado_en ? null : r.codigo_vence_en,solicitud_vence_en:r.vence_en };
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
                    usuario: { numero_suministro: r.numero_suministro } };
            });
            if (!resultado) throw invalido();
            return resultado;
        }
    };
}

function registrarRutasCorreo(app, servicio, { registro, verificacion, reenvio, consulta }) {
    for (const [ruta, accion, limite, status] of [
        ['register', 'registrar', registro, 202], ['verify-email', 'verificar', verificacion, 201],
        ['resend-verification', 'reenviar', reenvio, 202], ['verification-status', 'consultar', consulta, 200]
    ]) {
        app.post(`/api/auth/${ruta}`, limite, async (req, res) => {
            res.set('Cache-Control', 'no-store');
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

module.exports = { crearRegistroCorreo, registrarRutasCorreo };
