'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { nuevaBase, sql } = require('./email-schema.cjs');
const { SCOPE } = require('../gmail-mail');
const { obtenerConfigCorreo } = require('../email-provider');
const { crearRegistroCorreo } = require('../email-registration');
const { abrirMensaje } = require('../mail-envelope');
const { descifrarMensaje } = require('../outbox-crypto');
test('Registro → outbox cifrada Gmail → proceso worker independiente simulado → confirmación OTP', async () => {
    const { pool, connection } = await nuevaBase('gmail_worker');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-gmail-worker-')); fs.chmodSync(dir, 0o700);
    const key = crypto.randomBytes(32), sender = 'fixture.sender@gmail.com', secret = crypto.randomBytes(32).toString('hex');
    try {
        await pool.query(sql('init.sql')); await pool.query(sql('migrations/006_correo_outbox.sql'));
        const config = obtenerConfigCorreo({ EMAIL_PROVIDER: 'gmail', GMAIL_SENDER: sender, EMAIL_OTP_SECRET: secret }, { requiereApiKey: false });
        const service = crearRegistroCorreo({ pool, key, from: config.from, proveedor: config.provider, secreto: secret,
            altasHabilitadas: true, generarClaveHash: () => 'fixture-scrypt-hash', verificarClave: () => true });
        const registered = await service.registrar({ solicitud_id: crypto.randomUUID(), correo: 'worker@example.invalid', numero_suministro: '979000001', password: 'FixtureOnly123!' });
        assert.equal(registered.estado_envio, 'en_cola');
        const job = (await pool.query('SELECT o.* FROM correo_outbox o JOIN registros_correo_envios e ON e.id=o.id WHERE e.registro_id=$1', [registered.registro_id])).rows[0];
        const envelope = abrirMensaje(descifrarMensaje(job.payload, key, job.id, registered.registro_id));
        assert.equal(envelope.proveedor, 'gmail');
        const code = JSON.parse(envelope.mensaje).text.match(/: (\d{6})/)[1];
        const credentialFile = path.join(dir, 'credentials.json'), mailbox = path.join(dir, 'mail.txt');
        fs.writeFileSync(credentialFile, JSON.stringify({ type: 'authorized_user', client_type: 'desktop', sender, scope: SCOPE,
            client_id: 'fixture.apps.googleusercontent.com', client_secret: 'fixture-secret', refresh_token: 'fixture-refresh' }), { mode: 0o600 });
        const env = { ...process.env, EMAIL_PROVIDER: 'gmail', GMAIL_SENDER: sender, GMAIL_CREDENTIALS_FILE: credentialFile,
            EMAIL_WORKER_ENABLED: '1', EMAIL_WORKER_DATABASE_URL: `postgres://hm_fixture:fixture-only-not-production@127.0.0.1:${connection.port}/${connection.database}`,
            EMAIL_WORKER_EXPECTED_DATABASE: connection.database, EMAIL_OUTBOX_KEY: key.toString('base64'), HIDRO_GMAIL_TEST_MAILBOX: mailbox };
        delete env.RESEND_API_KEY;
        const stdout = execFileSync(process.execPath, ['--require', path.join(__dirname, 'gmail-fixture.cjs'),
            path.join(__dirname, '../workers/email-outbox.cjs'), '--once'], { env, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
        assert.equal(JSON.parse(stdout).estado, 'aceptado'); assert.equal(fs.readFileSync(mailbox, 'utf8'), 'accepted\n');
        for (const privateValue of [code, sender, 'fixture-refresh', 'fixture-secret', key.toString('base64')]) assert.ok(!stdout.includes(privateValue));
        const accepted = (await pool.query('SELECT * FROM correo_outbox WHERE id=$1', [job.id])).rows[0];
        assert.equal(accepted.payload, null); assert.equal(accepted.intentos, 1); assert.equal(accepted.proveedor_id, 'fixture-gmail-message');
        await service.verificar({ registro_id: registered.registro_id, codigo: code });
        assert.equal(+(await pool.query('SELECT count(*) n FROM usuarios')).rows[0].n, 1);
        assert.equal(+(await pool.query('SELECT count(*) n FROM suministros')).rows[0].n, 1);
    } finally { await pool.end(); fs.rmSync(dir, { recursive: true }); }
});
