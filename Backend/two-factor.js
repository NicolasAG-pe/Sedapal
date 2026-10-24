'use strict';
const crypto = require('node:crypto');
const OTPAuth = require('otpauth');
const QRCode = require('qrcode');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = (status, mensaje) => ({ error: { status, mensaje } });
const invalid = () => fail(401, 'Código inválido, vencido o ya utilizado.');
const recoveryHash = (id, code) => sha('hidro-recovery-v1:' + id + ':' + code);
const sessionEnded = () => ({ error: { status: 401, codigo: 'SESSION_REAUTH_REQUIRED', mensaje: 'Inicia sesión nuevamente para continuar.' } });

// Un token anterior sigue siendo válido solo para una cuenta que nunca cambió 2FA.
function permiteSesion(token, row) {
    const version = Number(row.mfa_version || 0);
    return token.rol === row.rol && (!token.token_use || token.token_use === 'access') && (token.mfa_version ?? 0) === version && (!row.mfa_activo ||
        (Array.isArray(token.amr) && token.amr.includes('pwd') &&
        (token.amr.includes('otp') || token.amr.includes('recovery'))));
}
function crearDosFactores({ pool, verificarClave, emitirSesion, cerrarSockets = () => {}, env = process.env }) {
    function key() {
        const raw = env.TOTP_ENCRYPTION_KEY;
        if (typeof raw !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(raw)) return null;
        const result = Buffer.from(raw, 'base64');
        return result.length === 32 ? result : null;
    }
    function encrypt(secret, id) {
        const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
        cipher.setAAD(Buffer.from('hidro-totp-v1:' + id));
        return ['v1', iv.toString('base64'), Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]).toString('base64'), cipher.getAuthTag().toString('base64')].join('.');
    }
    function decrypt(value, id) {
        const parts = value.split('.'), [v, iv, text, tag] = parts;
        if (parts.length !== 4 || v !== 'v1' || [iv, text, tag].some(s => Buffer.from(s, 'base64').toString('base64') !== s) ||
            Buffer.from(iv, 'base64').length !== 12 || Buffer.from(tag, 'base64').length !== 16) throw new Error('Estado 2FA incompatible.');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
        decipher.setAAD(Buffer.from('hidro-totp-v1:' + id));decipher.setAuthTag(Buffer.from(tag, 'base64'));
        return Buffer.concat([decipher.update(Buffer.from(text, 'base64')), decipher.final()]).toString('utf8');
    }
    const totp = (secret, label = 'Cuenta') => new OTPAuth.TOTP({ issuer: 'Hidro-Mejora', label,
        algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) });
    async function tx(action) {
        const c = await pool.connect();let discard;
        try {
            await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='2s'");await c.query("SET LOCAL statement_timeout='10s'");
            const result = await action(c);await c.query('COMMIT');return result;
        } catch (e) { await c.query('ROLLBACK').catch(() => {discard=new Error('Conexión 2FA inválida.');});throw e; }
        finally { c.release(discard); }
    }
    async function account(c, id) {
        // Orden de locks uniforme: usuario, estado 2FA y después desafío/códigos.
        const { rows: [u] } = await c.query(`SELECT u.id_usuario,u.correo,u.clave_hash,u.rol,u.activo,
            s.id_suministro,s.numero_suministro FROM usuarios u JOIN suministros s USING(id_usuario)
            WHERE u.id_usuario=$1 FOR UPDATE OF u`, [id]);
        if (!u || u.activo !== true || u.rol !== 'usuario') return null;
        await c.query('INSERT INTO usuario_2fa(id_usuario) VALUES ($1) ON CONFLICT DO NOTHING', [id]);
        const { rows: [m] } = await c.query(`SELECT *,clock_timestamp() AS ahora FROM usuario_2fa WHERE id_usuario=$1 FOR UPDATE`, [id]);
        return { u, m, now: new Date(m.ahora).getTime() };
    }
    function locked(a) { return a.m.bloqueado_hasta && new Date(a.m.bloqueado_hasta).getTime() > a.now; }
    async function bad(c, a) {
        await c.query(`UPDATE usuario_2fa SET fallos=CASE WHEN bloqueado_hasta <= clock_timestamp() THEN 1 ELSE LEAST(fallos+1,5) END,
            bloqueado_hasta=CASE WHEN bloqueado_hasta <= clock_timestamp() THEN NULL WHEN fallos>=4 THEN clock_timestamp()+INTERVAL '15 minutes' ELSE bloqueado_hasta END
            WHERE id_usuario=$1`, [a.u.id_usuario]);
        return invalid();
    }
    async function factor(c, a, code) {
        if (typeof code !== 'string') return null;
        if (/^\d{6}$/.test(code)) {
            const delta = totp(decrypt(a.m.secreto, a.u.id_usuario)).validate({ token: code, timestamp: a.now, window: 1 });
            const step = Math.floor(a.now / 30000) + delta;
            if (delta === null || step <= Number(a.m.ultimo_paso)) return null;
            await c.query('UPDATE usuario_2fa SET ultimo_paso=$2 WHERE id_usuario=$1', [a.u.id_usuario, step]);
            return 'otp';
        }
        const normalized = code.trim().toUpperCase();
        if (!/^[A-F0-9]{8}(?:-[A-F0-9]{8}){3}$/.test(normalized)) return null;
        const r = await c.query(`UPDATE usuario_2fa_recuperacion SET usado_en=clock_timestamp()
            WHERE id_usuario=$1 AND codigo_hash=$2 AND usado_en IS NULL RETURNING codigo_hash`, [a.u.id_usuario, recoveryHash(a.u.id_usuario, normalized)]);
        return r.rowCount === 1 ? 'recovery' : null;
    }
    async function recovery(c, id) {
        // Invalida los anteriores sin conservar códigos reversibles.
        await c.query('UPDATE usuario_2fa_recuperacion SET usado_en=COALESCE(usado_en,clock_timestamp()) WHERE id_usuario=$1', [id]);
        const codes = Array.from({ length: 10 }, () => crypto.randomBytes(16).toString('hex').toUpperCase().match(/.{8}/g).join('-'));
        for (const code of codes) await c.query('INSERT INTO usuario_2fa_recuperacion(id_usuario,codigo_hash) VALUES ($1,$2)', [id, recoveryHash(id, code)]);
        return codes;
    }
    function currentActor(a, actor) {
        return actor && String(actor.id_usuario)===String(a.u.id_usuario) && actor.rol===a.u.rol && actor.mfa_version===a.m.version;
    }
    async function manage(id, body, action, actor, { active, totpOnly = false } = {}) {
        if (!key()) return fail(503, 'La verificación en dos pasos no está disponible.');
        return tx(async c => {
            const a = await account(c, id);
            if (!a) return fail(403, 'Acceso denegado.');
            if (!currentActor(a,actor)) return sessionEnded();
            if (a.m.activo!==active) return fail(409, active ? 'Activa primero la verificación en dos pasos.' : 'Desactiva el factor existente antes de configurar otro.');
            if (locked(a)) return fail(429, 'Demasiados intentos. Espera quince minutos.');
            if (!verificarClave(body.password, a.u.clave_hash)) return bad(c, a);
            let method = 'pwd';
            if (a.m.activo) {
                if (totpOnly && (typeof body.codigo!=='string' || !/^\d{6}$/.test(body.codigo))) return fail(400,'Para generar códigos nuevos usa tu autenticador. Si lo perdiste, desactiva y vuelve a configurar usando un código de recuperación.');
                method = await factor(c, a, body.codigo);
                if (!method) return bad(c, a);
            }
            const result = await action(c, a, method);
            if (!result.error) await c.query('UPDATE usuario_2fa SET fallos=0,bloqueado_hasta=NULL WHERE id_usuario=$1', [id]);
            return result;
        });
    }
    function session(u, version, method) {
        return { sessionUser: { ...u, mfa_version: version, amr: method === 'pwd' ? ['pwd'] : ['pwd', method] } };
    }
    async function finish(result) {
        if (!result.sessionUser) return result;
        const { sessionUser, ...rest } = result;
        // Ningún JWT ni cierre de sockets ocurre antes del COMMIT.
        await cerrarSockets(sessionUser.id_usuario);
        return { ...rest, ...emitirSesion(sessionUser) };
    }
    return {
        async status(id) {
            const { rows: [m] } = await pool.query(`SELECT activo,
                (SELECT count(*)::int FROM usuario_2fa_recuperacion r WHERE r.id_usuario=m.id_usuario AND usado_en IS NULL) AS recuperacion
                FROM usuario_2fa m WHERE id_usuario=$1`, [id]);
            return { estado: 'ok', activo: m?.activo || false, recuperacion: m?.recuperacion || 0,
                disponible: !!key() && (m?.activo || env.TOTP_ENROLLMENT_ENABLED === '1') };
        },
        async setup(id, body, actor) {
            if (env.TOTP_ENROLLMENT_ENABLED !== '1') return fail(503, 'La activación de dos factores no está disponible temporalmente.');
            return manage(id, body, async (c, a) => {
                if (a.m.activo) return fail(409, 'Desactiva el factor existente antes de configurar otro.');
                const secret = new OTPAuth.Secret({ size: 20 }).base32;
                const qr = await QRCode.toDataURL(totp(secret, a.u.correo).toString(), { errorCorrectionLevel: 'M', margin: 4, width: 300 });
                await c.query(`UPDATE usuario_2fa SET pendiente_secreto=$2,pendiente_hasta=clock_timestamp()+INTERVAL '5 minutes',
                    reautenticado_en=clock_timestamp() WHERE id_usuario=$1`, [id, encrypt(secret, id)]);
                return { estado: 'ok', qr, vence_en: new Date(a.now + 300000).toISOString() };
            },actor,{active:false});
        },
        async confirm(id, body, actor) {
            if (env.TOTP_ENROLLMENT_ENABLED !== '1') return fail(503, 'La activación de dos factores no está disponible temporalmente.');
            if (!key()) return fail(503, 'La verificación en dos pasos no está disponible.');
            const result = await tx(async c => {
                const a = await account(c, id);
                if (!a) return fail(403, 'Acceso denegado.');
                if (!currentActor(a,actor)) return sessionEnded();
                if (locked(a)) return fail(429, 'Demasiados intentos. Espera quince minutos.');
                if (a.m.activo || !a.m.pendiente_secreto) return invalid();
                if (new Date(a.m.pendiente_hasta).getTime() <= a.now || a.now - new Date(a.m.reautenticado_en).getTime() >= 300000) {
                    await c.query('UPDATE usuario_2fa SET pendiente_secreto=NULL,pendiente_hasta=NULL,reautenticado_en=NULL WHERE id_usuario=$1', [id]);
                    return invalid();
                }
                const delta = typeof body.codigo === 'string' && /^\d{6}$/.test(body.codigo) ?
                    totp(decrypt(a.m.pendiente_secreto, id)).validate({ token: body.codigo, timestamp: a.now, window: 1 }) : null;
                if (delta === null) return bad(c, a);
                await c.query(`UPDATE usuario_2fa SET activo=TRUE,secreto=pendiente_secreto,pendiente_secreto=NULL,
                    pendiente_hasta=NULL,reautenticado_en=NULL,ultimo_paso=$2,version=version+1,fallos=0,bloqueado_hasta=NULL WHERE id_usuario=$1`, [id, Math.floor(a.now / 30000) + delta]);
                return { estado: 'ok', codigos_recuperacion: await recovery(c, id), ...session(a.u, a.m.version + 1, 'otp') };
            });
            return finish(result);
        },
        async disable(id, body, actor) {
            const result = await manage(id, body, async (c, a) => {
                if (!a.m.activo) return fail(409, 'La verificación en dos pasos ya está desactivada.');
                await c.query(`UPDATE usuario_2fa SET activo=FALSE,secreto=NULL,pendiente_secreto=NULL,pendiente_hasta=NULL,
                    reautenticado_en=NULL,ultimo_paso=-1,version=version+1 WHERE id_usuario=$1`, [id]);
                await c.query('UPDATE usuario_2fa_recuperacion SET usado_en=COALESCE(usado_en,clock_timestamp()) WHERE id_usuario=$1', [id]);
                return { estado: 'ok', ...session(a.u, a.m.version + 1, 'pwd') };
            },actor,{active:true});
            return finish(result);
        },
        async regenerate(id, body, actor) {
            const result = await manage(id, body, async (c, a, method) => {
                if (!a.m.activo) return fail(409, 'Activa primero la verificación en dos pasos.');
                await c.query('UPDATE usuario_2fa SET version=version+1 WHERE id_usuario=$1', [id]);
                return { estado: 'ok', codigos_recuperacion: await recovery(c, id), ...session(a.u, a.m.version + 1, method) };
            },actor,{active:true,totpOnly:true});
            return finish(result);
        },
        async challenge(u) {
            const opaque = crypto.randomBytes(32).toString('base64url');
            return tx(async c => {
                const a = await account(c,u.id_usuario);
                if (!a || !a.m.activo || a.m.version !== u.mfa_version || a.u.clave_hash !== u.clave_hash) return invalid();
                if (locked(a)) return fail(429, 'Demasiados intentos. Espera quince minutos.');
                const { rows: [count] } = await c.query(`SELECT count(*)::int n FROM desafios_2fa
                    WHERE id_usuario=$1 AND usado_en IS NULL AND vence_en>clock_timestamp()`, [u.id_usuario]);
                if (count.n >= 10) return fail(429, 'Demasiados desafíos. Espera cinco minutos antes de reintentar.');
                await c.query(`INSERT INTO desafios_2fa(id_hash,id_usuario,version,clave_huella,vence_en)
                    VALUES ($1,$2,$3,$4,clock_timestamp()+INTERVAL '5 minutes')`, [sha(opaque), u.id_usuario, u.mfa_version, sha(u.clave_hash)]);
                return { estado: 'segundo_factor', desafio: opaque, vence_en: new Date(a.now + 300000).toISOString(),
                    mensaje: 'Ingresa tu código de autenticador o recuperación. Si tu aplicación no lo permite, actualízala.' };
            });
        },
        async login(body) {
            if (!key()) return fail(503, 'La verificación en dos pasos no está disponible.');
            if (typeof body.desafio !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.desafio)) return invalid();
            const hash = sha(body.desafio);
            const result = await tx(async c => {
                const { rows: [identity] } = await c.query('SELECT id_usuario FROM desafios_2fa WHERE id_hash=$1', [hash]);
                if (!identity) return invalid();
                const a = await account(c, identity.id_usuario);
                if (!a || !a.m.activo) return invalid();
                const { rows: [d] } = await c.query('SELECT * FROM desafios_2fa WHERE id_hash=$1 FOR UPDATE', [hash]);
                if (locked(a)) return fail(429, 'Demasiados intentos. Espera quince minutos.');
                if (!d || d.usado_en || d.intentos >= 5 || new Date(d.vence_en).getTime() <= a.now || d.version !== a.m.version || d.clave_huella !== sha(a.u.clave_hash)) return invalid();
                const method = await factor(c, a, body.codigo);
                if (!method) {
                    await c.query('UPDATE desafios_2fa SET intentos=intentos+1 WHERE id_hash=$1', [hash]);return bad(c, a);
                }
                await c.query('UPDATE desafios_2fa SET usado_en=clock_timestamp() WHERE id_hash=$1', [hash]);
                await c.query('UPDATE usuario_2fa SET fallos=0,bloqueado_hasta=NULL WHERE id_usuario=$1', [a.u.id_usuario]);
                return { estado: 'ok', ...session(a.u, a.m.version, method) };
            });
            // Iniciar sesión no desconecta otros dispositivos ya autenticados.
            if (!result.sessionUser) return result;
            return { estado: 'ok', ...emitirSesion(result.sessionUser) };
        }
    };
}
module.exports = { crearDosFactores, permiteSesion };
