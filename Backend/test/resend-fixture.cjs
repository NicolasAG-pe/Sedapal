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
    fs.appendFileSync(process.env.HIDRO_TEST_MAILBOX, JSON.stringify({ correo: body.to[0], codigo })+'\n', { mode: 0o600 });
    return Response.json({ id: crypto.randomUUID() });
};
