'use strict';
// Preload exclusivo del harness; no se importa desde el servidor de producción.
const fs = require('node:fs');
const crypto = require('node:crypto');
const originalFetch = global.fetch;
if (!process.env.HIDRO_TEST_MAILBOX) throw new Error('Falta buzón sintético del harness.');
global.fetch = async (url, options) => {
    if (url !== 'https://api.resend.com/emails') return originalFetch(url, options);
    const body = JSON.parse(options.body);
    const codigo = body.text.match(/: (\d{6})/)[1];
    fs.appendFileSync(process.env.HIDRO_TEST_MAILBOX, JSON.stringify({ correo: body.to[0], codigo, envio:options.headers['Idempotency-Key'], cuerpo:options.body })+'\n', { mode: 0o600 });
    const delay=Number(process.env.HIDRO_TEST_PROVIDER_DELAY_MS || 0);
    if(delay>0 && delay<=2000)await new Promise(resolve=>setTimeout(resolve,delay));
    return Response.json({ id: crypto.randomUUID() });
};
