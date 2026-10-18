'use strict';
const { setTimeout: esperar } = require('node:timers/promises');
const { validarSecreto } = require('./email-otp');

function obtenerConfigCorreo(env = process.env) {
    const apiKey = String(env.RESEND_API_KEY || '').trim();
    const from = String(env.RESEND_FROM || '').trim();
    const secreto = String(env.EMAIL_OTP_SECRET || '');
    if (!apiKey || !from || !secreto) return null;
    validarSecreto(secreto);
    if (secreto === env.AUTH_TOKEN_SECRET) throw new Error('Usa un EMAIL_OTP_SECRET exclusivo.');
    if (/[\r\n]/.test(from) || !/^(?:[^<>]+ <)?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$/.test(from)) {
        throw new Error('RESEND_FROM debe contener un remitente válido.');
    }
    return { apiKey, from, secreto };
}

function crearRemitente(config, { fetchImpl = fetch, sleep = esperar, timeoutMs = 10000 } = {}) {
    if (!config) return null;
    return async function enviarCodigo({ correo, codigo, envioId }) {
        if (!/^\d{6}$/.test(codigo) || !/^[a-f0-9-]{36}$/.test(envioId)) {
            throw new Error('Datos de envío inválidos.');
        }
        const body = JSON.stringify({
            from: config.from, to: [correo],
            subject: 'Verifica tu correo en Hidro-Mejora',
            text: `Tu código de verificación es: ${codigo}. Vence en 5 minutos. No lo compartas. Si no solicitaste esta cuenta, ignora este mensaje.`,
            html: `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Verifica tu correo</title></head><body style="font:16px sans-serif;line-height:1.5"><h1>Verifica tu correo en Hidro-Mejora</h1><p>Ingresa este código en la aplicación:</p><p style="font:32px monospace;letter-spacing:4px">${codigo}</p><p>Vence en 5 minutos. No lo compartas.</p><p>Si no solicitaste esta cuenta, ignora este mensaje.</p></body></html>`
        });
        // Mismo cuerpo y clave para ambos intentos del mismo envío lógico.
        for (let intento = 0; intento < 2; intento++) {
            let reintentable = true;
            try {
                const respuesta = await fetchImpl('https://api.resend.com/emails', {
                    method: 'POST', redirect: 'error',
                    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json',
                        'Idempotency-Key': `verificacion-correo/${envioId}` },
                    body, signal: AbortSignal.timeout(timeoutMs)
                });
                reintentable = respuesta.status === 429 || respuesta.status >= 500;
                if (respuesta.ok) {
                    const data = await respuesta.json();
                    if (typeof data.id === 'string' && data.id) return;
                    reintentable = false;
                } else {
                    // No leer ni registrar el cuerpo de error del proveedor.
                    await respuesta.body?.cancel();
                }
            } catch (_) {
                // Nunca propagar cabeceras, destinatarios, códigos o errores de fetch.
            }
            if (!reintentable || intento === 1) break;
            await sleep(1000);
        }
        const error = new Error('No se pudo enviar el código. Intenta nuevamente más tarde.');
        error.code = 'EMAIL_DELIVERY_FAILED';
        throw error;
    };
}

module.exports = { obtenerConfigCorreo, crearRemitente };
