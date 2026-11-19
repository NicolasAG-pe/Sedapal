// Buzón del entorno de revisión, también para los workers ejecutados por separado.
'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const fetchLocal = global.fetch;
global.fetch = async function (url, options) {
  if (String(url) === 'https://api.resend.com/emails') {
    const {to,subject,text} = JSON.parse(options.body);
    const code = text.match(/:\s*(\d{6,8})\b/)?.[1];
    fs.appendFileSync(process.env.HIDRO_TEST_MAILBOX, JSON.stringify({to,subject,code})+'\n',{mode:0o600});
    return Response.json({id:crypto.randomUUID()});
  }
  if (!['127.0.0.1','localhost'].includes(new URL(url).hostname)) throw Error('La revisión utiliza solo servicios locales.');
  return fetchLocal(url,options);
};
