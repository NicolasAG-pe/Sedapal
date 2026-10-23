'use strict';
// Solo autorización local; este programa NO envía mensajes ni inicia el worker.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { SCOPE, TOKEN_URL, TOKEN_INFO_URL, leerJsonPrivado, validarRemitente } = require('../Backend/gmail-mail');
function crearSolicitud(clientId, sender, redirectUri) {
    const verifier = crypto.randomBytes(48).toString('base64url');
    const state = crypto.randomBytes(32).toString('base64url');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
        scope: SCOPE, access_type: 'offline', prompt: 'consent select_account', login_hint: sender,
        include_granted_scopes: 'false', state, code_challenge_method: 'S256',
        code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url') });
    return { url: url.toString(), state, verifier };
}
async function intercambiar({ client, sender, code, verifier, redirectUri }, fetchImpl = fetch) {
    const r = await fetchImpl(TOKEN_URL, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({
            client_id: client.client_id, client_secret: client.client_secret, grant_type: 'authorization_code',
            code, code_verifier: verifier, redirect_uri: redirectUri }).toString() });
    if (!r.ok) { await r.body?.cancel(); throw new Error('Google rechazó el intercambio OAuth.'); }
    const data = await r.json();
    if (!data.access_token || !data.refresh_token || data.scope !== SCOPE) throw new Error('Google no concedió exactamente gmail.send y acceso offline.');
    const check = await fetchImpl(TOKEN_INFO_URL, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${data.access_token}`, 'Content-Type': 'application/x-www-form-urlencoded' } });
    if (!check.ok) { await check.body?.cancel(); throw new Error('No se pudo comprobar el alcance OAuth.'); }
    const info = await check.json();
    if (info.aud !== client.client_id || info.scope !== SCOPE || (info.email && info.email.toLowerCase() !== sender)) {
        throw new Error('El cliente, alcance o remitente OAuth no coincide.');
    }
    return { type: 'authorized_user', client_type: 'desktop', client_id: client.client_id,
        client_secret: client.client_secret, refresh_token: data.refresh_token, scope: SCOPE, sender,
        account_check: info.email ? 'tokeninfo_email' : 'consent_screen_and_explicit_gmail_user_id',
        created_at: new Date().toISOString() };
}
async function autorizar({ clientFile, output, sender, onUrl = value => process.stdout.write(value + '\n'), fetchImpl = fetch, timeoutMs = 300000 }) {
    sender = validarRemitente(sender);
    const client = leerJsonPrivado(clientFile).installed;
    if (!client?.client_id?.endsWith('.apps.googleusercontent.com') || !client.client_secret ||
        (client.auth_uri && client.auth_uri !== 'https://accounts.google.com/o/oauth2/auth') ||
        (client.token_uri && client.token_uri !== TOKEN_URL)) throw new Error('Se requiere JSON oficial de cliente OAuth de escritorio.');
    if (fs.existsSync(output)) throw new Error('La salida ya existe; no se sobrescriben credenciales anteriores.');
    const parent = path.dirname(path.resolve(output));
    if (!fs.existsSync(parent)) throw new Error('La carpeta privada de salida debe existir.');
    const stat = fs.statSync(parent);
    if (!stat.isDirectory() || stat.mode & 0o077 || (process.getuid && stat.uid !== process.getuid())) throw new Error('La carpeta privada necesita propietario actual y permisos 0700.');
    const root = path.resolve(__dirname, '..');
    for (const file of [clientFile, output]) {
        const relative = path.relative(root, path.resolve(file));
        if (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) {
            try { execFileSync('git', ['check-ignore', '--quiet', '--', relative], { cwd: root, stdio: 'ignore' }); }
            catch (_) { throw new Error('El archivo OAuth dentro del repositorio debe estar ignorado por Git.'); }
        }
    }
    let server, timer, activeSocket, settled = false;
    return new Promise((resolve, reject) => {
        function finish(error, result) {
            if (settled) return; settled = true; clearTimeout(timer);
            server?.close(); activeSocket?.destroy();
            if (error) reject(new Error('OAuth no completado; revisar cuenta, consentimiento y archivo privado sin exponer tokens.'));
            else resolve(result);
        }
        server = http.createServer(async (req, res) => {
            const callback = new URL(req.url, redirectUri);
            if (req.method !== 'GET' || callback.pathname !== '/oauth2/callback' || req.headers.host !== new URL(redirectUri).host) {
                res.writeHead(404); res.end(); return;
            }
            if (callback.searchParams.get('state') !== request.state) { res.writeHead(400); res.end('Solicitud OAuth no válida.'); return; }
            if (callback.searchParams.has('error') || !callback.searchParams.get('code')) { res.writeHead(400); res.end('Autorización cancelada.'); finish(new Error()); return; }
            if (activeSocket) { res.writeHead(409); res.end(); return; }
            activeSocket = req.socket;
            try {
                const result = await intercambiar({ client, sender, code: callback.searchParams.get('code'),
                    verifier: request.verifier, redirectUri }, fetchImpl);
                if (settled) { res.destroy(); return; }
                fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
                res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
                res.end('Autorización guardada. Puedes cerrar esta pestaña. No se envió ningún correo.');
                res.on('finish', () => finish(null, { output, scope: SCOPE, accountCheck: result.account_check }));
            } catch (_) { res.writeHead(400); res.end('No se completó la autorización.'); finish(new Error()); }
        });
        let request, redirectUri;
        server.once('error', () => finish(new Error()));
        server.listen(0, '127.0.0.1', () => {
            redirectUri = `http://127.0.0.1:${server.address().port}/oauth2/callback`;
            request = crearSolicitud(client.client_id, sender, redirectUri);
            timer = setTimeout(() => finish(new Error()), timeoutMs);
            try { onUrl(request.url); } catch (_) { finish(new Error()); }
        });
    });
}
async function main(argv = process.argv.slice(2)) {
    if (!argv.length || argv[0] === '--help') {
        process.stdout.write('Autorizar solo gmail.send (sin envíos): node scripts/gmail-oauth.cjs --client-file RUTA_JSON_DESKTOP_0600 --sender REMITENTE_GMAIL --output CARPETA_PRIVADA_0700/credentials.json\n'); return;
    }
    if (argv.length !== 6 || argv[0] !== '--client-file' || argv[2] !== '--sender' || argv[4] !== '--output') throw new Error();
    const result = await autorizar({ clientFile: path.resolve(argv[1]), sender: argv[3], output: path.resolve(argv[5]),
        onUrl: url => process.stdout.write('Abre este enlace oficial y comprueba la cuenta remitente en la pantalla de consentimiento:\n' + url + '\n') });
    process.stdout.write('OAuth guardado con permisos 0600. No se envió correo. En Testing Google puede caducar el refresh token a los siete días.\n');
    return result;
}
if (require.main === module) main().catch(() => { process.stderr.write('Autorización no completada; revisar configuración privada. No se enviaron mensajes.\n'); process.exitCode = 1; });
module.exports = { crearSolicitud, intercambiar, autorizar };
