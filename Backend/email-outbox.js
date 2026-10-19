'use strict';
const crypto = require('node:crypto');
const { cifrarMensaje, descifrarMensaje, idClave } = require('./outbox-crypto');
const { construirMensaje } = require('./resend-mail');
const { OTP_TTL_SECONDS } = require('./email-otp');
const activos = "('pendiente','procesando','reintento')";

async function encolarCorreo(client, { registroId, correo, codigo, hash, from, key }) {
    const id = crypto.randomUUID();
    const payload = cifrarMensaje(construirMensaje(from, correo, codigo), key, id, registroId);
    await client.query('INSERT INTO public.registros_correo_envios(id,registro_id) VALUES ($1,$2)', [id, registroId]);
    await client.query('INSERT INTO public.correo_outbox(id,codigo_hash,payload,clave_id) VALUES ($1,$2,$3,$4)', [id, hash, payload, idClave(key)]);
    return id;
}
async function cancelarEventos(client, registroId) {
    await client.query(`UPDATE public.correo_outbox o SET estado='cancelado',payload=NULL,
        lease_token=NULL,bloqueado_hasta=NULL,finalizado_en=clock_timestamp() FROM public.registros_correo_envios e
        WHERE e.id=o.id AND e.registro_id=$1 AND o.estado IN ${activos}`, [registroId]);
}

function crearProcesadorOutbox({ pool, key, enviarCodigo }) {
    async function tx(fn) {
        const client = await pool.connect(); let discard;
        try {
            await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
            await client.query("SET LOCAL lock_timeout='1s'");
            await client.query("SET LOCAL statement_timeout='5s'");
            const result = await fn(client); await client.query('COMMIT'); return result;
        } catch (error) {
            try { await client.query('ROLLBACK'); } catch (_) { discard = new Error('Descartar conexión outbox.'); }
            throw error;
        } finally { client.release(discard); }
    }
    async function terminal(client, id, estado, error = null) {
        await client.query(`UPDATE public.correo_outbox SET estado=$2,payload=NULL,
            lease_token=NULL,bloqueado_hasta=NULL,ultimo_error=$3,finalizado_en=clock_timestamp() WHERE id=$1`, [id, estado, error]);
    }
    async function tomar() {
        const { rows: candidates } = await pool.query(`SELECT o.id,e.registro_id,p.correo,p.numero_suministro
            FROM public.correo_outbox o JOIN public.registros_correo_envios e ON e.id=o.id
            JOIN public.registros_correo_pendientes p ON p.id=e.registro_id
            WHERE (o.estado IN ('pendiente','reintento') AND o.disponible_en<=clock_timestamp())
                OR (o.estado='procesando' AND o.bloqueado_hasta<=clock_timestamp())
            ORDER BY o.disponible_en,o.id LIMIT 20`);
        for (const c of candidates) {
            const result = await tx(async client => {
                // Mismo orden que registro/reenvío; nunca bloquear primero la outbox.
                for (const identity of [`correo:${c.correo}`, `suministro:${c.numero_suministro}`].sort()) {
                    const { rows: [lock] } = await client.query('SELECT pg_try_advisory_xact_lock(7401,hashtext($1)) AS ok', [identity]);
                    if (!lock.ok) return null;
                }
                const { rows: [p] } = await client.query(`SELECT id,invalidado,consumido_en,codigo_hash,intentos,vence_en
                    FROM public.registros_correo_pendientes
                    WHERE id=$1 FOR UPDATE SKIP LOCKED`, [c.registro_id]);
                if (!p) return null;
                const { rows: [o] } = await client.query(`SELECT * FROM public.correo_outbox WHERE id=$1
                    AND ((estado IN ('pendiente','reintento') AND disponible_en<=clock_timestamp())
                    OR (estado='procesando' AND bloqueado_hasta<=clock_timestamp())) FOR UPDATE SKIP LOCKED`, [c.id]);
                if (!o) return null;
                if (o.clave_id !== idClave(key)) return { estado: 'clave_incompatible' };
                if (p.invalidado || p.consumido_en || p.codigo_hash !== o.codigo_hash || p.intentos >= 5) {
                    await terminal(client, o.id, 'cancelado'); return { estado: 'cancelado' };
                }
                const { rows: [clock] } = await client.query('SELECT clock_timestamp() AS ahora');
                const now = clock.ahora.getTime(), recovered = o.estado === 'procesando';
                const ambiguous = o.hubo_ambiguedad || recovered;
                if (p.vence_en.getTime() <= now || o.intentos >= 5 ||
                    (o.enviar_hasta && o.enviar_hasta.getTime() <= now) ||
                    (!o.iniciado_en && p.vence_en.getTime() < now + OTP_TTL_SECONDS * 1000)) {
                    await terminal(client, o.id, ambiguous ? 'ambiguo' : 'caducado', 'caducado');
                    return { estado: ambiguous ? 'ambiguo' : 'caducado' };
                }
                const expiry = o.codigo_vence_en || new Date(now + OTP_TTL_SECONDS * 1000);
                const cutoff = o.enviar_hasta || new Date(expiry.getTime() - 30000);
                if (!o.iniciado_en) await client.query(`UPDATE public.registros_correo_pendientes
                    SET codigo_vence_en=$2 WHERE id=$1`, [p.id, expiry]);
                const token = crypto.randomUUID();
                await client.query(`UPDATE public.correo_outbox SET estado='procesando',intentos=intentos+1,
                    iniciado_en=COALESCE(iniciado_en,$2),codigo_vence_en=$3,enviar_hasta=$4,
                    lease_token=$5,bloqueado_hasta=$2+INTERVAL '60 seconds',hubo_ambiguedad=$6 WHERE id=$1`,
                [o.id, clock.ahora, expiry, cutoff, token, ambiguous]);
                return { ...o, registro_id: p.id, token, enviar_hasta: cutoff, intentos: o.intentos + 1,
                    hubo_ambiguedad: ambiguous, estado: 'procesando' };
            });
            if (result) return result;
        }
        return null;
    }
    async function finalizar(job, outcome) {
        return tx(async client => {
            const { rows: [o] } = await client.query(`SELECT *,clock_timestamp() AS ahora FROM public.correo_outbox
                WHERE id=$1 AND lease_token=$2 AND estado='procesando' FOR UPDATE`, [job.id, job.token]);
            if (!o) return 'sin_lease';
            if (outcome.id) {
                await client.query(`UPDATE public.correo_outbox SET estado='aceptado',payload=NULL,
                    aceptado_en=clock_timestamp(),finalizado_en=clock_timestamp(),proveedor_id=$3,lease_token=NULL,bloqueado_hasta=NULL,ultimo_error=NULL
                    WHERE id=$1 AND lease_token=$2`, [job.id, job.token, outcome.id]);
                return 'aceptado';
            }
            const tipo = ['transitorio','permanente','ambiguo','cifrado','caducado'].includes(outcome.tipo) ? outcome.tipo : 'ambiguo';
            const ambiguous = o.hubo_ambiguedad || tipo === 'ambiguo';
            if (['permanente','cifrado'].includes(tipo)) {
                await terminal(client, job.id, ambiguous ? 'ambiguo' : 'fallido', tipo); return ambiguous ? 'ambiguo' : 'fallido';
            }
            const delay = Math.max([5,15,45,90,90][o.intentos - 1] + crypto.randomInt(0, 3),
                Math.min(300, Math.max(0, Number(outcome.retryAfter) || 0)));
            if (tipo === 'caducado' || o.intentos >= 5 || o.ahora.getTime() + delay * 1000 >= o.enviar_hasta.getTime()) {
                await terminal(client, job.id, ambiguous ? 'ambiguo' : 'caducado', tipo); return ambiguous ? 'ambiguo' : 'caducado';
            }
            await client.query(`UPDATE public.correo_outbox SET estado='reintento',disponible_en=clock_timestamp()+make_interval(secs=>$3),
                lease_token=NULL,bloqueado_hasta=NULL,ultimo_error=$4,hubo_ambiguedad=$5 WHERE id=$1 AND lease_token=$2`,
            [job.id, job.token, delay, tipo, ambiguous]);
            return 'reintento';
        });
    }
    async function procesarUno() {
        const job = await tomar();
        if (!job || job.estado !== 'procesando') return { estado: job?.estado || 'vacio' };
        // Revalidar lease y sustituciones después del COMMIT y antes del intento externo.
        const budgetStarted = performance.now();
        const { rows: [live] } = await pool.query(`SELECT EXTRACT(EPOCH FROM (enviar_hasta-clock_timestamp()))*1000 AS restante
            FROM public.correo_outbox WHERE id=$1 AND lease_token=$2 AND estado='procesando'
            AND bloqueado_hasta>clock_timestamp()`, [job.id, job.token]);
        if (!live) return { estado: 'sin_lease' };
        const limiteMonotono = budgetStarted + Number(live.restante);
        const remaining = limiteMonotono - performance.now();
        if (remaining <= 0) return { estado: await finalizar(job, { tipo: 'caducado' }) };
        // Presupuesto calculado por PostgreSQL; no depende del desfase absoluto de relojes.
        const enviarHasta = new Date(Date.now() + Math.floor(remaining));
        let mensaje;
        try { mensaje = descifrarMensaje(job.payload, key, job.id, job.registro_id); }
        catch (_) { return { estado: await finalizar(job, { tipo: 'cifrado' }) }; }
        let outcome;
        try {
            const result = await enviarCodigo({ mensaje, envioId: job.id, enviarHasta, limiteMonotono });
            outcome = result && typeof result.id === 'string' && result.id.length <= 120 ? result : { tipo: 'ambiguo' };
        } catch (error) { outcome = { tipo: error.tipo, retryAfter: error.retryAfter }; }
        finally { mensaje = undefined; }
        return { estado: await finalizar(job, outcome) };
    }
    return { procesarUno, tomar, finalizar };
}
module.exports = { encolarCorreo, cancelarEventos, crearProcesadorOutbox };
