'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { obtenerClaveOutbox, cifrarMensaje, descifrarMensaje } = require('../outbox-crypto');
const { configurar, main, ERROR } = require('../workers/email-outbox.cjs');
test('AES-GCM autentica cuerpo, identidad, registro y clave; nonces distintos', () => {
    const key = crypto.randomBytes(32), body = JSON.stringify({ codigo: '123456' });
    const encrypted = cifrarMensaje(body, key, 'evento', 'registro');
    assert.equal(descifrarMensaje(encrypted, key, 'evento', 'registro'), body);
    assert.notDeepEqual(encrypted, cifrarMensaje(body, key, 'evento', 'registro'));
    assert.equal(encrypted.includes(Buffer.from('123456')), false);
    for (const [k, id, reg] of [[crypto.randomBytes(32),'evento','registro'],[key,'otro','registro'],[key,'evento','otro']]) {
        assert.throws(() => descifrarMensaje(encrypted, k, id, reg));
    }
    const altered = Buffer.from(encrypted); altered[altered.length - 1] ^= 1;
    assert.throws(() => descifrarMensaje(altered,key,'evento','registro'));
});
test('Clave exclusiva, canónica de 32 bytes; rechaza reutilización aun con otra codificación', () => {
    const key = crypto.randomBytes(32), raw = key.toString('base64');
    assert.deepEqual(obtenerClaveOutbox({ EMAIL_OUTBOX_KEY: raw }), key);
    for (const env of [{}, {EMAIL_OUTBOX_KEY:'corta'}, {EMAIL_OUTBOX_KEY:raw,EMAIL_OTP_SECRET:raw},
        {EMAIL_OUTBOX_KEY:raw,AUTH_TOKEN_SECRET:key.toString('hex')}]) assert.throws(() => obtenerClaveOutbox(env));
});
test('CLI desactivado por defecto y errores sin credenciales; no usa DATABASE_URL', async () => {
    let out = '', err = '';
    const streams = { stdout:{write:s=>{out+=s;}}, stderr:{write:s=>{err+=s;}} };
    assert.equal(await main([], {}, streams), 0); assert.match(out,/desactivado/); assert.equal(err,'');
    assert.equal(await main(['--once'], { DATABASE_URL:'postgres://private.invalid/db' }, streams), 1);
    assert.equal(err,ERROR); assert.equal(err.includes('private.invalid'),false);
    assert.throws(() => configurar({ EMAIL_WORKER_ENABLED:'1',RESEND_API_KEY:'synthetic',
        EMAIL_WORKER_DATABASE_URL:'postgres://example.invalid/one',EMAIL_WORKER_EXPECTED_DATABASE:'two' }));
});
test('Adaptador no inicia HTTP tras vencer presupuesto SQL/monótono o plazo local', async () => {
    const { crearRemitente }=require('../resend-mail');
    let calls=0;
    const send=crearRemitente({apiKey:'fixture'},{maxAttempts:1,fetchImpl:async()=>{calls++;return Response.json({id:'fixture'});}});
    const data={mensaje:'{}',envioId:crypto.randomUUID()};
    await assert.rejects(send({...data,enviarHasta:new Date(Date.now()+300000),limiteMonotono:performance.now()-1}),{tipo:'caducado'});
    await assert.rejects(send({...data,enviarHasta:new Date(Date.now()-1)}),{tipo:'caducado'});
    await assert.rejects(send({...data,enviarHasta:'invalido'}));
    assert.equal(calls,0);
});
