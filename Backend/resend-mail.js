'use strict';
const { setTimeout: esperar } = require('node:timers/promises');
const { validarSecreto } = require('./email-otp');

function obtenerConfigCorreo(env = process.env, { requiereApiKey = true } = {}) {
    const apiKey = String(env.RESEND_API_KEY || '').trim();
    const from = String(env.RESEND_FROM || '').trim();
    const secreto = String(env.EMAIL_OTP_SECRET || '');
    if ((requiereApiKey && !apiKey) || !from || !secreto) return null;
    validarSecreto(secreto);
    if (secreto === env.AUTH_TOKEN_SECRET) throw new Error('Usa un EMAIL_OTP_SECRET exclusivo.');
    if (/[\r\n]/.test(from) || !/^(?:[^<>]+ <)?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$/.test(from)) {
        throw new Error('RESEND_FROM debe contener un remitente válido.');
    }
    return { apiKey, from, secreto };
}

function construirMensaje(from, correo, codigo) {
    return JSON.stringify({
            from: from, to: [correo],
            subject: 'Verifica tu correo en Hidro-Mejora',
            text: `Tu código de verificación es: ${codigo}. Vence en 5 minutos. No lo compartas. Si no solicitaste esta cuenta, ignora este mensaje.`,
            html: `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Verifica tu correo</title></head><body style="font:16px sans-serif;line-height:1.5"><h1>Verifica tu correo en Hidro-Mejora</h1><p>Ingresa este código en la aplicación:</p><p style="font:32px monospace;letter-spacing:4px">${codigo}</p><p>Vence en 5 minutos. No lo compartas.</p><p>Si no solicitaste esta cuenta, ignora este mensaje.</p></body></html>`
        });
}

function crearRemitente(config, { fetchImpl = fetch, sleep = esperar, timeoutMs = 10000, maxAttempts = 2 } = {}) {
    if (!config) return null;
    if (![1, 2].includes(maxAttempts) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw new Error('Límites de envío inválidos.');
    return async function enviarCodigo({ correo, codigo, envioId, mensaje, enviarHasta }) {
        if ((mensaje === undefined && !/^\d{6}$/.test(codigo)) || !/^[a-f0-9-]{36}$/.test(envioId)) {
            throw new Error('Datos de envío inválidos.');
        }
        const body = mensaje === undefined ? construirMensaje(config.from, correo, codigo) : mensaje;
        if (typeof body !== 'string' || body.length > 16384) throw new Error('Mensaje inválido.');
        const deadline = enviarHasta === undefined ? Infinity : new Date(enviarHasta).getTime();
        if (Number.isNaN(deadline)) throw new Error('Plazo de envío inválido.');
        // Mismo cuerpo y clave para ambos intentos del mismo envío lógico.
        let tipo = 'ambiguo', retryAfter = 0;
        for (let intento = 0; intento < maxAttempts; intento++) {
            const remaining = deadline - Date.now();
            if (remaining <= 0) { tipo = 'caducado'; break; }
            let reintentable = true;
            try {
                const respuesta = await fetchImpl('https://api.resend.com/emails', {
                    method: 'POST', redirect: 'error',
                    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json',
                        'Idempotency-Key': `verificacion-correo/${envioId}` },
                    body, signal: AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, Math.floor(remaining))))
                });
                reintentable = respuesta.status === 429 || respuesta.status === 409 || respuesta.status >= 500;
                tipo = reintentable ? (respuesta.status === 409 ? 'ambiguo' : 'transitorio') : 'permanente';
                retryAfter = Math.min(300, Math.max(0, Number(respuesta.headers?.get('Retry-After')) || 0));
                if (respuesta.ok) {
                    const data = await respuesta.json();
                    if (typeof data.id === 'string' && data.id && data.id.length <= 120) return { estado: 'aceptado', id: data.id };
                    tipo = 'ambiguo';
                    reintentable = false;
                } else {
                    // No leer ni registrar el cuerpo de error del proveedor.
                    await respuesta.body?.cancel();
                }
            } catch (_) {
                tipo = 'ambiguo';
                // Nunca propagar cabeceras, destinatarios, códigos o errores de fetch.
            }
            if (!reintentable || intento === maxAttempts - 1) break;
            await sleep(1000);
        }
        const error = new Error('No se pudo enviar el código. Intenta nuevamente más tarde.');
        error.code = 'EMAIL_DELIVERY_FAILED';
        error.tipo = tipo; error.retryAfter = retryAfter;
        throw error;
    };
}

module.exports = { obtenerConfigCorreo, crearRemitente, construirMensaje };
