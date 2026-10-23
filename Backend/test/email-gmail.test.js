'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { SCOPE, TOKEN_URL, TOKEN_INFO_URL, leerJsonPrivado, crearRemitenteGmail } = require('../gmail-mail');
const { obtenerConfigCorreo, configurarProveedorWorker } = require('../email-provider');
const { construirMensaje } = require('../resend-mail');
const { envolverMensaje, abrirMensaje } = require('../mail-envelope');
const { crearSolicitud, intercambiar, renovar, autorizar } = require('../../scripts/gmail-oauth.cjs');
const { crearRegistroCorreo } = require('../email-registration');
const sender = 'fixture.sender@gmail.com';
const credentials = { type: 'authorized_user', client_type: 'desktop', sender, scope: SCOPE,
    account_verified: true, account_check: 'tokeninfo_email',
    client_id: 'fixture.apps.googleusercontent.com', client_secret: 'synthetic-client-secret', refresh_token: 'synthetic-refresh-token' };
const request = (recipient = 'fixture@outlook.com') => ({ mensaje: construirMensaje(sender, recipient, '123456'), envioId: crypto.randomUUID() });
const oauth = () => Response.json({ access_token: 'synthetic-access-token', expires_in: 3600, scope: SCOPE });
test('Gmail conserva el cierre explícito de altas y reenvíos antes de consultar PostgreSQL', async () => {
    const service = crearRegistroCorreo({ pool: { connect() { throw new Error('No debe conectar'); } }, key: Buffer.alloc(32),
        from: sender, secreto: 's'.repeat(64), proveedor: 'gmail', altasHabilitadas: false });
    await assert.rejects(service.registrar({}), { status: 503 });
    await assert.rejects(service.reenviar({}), { status: 503 });
});
test('MIME UTF-8, cuenta explícita, tres dominios y caché de access token sin clave idempotente ficticia', async () => {
    const calls = [];
    const send = crearRemitenteGmail({ sender, credentials }, { fetchImpl: async (url, options) => {
        calls.push({ url, options }); return url === TOKEN_URL ? oauth() : Response.json({ id: 'gmail-fixture' });
    } });
    for (const domain of ['gmail.com', 'outlook.com', 'hotmail.com']) {
        assert.equal((await send(request('fixture@' + domain))).id, 'gmail-fixture');
    }
    assert.equal(calls.filter(c => c.url === TOKEN_URL).length, 1);
    for (const c of calls.filter(c => c.url !== TOKEN_URL)) {
        assert.match(c.url, /users\/fixture.sender%40gmail.com\/messages\/send$/);
        assert.equal(c.options.redirect, 'error'); assert.equal(c.options.headers['Idempotency-Key'], undefined);
        const raw = JSON.parse(c.options.body).raw; assert.match(raw, /^[A-Za-z0-9_-]+$/);
        const mime = Buffer.from(raw, 'base64url').toString();
        assert.match(mime, /multipart\/alternative/); assert.match(mime, /Content-Transfer-Encoding: base64/);
        assert.match(mime, /Message-ID: </); assert.match(mime, /\r\nTo: fixture@(?:gmail|outlook|hotmail).com/);
        assert.ok(!mime.includes(credentials.refresh_token));
    }
});
test('Gmail nunca repite un POST ambiguo: 5xx, red, timeout, JSON inválido o aceptación sin ID', async () => {
    for (const scenario of ['500', 'network', 'timeout', 'json', 'missing-id']) {
        let posts = 0;
        const send = crearRemitenteGmail({ sender, credentials }, { fetchImpl: async (url) => {
            if (url === TOKEN_URL) return oauth(); posts++;
            if (scenario === '500') return new Response('', { status: 500 });
            if (scenario === 'json') return new Response('{');
            if (scenario === 'missing-id') return Response.json({});
            throw new Error('private provider details ' + credentials.refresh_token);
        } });
        await assert.rejects(send(request()), e => e.tipo === 'ambiguo' && !e.message.includes(credentials.refresh_token));
        assert.equal(posts, 1);
    }
});
test('rechazos explícitos de cuota pueden reintentarse; errores permanentes se conservan privados', async () => {
    for (const [status, reason, type] of [[429, '', 'transitorio'], [403, 'userRateLimitExceeded', 'transitorio'],
        [403, 'forbidden', 'permanente'], [400, '', 'permanente'], [401, '', 'transitorio']]) {
        let posts = 0;
        const send = crearRemitenteGmail({ sender, credentials }, { fetchImpl: async url => {
            if (url === TOKEN_URL) return oauth(); posts++;
            return Response.json({ error: { errors: [{ reason }], message: credentials.client_secret } }, { status, headers: { 'Retry-After': '30' } });
        } });
        await assert.rejects(send(request()), e => e.tipo === type && !e.message.includes(credentials.client_secret)); assert.equal(posts, 1);
    }
});
test('OAuth falla antes de enviar; vencimiento entre refresh y Gmail tampoco publica el mensaje', async () => {
    let sends = 0;
    const expired = { ...request(), limiteMonotono: performance.now() - 1 };
    const send = crearRemitenteGmail({ sender, credentials }, { fetchImpl: async () => { sends++; return oauth(); } });
    await assert.rejects(send(expired), { tipo: 'caducado' }); assert.equal(sends, 0);
    for (const status of [400, 503]) {
        const senderFn = crearRemitenteGmail({ sender, credentials }, { fetchImpl: async url => {
            assert.equal(url, TOKEN_URL); return new Response('', { status });
        } });
        await assert.rejects(senderFn(request()), { tipo: status === 400 ? 'permanente' : 'transitorio' });
    }
    let posts = 0;
    const delayed = crearRemitenteGmail({ sender, credentials }, { fetchImpl: async url => {
        if (url === TOKEN_URL) { await new Promise(r => setTimeout(r, 15)); return oauth(); }
        posts++; return Response.json({ id: 'wrong' });
    } });
    await assert.rejects(delayed({ ...request(), enviarHasta: new Date(Date.now() + 5) }), { tipo: 'caducado' }); assert.equal(posts, 0);
});
test('rechaza inyección de cabeceras, otro remitente y credenciales con más permisos', async () => {
    const send = crearRemitenteGmail({ sender, credentials }, { fetchImpl: async () => { throw Error('No debe conectar'); } });
    for (const patch of [{ from: 'other@gmail.com' }, { to: ['x@gmail.com\r\nBcc: x@outlook.com'] }, { subject: 'x\r\nBcc: x@gmail.com' }]) {
        await assert.rejects(send({ ...request(), mensaje: JSON.stringify({ ...JSON.parse(request().mensaje), ...patch }) }), { tipo: 'permanente' });
    }
    assert.throws(() => crearRemitenteGmail({ sender, credentials: { ...credentials, scope: SCOPE + ' openid' } }));
});
test('selección explícita conserva Resend; Gmail no necesita RESEND_API_KEY; archivos privados obligatorios', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-gmail-')); fs.chmodSync(dir, 0o700);
    const file = path.join(dir, 'oauth.json'); fs.writeFileSync(file, JSON.stringify(credentials), { mode: 0o600 });
    assert.deepEqual(leerJsonPrivado(file), credentials);
    const env = { EMAIL_PROVIDER: 'gmail', GMAIL_SENDER: sender, GMAIL_CREDENTIALS_FILE: file, EMAIL_OTP_SECRET: 's'.repeat(64) };
    assert.equal(configurarProveedorWorker(env).provider, 'gmail');
    assert.equal(obtenerConfigCorreo(env, { requiereApiKey: false }).from, sender);
    assert.equal(configurarProveedorWorker({ RESEND_API_KEY: 'fixture' }).provider, 'resend');
    assert.throws(() => configurarProveedorWorker({ EMAIL_PROVIDER: 'unknown' }));
    fs.chmodSync(file, 0o644); assert.throws(() => leerJsonPrivado(file));
    fs.chmodSync(file, 0o600); fs.symlinkSync(file, path.join(dir, 'link')); assert.throws(() => leerJsonPrivado(path.join(dir, 'link')));
    // Solo fixtures sintéticos creados aquí; nunca archivos de usuario.
    fs.rmSync(dir, { recursive: true });
});
test('sobre congela proveedor; un payload Resend antiguo se mantiene compatible', () => {
    const raw = request().mensaje;
    assert.deepEqual(abrirMensaje(raw), { proveedor: 'resend', mensaje: raw });
    assert.deepEqual(abrirMensaje(envolverMensaje(raw, 'gmail')), { proveedor: 'gmail', mensaje: raw });
    assert.throws(() => abrirMensaje(JSON.stringify({ hidro_mail_v: 2, proveedor: 'gmail' })));
});
test('OAuth PKCE solicita exclusivamente gmail.send, state aleatorio y sin scopes heredados', () => {
    const a = crearSolicitud(credentials.client_id, sender, 'http://127.0.0.1:1234/oauth2/callback');
    const b = crearSolicitud(credentials.client_id, sender, 'http://127.0.0.1:1234/oauth2/callback');
    const u = new URL(a.url); assert.equal(u.origin, 'https://accounts.google.com');
    assert.equal(u.searchParams.get('scope'), SCOPE); assert.equal(u.searchParams.get('include_granted_scopes'), 'false');
    assert.equal(u.searchParams.get('code_challenge_method'), 'S256'); assert.notEqual(a.state, b.state);
    assert.equal(u.searchParams.get('code_challenge'), crypto.createHash('sha256').update(a.verifier).digest('base64url'));
});
test('intercambio OAuth simulado verifica cliente/scope y conserva ambos tokens sin enviar', async () => {
    let calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url, options });
        return url === TOKEN_URL ? Response.json({ access_token: 'fixture-access', refresh_token: 'fixture-refresh', scope: SCOPE }) :
            Response.json({ aud: credentials.client_id, scope: SCOPE, email: sender });
    };
    const result = await intercambiar({ client: credentials, sender, code: 'fixture-code', verifier: 'fixture', redirectUri: 'http://127.0.0.1:1234/oauth2/callback' }, fetchImpl);
    assert.equal(result.refresh_token, 'fixture-refresh'); assert.equal(result.access_token, 'fixture-access');
    assert.deepEqual(calls.map(c => c.url), [TOKEN_URL, TOKEN_INFO_URL]);
    assert.equal(calls[1].options.headers.Authorization, 'Bearer fixture-access');
});
test('callback local rechaza state ajeno; cancela/cierra servidor sin guardar tokens ni llamar a Google', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-gmail-oauth-')); fs.chmodSync(dir, 0o700);
    const clientFile = path.join(dir, 'desktop.json'), output = path.join(dir, 'token.json');
    fs.writeFileSync(clientFile, JSON.stringify({ installed: credentials }), { mode: 0o600 });
    let requests = 0, callback;
    const pending = autorizar({ clientFile, output, sender, timeoutMs: 2000,
        fetchImpl: async () => { requests++; throw Error('No debe llamar'); }, onUrl: url => { callback = new URL(url); } });
    while (!callback) await new Promise(r => setTimeout(r, 1));
    const wrong = new URL(callback.searchParams.get('redirect_uri')); wrong.search = new URLSearchParams({ state: 'wrong', code: 'fixture' });
    assert.equal((await fetch(wrong)).status, 400); assert.equal(fs.existsSync(output), false);
    const denied = new URL(callback.searchParams.get('redirect_uri')); denied.search = new URLSearchParams({ state: callback.searchParams.get('state'), error: 'access_denied' });
    const rejected = assert.rejects(pending);
    await fetch(denied).catch(() => {}); await rejected;
    assert.equal(requests, 0); assert.equal(fs.existsSync(output), false); fs.rmSync(dir, { recursive: true });
});
test('callback sin identidad guarda ambos tokens 0600, estado separado y cierra el listener sin enviar correo', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-gmail-success-')); fs.chmodSync(dir, 0o700);
    const clientFile = path.join(dir, 'desktop.json'), output = path.join(dir, 'token.json');
    fs.writeFileSync(clientFile, JSON.stringify({ installed: credentials }), { mode: 0o600 });
    let callback, calls = 0;
    const pending = autorizar({ clientFile, output, sender, timeoutMs: 2000, onUrl: url => { callback = new URL(url); },
        fetchImpl: async url => {
            calls++;
            return url === TOKEN_URL ? Response.json({ access_token: 'fixture-short-lived', refresh_token: 'fixture-refresh', scope: SCOPE }) :
                Response.json({ aud: credentials.client_id, scope: SCOPE });
        } });
    while (!callback) await new Promise(r => setTimeout(r, 1));
    const redirect = new URL(callback.searchParams.get('redirect_uri'));
    redirect.search = new URLSearchParams({ state: callback.searchParams.get('state'), code: 'fixture-code' });
    const response = await fetch(redirect); assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store'); await response.text();
    await pending; assert.equal(calls, 2); assert.equal(fs.statSync(output).mode & 0o777, 0o600);
    const stored = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(stored.refresh_token, 'fixture-refresh'); assert.equal(stored.access_token, 'fixture-short-lived');
    assert.equal(stored.scope, SCOPE); assert.equal(stored.sender, sender);
    assert.equal(stored.account_verified, false); assert.equal(stored.account_check, 'scope_only');
    assert.equal(fs.statSync(output + '.identity.json').mode & 0o777, 0o600);
    const identity = JSON.parse(fs.readFileSync(output + '.identity.json', 'utf8'));
    assert.equal(identity.verified_automatically, false);
    assert.ok(!JSON.stringify(identity).includes('fixture-refresh'));
    assert.equal(configurarProveedorWorker({ EMAIL_PROVIDER: 'gmail', GMAIL_SENDER: sender, GMAIL_CREDENTIALS_FILE: output }).provider, 'gmail');
    assert.ok(!fs.readFileSync(output, 'utf8').includes('fixture-code')); fs.rmSync(dir, { recursive: true });
});
test('OAuth rechaza scopes heredados o remitente ajeno; no usa privilegios de lectura', async () => {
    for (const info of [{ aud: 'other-client', scope: SCOPE }, { aud: credentials.client_id, scope: SCOPE + ' openid' },
        { aud: credentials.client_id, scope: SCOPE, email: 'other@gmail.com' }]) {
        await assert.rejects(intercambiar({ client: credentials, sender, code: 'fixture', verifier: 'fixture', redirectUri: 'http://127.0.0.1:1234/oauth2/callback' },
            async url => url === TOKEN_URL ? Response.json({ access_token: 'fixture', refresh_token: 'fixture', scope: SCOPE }) : Response.json(info)));
    }
});
test('identidad opcional: rechaza contradicciones explícitas y distingue permiso de identidad', async () => {
    const args = { client: credentials, sender, code: 'fixture', verifier: 'fixture', redirectUri: 'http://127.0.0.1:1234/oauth2/callback', expectedSubject: '1234567890' };
    for (const info of [{ aud: credentials.client_id, scope: SCOPE, sub: '9999999999' },
        { aud: credentials.client_id, scope: SCOPE, email: sender, email_verified: false },
        { aud: credentials.client_id, scope: SCOPE, sub: args.expectedSubject, email: 'other@gmail.com' }]) {
        await assert.rejects(intercambiar(args, async url => url === TOKEN_URL ?
            Response.json({ access_token: 'fixture', refresh_token: 'fixture', scope: SCOPE }) : Response.json(info)));
    }
    const result = await intercambiar(args, async url => url === TOKEN_URL ?
        Response.json({ access_token: 'fixture', refresh_token: 'fixture', scope: SCOPE }) :
        Response.json({ aud: credentials.client_id, scope: SCOPE, sub: args.expectedSubject }));
    assert.equal(result.sender, sender); assert.equal(result.account_check, 'tokeninfo_subject'); assert.equal(result.account_verified, true);
    const noIdentity = await intercambiar(args, async url => url === TOKEN_URL ?
        Response.json({ access_token: 'fixture', refresh_token: 'fixture', scope: SCOPE }) : Response.json({ aud: credentials.client_id, scope: SCOPE }));
    assert.equal(noIdentity.account_check, 'scope_only'); assert.equal(noIdentity.account_verified, false);
    assert.equal(typeof crearRemitenteGmail({ sender, credentials: noIdentity }), 'function');
    assert.throws(() => crearRemitenteGmail({ sender, credentials: { ...credentials, account_verified: false } }));
});
test('renovación valida cliente/scope, conserva refresh token y no usa endpoints Gmail', async () => {
    const calls = [];
    const args = { client: credentials, credentials: { ...credentials, account_verified: false, account_check: 'scope_only' }, sender };
    const result = await renovar(args, async (url, options) => {
        calls.push(url);
        if (url === TOKEN_URL) {
            const body = new URLSearchParams(options.body);
            assert.equal(body.get('grant_type'), 'refresh_token'); assert.equal(body.get('refresh_token'), credentials.refresh_token);
            return Response.json({ access_token: 'fixture-renewed', expires_in: 3600 });
        }
        assert.equal(url, TOKEN_INFO_URL); return Response.json({ aud: credentials.client_id, scope: SCOPE });
    });
    assert.deepEqual(calls, [TOKEN_URL, TOKEN_INFO_URL]); assert.equal(result.refresh_token, credentials.refresh_token);
    assert.equal(result.access_token, 'fixture-renewed'); assert.ok(result.expiry_date > Date.now()); assert.equal(result.account_verified, false);
    await assert.rejects(renovar({ ...args, client: { ...credentials, client_id: 'other.apps.googleusercontent.com' } }, () => { throw Error('No debe llamar'); }), /otro cliente/);
    await assert.rejects(renovar(args, async () => Response.json({ access_token: 'fixture', expires_in: 3600, scope: SCOPE + ' openid' })), /incompatible/);
    await assert.rejects(renovar(args, async url => url === TOKEN_URL ? oauth() : Response.json({ aud: 'other', scope: SCOPE })), /no coincide/);
});
test('credenciales existentes se renuevan sin consentimiento y un fallo conserva el archivo', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-gmail-reuse-')); fs.chmodSync(dir, 0o700);
    const clientFile = path.join(dir, 'desktop.json'), output = path.join(dir, 'token.json');
    fs.writeFileSync(clientFile, JSON.stringify({ installed: credentials }), { mode: 0o600 });
    fs.writeFileSync(output, JSON.stringify(credentials), { mode: 0o600 });
    const options = { clientFile, output, sender, onUrl: () => { throw Error('No debe pedir consentimiento'); } };
    try {
        const before = fs.readFileSync(output, 'utf8');
        await assert.rejects(autorizar({ ...options, fetchImpl: async () => new Response('', { status: 400 }) }), /renovación/);
        assert.equal(fs.readFileSync(output, 'utf8'), before);
        const result = await autorizar({ ...options, fetchImpl: async url => url === TOKEN_URL ? oauth() : Response.json({ aud: credentials.client_id, scope: SCOPE }) });
        assert.equal(result.reused, true); assert.equal(fs.statSync(output).mode & 0o777, 0o600);
        assert.equal(JSON.parse(fs.readFileSync(output)).refresh_token, credentials.refresh_token);
    } finally { fs.rmSync(dir, { recursive: true }); }
});
test('la identidad privada fijada rechaza cliente de otro proyecto antes de iniciar OAuth', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-gmail-pin-')); fs.chmodSync(dir, 0o700);
    const clientFile = path.join(dir, 'desktop.json');
    fs.writeFileSync(clientFile, JSON.stringify({ installed: { ...credentials, project_id: 'other-project' } }), { mode: 0o600 });
    fs.writeFileSync(path.join(dir, 'authorized-sender.json'), JSON.stringify({ sender, scope: SCOPE, google_subject: '1234567890', project_id: 'authorized-project' }), { mode: 0o600 });
    await assert.rejects(autorizar({ clientFile, output: path.join(dir, 'credentials.json'), sender,
        fetchImpl: () => { throw Error('No debe conectar'); }, onUrl: () => { throw Error('No debe iniciar'); } }), /proyecto autorizado/);
    fs.rmSync(dir, { recursive: true });
});
