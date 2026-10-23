'use strict';
const resend = require('./resend-mail');
const gmail = require('./gmail-mail');
function proveedor(env) {
    const name = env.EMAIL_PROVIDER || 'resend';
    if (!['resend', 'gmail'].includes(name)) throw new Error('EMAIL_PROVIDER debe ser resend o gmail.');
    return name;
}
function obtenerConfigCorreo(env = process.env, options = {}) {
    const provider = proveedor(env);
    const config = resend.obtenerConfigCorreo(provider === 'gmail' ? { ...env, RESEND_FROM: gmail.validarRemitente(env.GMAIL_SENDER) } : env,
        provider === 'gmail' ? { requiereApiKey: false } : options);
    return config && { ...config, provider };
}
function configurarProveedorWorker(env) {
    const provider = proveedor(env);
    if (provider === 'resend') {
        if (!env.RESEND_API_KEY?.trim()) throw new Error('Falta configuración privada de Resend.');
        return { provider, apiKey: env.RESEND_API_KEY.trim() };
    }
    const sender = gmail.validarRemitente(env.GMAIL_SENDER);
    return { provider, gmail: { sender, allowedRecipient: env.EMAIL_REGISTRATION_ALLOWED_EMAIL || null,
        credentials: gmail.validarCredenciales(gmail.leerJsonPrivado(env.GMAIL_CREDENTIALS_FILE), sender) } };
}
function crearRemitenteProveedor(config) {
    return config.provider === 'gmail' ? gmail.crearRemitenteGmail(config.gmail) : resend.crearRemitente({ apiKey: config.apiKey }, { maxAttempts: 1 });
}
module.exports = { proveedor, obtenerConfigCorreo, configurarProveedorWorker, crearRemitenteProveedor };
