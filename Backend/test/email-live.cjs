'use strict';
// Ejecutar únicamente desde una terminal privada. Nunca lee archivos .env.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { setTimeout: pause } = require('node:timers/promises');
const { nuevaBase, sql } = require('./email-schema.cjs');
const { coincideCodigo, OTP_TTL_SECONDS } = require('../email-otp');

function comprobar(condicion) {
    // Las aserciones nunca incluyen cuerpos HTTP, valores SQL ni entradas privadas.
    if (!condicion) throw new Error('Comprobación no superada.');
}

function leerOculto(prompt, input = process.stdin, output = process.stdout) {
    comprobar(input.isTTY && output.isTTY && typeof input.setRawMode === 'function');
    return new Promise((resolve, reject) => {
        let value = '';
        const wasRaw = !!input.isRaw;
        const wasFlowing = input.readableFlowing === true;
        const finish = (error) => {
            input.removeListener('data', onData);
            input.removeListener('end', onEnd);
            input.removeListener('error', onEnd);
            input.setRawMode(wasRaw);
            if (!wasFlowing) input.pause();
            output.write('\n');
            if (error) { value = ''; reject(new Error('Entrada cancelada.')); }
            else resolve(value);
        };
        const onEnd = () => finish(true);
        const onData = chunk => {
            for (const character of chunk.toString('utf8')) {
                if (character === '\u0003' || character === '\u0004') return finish(true);
                if (character === '\r' || character === '\n') return finish(false);
                if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
                else if (character >= ' ' && character !== '\u001b' && value.length < 256) value += character;
            }
        };
        output.write(prompt);
        input.setRawMode(true);
        input.on('data', onData);
        input.once('end', onEnd);
        input.once('error', onEnd);
        input.resume();
    });
}

function comprobarContenedor(port) {
    const raw = execFileSync('docker', ['inspect', 'hidro-email-test-20261018', '--format',
        '{{json .NetworkSettings.Ports}}'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const bindings = JSON.parse(raw)['5432/tcp'];
    comprobar(bindings?.length === 1 && bindings[0].HostIp === '127.0.0.1' &&
        bindings[0].HostPort === String(port));
}

async function ejecutar({ modo, leer = leerOculto, escribir = console.log } = {}) {
    comprobar(['prepare', 'simulate', 'live'].includes(modo));
    const simulado = modo === 'simulate';
    const port = Number(process.env.HIDRO_EMAIL_TEST_DB_PORT);
    comprobar(Number.isInteger(port) && port > 0 && port <= 65535);
    comprobarContenedor(port);
    let correo = 'terminal@example.invalid';
    if (modo === 'live') {
        comprobar(process.stdin.isTTY && process.stdout.isTTY);
        correo = String(process.env.HIDRO_LIVE_EMAIL_TO || '').trim().toLowerCase();
        comprobar(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) && correo.length <= 120);
        comprobar(/^re_[A-Za-z0-9_-]+$/.test(process.env.RESEND_API_KEY || ''));
        escribir(`Se enviarán DOS correos desde onboarding@resend.dev a ${correo}.`);
        escribir('El primero se dejará vencer; el segundo completará el registro. No se mostrarán códigos.');
        comprobar(await leer('Para autorizar ambos envíos escribe ENVIAR 2: ') === 'ENVIAR 2');
    }
    const report = { version: 1, modo, inicio: new Date().toISOString(), resultado: 'pendiente',
        ttl_segundos: OTP_TTL_SECONDS, envios_aceptados: 0, comprobaciones: [] };
    const output = path.resolve(__dirname, '../../artifacts/email-live');
    fs.mkdirSync(output, { recursive: true, mode: 0o700 });
    const filename = path.join(output, `resultado-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.json`);
    let db, backend, etapa = 'preparacion', codigoSimulado, base;
    const originalFetch = global.fetch;
    const originalError = console.error;
    const savedEnv = { ...process.env };
    // El servidor heredado imprime algunos errores SQL. Este harness no los conserva.
    console.error = () => {};
    const ok = label => { report.comprobaciones.push(label); escribir('OK: ' + label); };
    try {
        const nueva = await nuevaBase(simulado ? 'simulacion' : 'terminal');
        db = nueva.pool;
        report.base_aislada = nueva.connection.database;
        comprobar((await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n === 0);
        await db.query(sql('init.sql'));
        ok('Base nueva y vacía en PostgreSQL aislado; esquema inicial aplicado');
        if (modo === 'prepare') {
            report.resultado = 'preparado_sin_envios';
            return report;
        }
        comprobar(!require.cache[require.resolve('../server')]);
        const secreto = crypto.randomBytes(32).toString('hex');
        const c = nueva.connection;
        Object.assign(process.env, { DATABASE_URL: '', DB_HOST: c.host, DB_PORT: String(c.port),
            POSTGRES_DB: c.database, POSTGRES_USER: c.user, POSTGRES_PASSWORD: c.password,
            AUTH_TOKEN_SECRET: crypto.randomBytes(32).toString('hex'), EMAIL_OTP_SECRET: secreto,
            EMAIL_OUTBOX_KEY:crypto.randomBytes(32).toString('base64'),
            RESEND_FROM: 'onboarding@resend.dev', NODE_ENV: 'test', PORT: '3000', CORS_ALLOWED_ORIGINS: '' });
        if (simulado) {
            process.env.RESEND_API_KEY = 'fixture-provider-key';
            global.fetch = async (url, options) => {
                comprobar(url === 'https://api.resend.com/emails');
                const body = JSON.parse(options.body);
                comprobar(body.to.length === 1 && body.to[0] === 'terminal@example.invalid');
                codigoSimulado = body.text.match(/: (\d{6})/)[1];
                return Response.json({ id: crypto.randomUUID() });
            };
        }
        const worker = require('../email-outbox').crearProcesadorOutbox({pool:db,key:Buffer.from(process.env.EMAIL_OUTBOX_KEY,'base64'),
            enviarCodigo:require('../resend-mail').crearRemitente({apiKey:process.env.RESEND_API_KEY},{fetchImpl:global.fetch,maxAttempts:1})});
        backend = require('../server');
        global.fetch = originalFetch;
        await new Promise((resolve, reject) => {
            backend.httpServer.once('error', reject);
            backend.httpServer.listen(0, '127.0.0.1', resolve);
        });
        base = `http://127.0.0.1:${backend.httpServer.address().port}`;
        const request = async (route, body, expected) => {
            const response = await originalFetch(base + '/api/auth/' + route, { method: 'POST',
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
                signal: AbortSignal.timeout(30000) });
            const data = await response.json();
            if(response.status===202) comprobar((await worker.procesarUno()).estado==='aceptado');
            if (expected !== undefined) comprobar(response.status === expected);
            return { status: response.status, data };
        };
        const password = 'Prueba' + crypto.randomBytes(24).toString('hex') + '7';
        const supply = '990000001';
        const login = () => ({ numero_suministro: supply, password });
        const sinCuenta = async () => {
            comprobar((await db.query('SELECT count(*)::int AS n FROM usuarios WHERE correo=$1', [correo])).rows[0].n === 0);
            comprobar((await db.query('SELECT count(*)::int AS n FROM suministros WHERE numero_suministro=$1', [supply])).rows[0].n === 0);
        };
        // Cuenta previa sintética, con el mismo algoritmo scrypt del login existente.
        const salt = crypto.randomBytes(16).toString('hex');
        const legacyHash = 'scrypt$' + salt + '$' + crypto.scryptSync(password, salt, 64).toString('hex');
        const legacy = await db.query("INSERT INTO usuarios(correo,clave_hash) VALUES ('legacy-terminal@example.invalid',$1) RETURNING id_usuario", [legacyHash]);
        await db.query("INSERT INTO suministros(numero_suministro,id_usuario) VALUES ('990000002',$1)", [legacy.rows[0].id_usuario]);
        await request('login', { numero_suministro: '990000002', password }, 200);
        ok('Cuenta previa sintética sin fecha de verificación conserva login');

        etapa = 'primer_envio';
        const before = Date.now();
        const { data: p } = await request('register', { correo, numero_suministro: supply, password }, 202);
        report.envios_aceptados++;
        comprobar(!p.token && !p.usuario && p.estado === 'pendiente');
        const pending = (await db.query(`SELECT codigo_hash,clave_hash,codigo_vence_en,
            EXTRACT(EPOCH FROM (codigo_vence_en-creado_en)) AS ttl
            FROM registros_correo_pendientes WHERE id=$1`, [p.registro_id])).rows[0];
        comprobar(Number(pending.ttl) >= 299 && Number(pending.ttl) <= 301);
        comprobar(p.vence_en===null && p.estado_envio==='en_cola');
        const estado=await request('verification-status',{registro_id:p.registro_id},200);
        comprobar(Math.abs(new Date(estado.data.vence_en) - pending.codigo_vence_en) < 1);
        comprobar(pending.codigo_vence_en.getTime() <= before + 301000);
        comprobar(/^scrypt\$/.test(pending.clave_hash));
        await sinCuenta();
        await request('login', login(), 401);
        ok('Registro HTTP 202 encola; trabajador explícito acepta envío con TTL de 300 segundos, sin cuenta ni JWT');
        let first = simulado ? codigoSimulado : await leer('OTP del PRIMER correo (oculto, se dejará vencer): ');
        comprobar(coincideCodigo(p.registro_id, first, pending.codigo_hash, secreto));
        ok('Código del primer envío coincide con su HMAC; entrada privada en modo real');
        etapa = 'codigo_incorrecto';
        const wrong = ((Number(first) + 1) % 1000000).toString().padStart(6, '0');
        await request('verify-email', { registro_id: p.registro_id, codigo: wrong }, 400);
        await sinCuenta();
        comprobar((await db.query('SELECT intentos FROM registros_correo_pendientes WHERE id=$1', [p.registro_id])).rows[0].intentos === 1);
        ok('Código incorrecto rechazado con intento persistente y sin crear cuenta');
        etapa = 'caducidad';
        if (simulado) {
            await db.query("UPDATE registros_correo_pendientes SET codigo_vence_en=clock_timestamp()-INTERVAL '1 second' WHERE id=$1", [p.registro_id]);
            await db.query("UPDATE registros_correo_envios SET enviado_en=enviado_en-INTERVAL '301 seconds'");
        } else {
            while (true) {
                const { rows: [r] } = await db.query('SELECT EXTRACT(EPOCH FROM (codigo_vence_en-clock_timestamp())) AS restante FROM registros_correo_pendientes WHERE id=$1', [p.registro_id]);
                if (Number(r.restante) < 0) break;
                escribir(`Esperando caducidad real: ${Math.max(1, Math.ceil(Number(r.restante)))} segundos restantes.`);
                await pause(Math.min(30000, Math.max(50, Number(r.restante) * 1000 + 100)));
            }
            report.espera_real_segundos = Math.floor((Date.now() - before) / 1000);
            comprobar(report.espera_real_segundos >= 300);
        }
        await request('verify-email', { registro_id: p.registro_id, codigo: first }, 400);
        first = '';
        await sinCuenta();
        ok('Primer OTP caducado rechazado sin crear usuario ni suministro');
        etapa = 'segundo_envio';
        const { data: second } = await request('resend-verification', { registro_id: p.registro_id }, 202);
        report.envios_aceptados++;
        comprobar(second.registro_id === p.registro_id);
        await sinCuenta();
        const current = (await db.query('SELECT codigo_hash,intentos FROM registros_correo_pendientes WHERE id=$1', [p.registro_id])).rows[0];
        comprobar(current.codigo_hash !== pending.codigo_hash && current.intentos === 1);
        ok('Segundo envío aceptado; nuevo hash, sin reiniciar intentos ni crear cuenta');
        etapa = 'confirmacion';
        let code = simulado ? codigoSimulado : await leer('OTP del SEGUNDO correo (oculto, para confirmar): ');
        comprobar(coincideCodigo(p.registro_id, code, current.codigo_hash, secreto));
        const results = await Promise.all([1, 2].map(() => request('verify-email', { registro_id: p.registro_id, codigo: code })));
        comprobar(results.map(r => r.status).sort().join(',') === '201,400');
        await request('verify-email', { registro_id: p.registro_id, codigo: code }, 400);
        code = ''; codigoSimulado = undefined;
        comprobar(results.every(r => !r.data.token));
        const { rows: [counts] } = await db.query(`SELECT
            (SELECT count(*)::int FROM usuarios WHERE correo=$1 AND correo_verificado_en IS NOT NULL) AS usuarios,
            (SELECT count(*)::int FROM suministros s JOIN usuarios u USING(id_usuario) WHERE s.numero_suministro=$2 AND u.correo=$1) AS suministros,
            (SELECT count(*)::int FROM suministros s LEFT JOIN usuarios u USING(id_usuario) WHERE u.id_usuario IS NULL) AS huerfanos`, [correo, supply]);
        comprobar(counts.usuarios === 1 && counts.suministros === 1 && counts.huerfanos === 0);
        const { rows: [consumed] } = await db.query('SELECT consumido_en,clave_hash,codigo_hash FROM registros_correo_pendientes WHERE id=$1', [p.registro_id]);
        comprobar(consumed.consumido_en && consumed.clave_hash === '' && consumed.codigo_hash === '0'.repeat(64));
        comprobar((await db.query('SELECT count(*)::int AS n FROM registros_correo_envios WHERE registro_id=$1', [p.registro_id])).rows[0].n === 2);
        ok('Confirmaciones concurrentes: un éxito y un rechazo; consumo único, sin duplicados ni huérfanos');
        etapa = 'login';
        const signedIn = await request('login', login(), 200);
        comprobar(typeof signedIn.data.token === 'string' && signedIn.data.token.length > 0);
        // JWT solo en memoria. Usarlo en una ruta protegida comprueba la sesión completa.
        const profile = await originalFetch(base + '/api/me/perfil', {
            headers: { Authorization: 'Bearer ' + signedIn.data.token }, signal: AbortSignal.timeout(10000) });
        comprobar(profile.status === 200);
        const me = await profile.json();
        comprobar(me.correo === correo && me.numero_suministro === supply);
        await request('login', { numero_suministro: supply, password: password + 'x' }, 401);
        await request('login', { numero_suministro: '990000002', password }, 200);
        ok('Login verificado, perfil protegido, contraseña incorrecta y cuenta previa comprobados');
        report.resultado = simulado ? 'simulacion_aprobada' : 'prueba_real_aprobada';
        return report;
    } catch (_) {
        report.resultado = 'fallo'; report.etapa_fallida = etapa;
        throw new Error('Prueba interrumpida. Consultar únicamente la etapa del informe sanitizado.');
    } finally {
        global.fetch = originalFetch;
        if (backend) {
            await new Promise(resolve => backend.io.close(resolve));
            await backend.pool.end();
        }
        if (db) await db.end();
        for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
        Object.assign(process.env, savedEnv);
        console.error = originalError;
        report.fin = new Date().toISOString();
        fs.writeFileSync(filename, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
        escribir('Informe sin datos privados: ' + path.relative(process.cwd(), filename));
        escribir('La base aislada se conserva; no se eliminan datos ni volúmenes.');
    }
}

if (require.main === module) {
    const modes = { '--prepare': 'prepare', '--simulate': 'simulate', '--live': 'live' };
    ejecutar({ modo: process.argv.length === 3 ? modes[process.argv[2]] : undefined })
        .catch(() => { console.error('No se completó la prueba. Revisa modo, terminal, entorno y etapa del informe si existe.'); process.exitCode = 1; });
}
module.exports = { ejecutar, leerOculto, comprobar };
