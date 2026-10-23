'use strict';
// Solo test local explícito; jamás carga .env ni consulta Gmail real.
const fs = require('node:fs');
const { SCOPE, TOKEN_URL } = require('../gmail-mail');
if (!process.env.HIDRO_GMAIL_TEST_MAILBOX) throw new Error('Falta barrera de fixture Gmail.');
global.fetch = async (url, options) => {
    if (url === TOKEN_URL) return Response.json({ access_token: 'fixture-gmail-access', expires_in: 3600, scope: SCOPE });
    if (url !== 'https://gmail.googleapis.com/gmail/v1/users/fixture.sender%40gmail.com/messages/send') throw new Error('Destino no permitido por fixture.');
    const raw = JSON.parse(options.body).raw;
    if (!Buffer.from(raw, 'base64url').toString().includes('To: worker@example.invalid')) throw new Error('Destinatario de fixture inesperado.');
    fs.appendFileSync(process.env.HIDRO_GMAIL_TEST_MAILBOX, 'accepted\n', { mode: 0o600 });
    return Response.json({ id: 'fixture-gmail-message' });
};
