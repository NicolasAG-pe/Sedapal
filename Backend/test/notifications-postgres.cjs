'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { fork } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');
const { iniciar } = require('./email-api.cjs');
const { crearProcesadorOutbox } = require('../email-outbox');
const { createSender } = require('../notification-transport');
const { descifrarMensaje, cifrarMensaje } = require('../outbox-crypto');
const { envolverMensaje } = require('../mail-envelope');

test('OTP transaccional con Notifications en otro proceso; caída y reinicio no detienen API', async t => {
    const ctx = await iniciar({ autoDrain: false, databasePrefix: 'ms_notifications' });
    t.after(() => ctx.close());
    const key = Buffer.from(process.env.EMAIL_OUTBOX_KEY, 'base64'), secret = crypto.randomBytes(32).toString('hex');
    const reservation = net.createServer(); await new Promise(r => reservation.listen(0, '127.0.0.1', r));
    const port = reservation.address().port; await new Promise(r => reservation.close(r));
    let child, stopped, logs = '';
    async function start(provider = 'resend') {
        child = fork(path.resolve(__dirname, '../services/notifications/server.cjs'), [], { silent: true,
            env: { PATH: process.env.PATH, NODE_ENV: 'test', PORT: String(port), EMAIL_PROVIDER: provider, NOTIFICATIONS_INTERNAL_SECRET: secret, NOTIFICATIONS_DELIVERY_MODE: 'stub' } });
        child.stdout.on('data', b => { logs += b; }); child.stderr.on('data', b => { logs += b; });
        stopped = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
        await Promise.race([new Promise(resolve => child.once('message', resolve)), stopped.then(() => { throw Error('Notifications no arrancó'); }),
            new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('Arranque vencido')), 10000); timer.unref(); })]);
        assert.notEqual(child.pid, process.pid);
    }
    t.after(async () => { if (child?.exitCode === null && child?.signalCode === null) child.kill('SIGTERM'); await stopped; });
    await start();
    const worker = crearProcesadorOutbox({ pool: ctx.db, key,
        enviarCodigo: createSender({ url: 'http://127.0.0.1:' + port, secret }, 'resend') });
    const { data: pending } = await ctx.request('register', ctx.registro(701), 202);
    const { rows: [before] } = await ctx.db.query('SELECT o.*,e.registro_id FROM correo_outbox o JOIN registros_correo_envios e USING(id) WHERE e.registro_id=$1', [pending.registro_id]);
    const code = JSON.parse(descifrarMensaje(before.payload, key, before.id, before.registro_id)).text.match(/: (\d{6})/)[1];
    assert.equal(before.codigo_vence_en, null);
    assert.equal((await worker.procesarUno()).estado, 'aceptado');
    const { rows: [after] } = await ctx.db.query('SELECT * FROM correo_outbox WHERE id=$1', [before.id]);
    assert.ok(after.codigo_vence_en); assert.equal(after.payload, null); assert.equal(after.intentos, 1);
    await ctx.request('verify-email', ctx.verificar(pending.registro_id, code), 201);
    child.kill('SIGTERM'); assert.equal((await stopped).code, 0);
    assert.equal((await fetch(ctx.base + '/api/health')).status, 200);
    await ctx.request('register', ctx.registro(702), 202);
    assert.equal((await worker.procesarUno()).estado, 'reintento');
    await start();
    await ctx.db.query("UPDATE correo_outbox SET disponible_en=clock_timestamp() WHERE estado='reintento'");
    assert.equal((await worker.procesarUno()).estado, 'aceptado');
    child.kill('SIGTERM'); await stopped; await start('gmail');
    const { data: gmailPending } = await ctx.request('register', ctx.registro(703), 202);
    const { rows: [gmailJob] } = await ctx.db.query('SELECT o.*,e.registro_id FROM correo_outbox o JOIN registros_correo_envios e USING(id) WHERE e.registro_id=$1', [gmailPending.registro_id]);
    const message = descifrarMensaje(gmailJob.payload, key, gmailJob.id, gmailJob.registro_id);
    await ctx.db.query('UPDATE correo_outbox SET payload=$2 WHERE id=$1', [gmailJob.id,
        cifrarMensaje(envolverMensaje(message, 'gmail'), key, gmailJob.id, gmailJob.registro_id)]);
    let attempts = 0;
    const gmailWorker = crearProcesadorOutbox({ pool: ctx.db, key, proveedor: 'gmail',
        enviarCodigo: createSender({ url: 'http://127.0.0.1:' + port, secret }, 'gmail', {
            fetchImpl: async (...args) => { attempts++; const response = await fetch(...args); assert.equal(response.status, 200);
                await response.json(); throw Error('Respuesta perdida después de aceptación simulada'); }
        }) });
    assert.equal((await gmailWorker.procesarUno()).estado, 'ambiguo');
    assert.equal((await gmailWorker.procesarUno()).estado, 'vacio');
    assert.equal(attempts, 1);
    assert.equal((await ctx.db.query('SELECT payload FROM correo_outbox WHERE id=$1', [gmailJob.id])).rows[0].payload, null);
    for (const value of [secret, code, ctx.registro(701).correo, process.env.AUTH_TOKEN_SECRET]) assert.equal(logs.includes(value), false);
});
