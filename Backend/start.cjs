'use strict';
// PID 1 del contenedor: dos procesos independientes, sin reiniciar envíos dentro del supervisor.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { validarCredenciales, validarRemitente } = require('./gmail-mail');

function prepararCredenciales(env, { secretDirectory = '/etc/secrets' } = {}) {
    if ((env.EMAIL_PROVIDER || 'resend') !== 'gmail') return { env, cleanup() {} };
    let fd, directory;
    try {
        // El secret file de Render es de solo lectura y puede tener otro modo.
        // Solo la copia efímera 0600 se entrega al lector estricto del worker.
        let source = env.GMAIL_CREDENTIALS_FILE;
        try { fd = fs.openSync(source, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); }
        catch (error) {
            if (error.code !== 'ELOOP' || path.dirname(path.resolve(source)) !== path.resolve(secretDirectory)) throw error;
            // Render/Kubernetes proyectan secretos mediante enlaces dentro del volumen.
            // No seguir enlaces locales arbitrarios ni destinos fuera del volumen privado.
            const base = fs.realpathSync(secretDirectory), baseStat = fs.statSync(base);
            const resolved = fs.realpathSync(source);
            if (!baseStat.isDirectory() || baseStat.mode & 0o022 ||
                (process.getuid && ![0, process.getuid()].includes(baseStat.uid)) || !resolved.startsWith(base + path.sep)) throw new Error();
            source = resolved;
            fd = fs.openSync(source, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        }
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.size > 65536) throw new Error();
        const raw = fs.readFileSync(fd, 'utf8');
        validarCredenciales(JSON.parse(raw), validarRemitente(env.GMAIL_SENDER));
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hidro-gmail-'));
        fs.chmodSync(directory, 0o700);
        const file = path.join(directory, 'credentials.json');
        fs.writeFileSync(file, raw, { mode: 0o600, flag: 'wx' });
        return { env: { ...env, GMAIL_CREDENTIALS_FILE: file }, cleanup() { fs.rmSync(directory, { recursive: true }); } };
    } catch (error) {
        if (directory) fs.rmSync(directory, { recursive: true });
        throw Object.assign(new Error('No se pudo preparar la credencial privada Gmail.'),
            { code: ['ELOOP', 'ENOENT', 'EACCES', 'EPERM'].includes(error.code) ? error.code : 'CREDENTIALS_INVALID' });
    } finally { if (fd !== undefined) fs.closeSync(fd); }
}

function supervisar({ env = process.env, spawnImpl = spawn, signals = process,
    prepare = prepararCredenciales, startupMs = 20000, shutdownMs = 25000,
    log = event => process.stdout.write(JSON.stringify(event) + '\n') } = {}) {
    const children = new Map();
    let stopping = false, completed = false, exitCode = 0, startupTimer, shutdownTimer, prepared, resolveDone, apiStarted = false;
    const done = new Promise(resolve => { resolveDone = resolve; });
    const onSignal = () => stop(0);
    function finished() {
        if (completed || !stopping || children.size) return;
        completed = true;
        clearTimeout(startupTimer); clearTimeout(shutdownTimer);
        signals.removeListener('SIGTERM', onSignal); signals.removeListener('SIGINT', onSignal);
        try { prepared?.cleanup(); } catch (_) { exitCode = 1; }
        resolveDone(exitCode);
    }
    function stop(code = 0) {
        if (stopping) { exitCode = Math.max(exitCode, code); return; }
        stopping = true; exitCode = code; clearTimeout(startupTimer);
        log({ event: 'container_stopping', code });
        for (const child of children.values()) child.kill('SIGTERM');
        if (children.size) shutdownTimer = setTimeout(() => {
            exitCode = 1;
            for (const child of children.values()) child.kill('SIGKILL');
        }, shutdownMs);
        finished();
    }
    function launch(role, args, childEnv, ipc = false) {
        const child = spawnImpl(process.execPath, args, { cwd: __dirname, env: childEnv,
            stdio: ipc ? ['ignore', 'inherit', 'inherit', 'ipc'] : ['ignore', 'inherit', 'inherit'] });
        children.set(role, child);
        const closed = () => {
            if (children.get(role) !== child) return;
            children.delete(role);
            if (!stopping) { log({ event: 'child_stopped', role }); stop(1); }
            finished();
        };
        child.once('error', closed); child.once('close', closed);
        return child;
    }
    function launchApi() {
        if (stopping || apiStarted) return;
        apiStarted = true;
        const apiEnv = { ...env, EMAIL_WORKER_ENABLED: '0' };
        for (const key of ['GMAIL_CREDENTIALS_FILE', 'EMAIL_WORKER_DATABASE_URL', 'EMAIL_WORKER_EXPECTED_DATABASE']) delete apiEnv[key];
        const child = launch('api', [path.join(__dirname, 'server.js')], apiEnv);
        log({ event: 'api_started', pid: child.pid });
    }
    signals.once('SIGTERM', onSignal); signals.once('SIGINT', onSignal);
    try {
        const shared = env.EMAIL_WORKER_SHARED_CONTAINER === '1', enabled = env.EMAIL_WORKER_ENABLED === '1';
        if ((!shared && enabled) || (shared && !enabled && env.EMAIL_REGISTRATION_ENABLED === '1')) throw new Error();
        if (shared && enabled) {
            prepared = prepare(env);
            const child = launch('worker', [path.join(__dirname, 'workers/email-outbox.cjs'), '--run'], prepared.env, true);
            startupTimer = setTimeout(() => { log({ event: 'worker_start_timeout' }); stop(1); }, startupMs);
            child.on('message', message => {
                if (message?.event !== 'email_worker_ready' || stopping || apiStarted) return;
                clearTimeout(startupTimer); log({ event: 'worker_ready', pid: child.pid });
                try { launchApi(); } catch (_) { stop(1); }
            });
        } else launchApi();
    } catch (error) {
        log({ event: 'container_configuration_error', reason: ['ELOOP', 'ENOENT', 'EACCES', 'EPERM', 'CREDENTIALS_INVALID'].includes(error.code) ? error.code : 'flags_or_spawn' });
        stop(1);
    }
    return { done, stop };
}
if (require.main === module) supervisar().done.then(code => { process.exitCode = code; });
module.exports = { prepararCredenciales, supervisar };
