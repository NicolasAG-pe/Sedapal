'use strict';
// Proceso que corre DENTRO de bubblewrap: sin interfaces de red salvo loopback propio y sin variables de entorno.
// Habla con el exterior solo por tres sockets Unix que crea el anfitrión (Auth y Groq) o que expone él mismo (chat).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const os = require('node:os');
const tls = require('node:tls');
const { createGroqCloudProvider } = require('./Backend/services/conversation/groq-cloud.cjs');
const { createConversationService } = require('./Backend/services/conversation/server.cjs');

const dir = '/run/hidrobot-e2e';
const secret = '/run/secrets/chat-groq-api-key';
const host = 'api.groq.com';
const destination = 'https://' + host + '/openai/v1/chat/completions';
const [mode, canary, ttlText, budgetText] = process.argv.slice(2);
const real = mode === 'run';
const model = 'openai/gpt-oss-20b';
const budget = Number(budgetText);
const codes = [];
let external = 0;

const emit = event => console.log(JSON.stringify(event));

async function isolation() {
    assert.deepEqual(Object.keys(os.networkInterfaces()), ['lo']);
    assert.equal(fs.readFileSync('/proc/net/route', 'utf8').trim().split('\n').length, 1);
    for (const name of ['PGHOST', 'DATABASE_URL', 'CHAT_GROQ_API_KEY', 'JWT_SECRET']) assert.equal(process.env[name], undefined);
    await assert.rejects(new Promise((ok, bad) => {
        const socket = net.connect({ host: '127.0.0.1', port: Number(canary) });
        socket.once('error', bad);
        socket.once('connect', () => { socket.destroy(); ok(); });
    }), { code: 'ECONNREFUSED' });
}

// Réplica de sessionValidator con socket Unix: solo acepta sesiones de rol cliente con suministro.
function validateSession(bearer) {
    return new Promise((resolve, reject) => {
        const request = http.request({ socketPath: dir + '/auth.sock', path: '/api/auth/session', method: 'GET',
            headers: { Authorization: bearer, Host: 'auth' }, timeout: 1500 }, response => {
            if (response.statusCode === 401 || response.statusCode === 403) { response.resume(); return resolve(false); }
            if (response.statusCode !== 200) { response.resume(); return reject(Error('Auth no disponible')); }
            const chunks = [];
            let size = 0;
            response.on('data', chunk => {
                size += chunk.length;
                if (size > 16 * 1024) { response.destroy(); reject(Error('Respuesta de Auth excesiva')); } else chunks.push(chunk);
            });
            response.on('end', () => {
                try {
                    const { estado, usuario, suministro } = JSON.parse(Buffer.concat(chunks));
                    resolve(estado === 'ok' && usuario?.rol === 'usuario' && /^\d{9}$/.test(suministro?.numero_suministro || ''));
                } catch (error) { reject(error); }
            });
        });
        request.once('timeout', () => request.destroy(Error('Auth tardó demasiado')));
        request.once('error', reject);
        request.end();
    });
}

const completion = content => Response.json({
    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(content) } }]
});

// Transporte controlado: reproduce el contrato HTTP de Groq sin salir del sandbox.
function scriptedTransport() {
    const steps = ['ok', 'hang', 'quota'];
    return async (url, { signal }) => {
        assert.equal(url, destination);
        const step = steps[external++];
        if (step === 'ok') {
            return completion({ text: 'Para cuidar el agua en casa, revisa los caños y acorta las duchas.', evidence: ['base'] });
        }
        if (step === 'quota') return new Response('{}', { status: 429, headers: { 'Retry-After': '30' } });
        if (step === 'hang') {
            return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
        }
        throw Error('E2E_SCRIPT_EXHAUSTED');
    };
}

// Transporte real: TLS validado contra api.groq.com sobre el canal Unix que abre el anfitrión.
function relayTransport() {
    const agent = new https.Agent({ keepAlive: false, maxSockets: 1 });
    agent.createConnection = () => tls.connect({
        socket: net.connect({ path: dir + '/groq.sock' }), host, servername: host, rejectUnauthorized: true
    });
    return (url, options) => {
        assert.equal(url, destination);
        assert.equal(options.method, 'POST');
        assert.equal(options.redirect, 'error');
        // Cualquier intento que supere el presupuesto se rechaza antes de abrir el canal.
        if (external >= budget) return Promise.reject(Error('E2E_BUDGET_EXHAUSTED'));
        external++;
        const started = performance.now();
        return new Promise((resolve, reject) => {
            const outgoing = https.request(url, {
                method: options.method, agent, signal: options.signal,
                headers: { ...options.headers, 'Content-Length': Buffer.byteLength(options.body) }
            }, async incoming => {
                try {
                    let size = 0;
                    const chunks = [];
                    for await (const chunk of incoming) {
                        size += chunk.length;
                        if (size > 16 * 1024) throw Error('E2E_RESPONSE_TOO_LARGE');
                        chunks.push(chunk);
                    }
                    const body = Buffer.concat(chunks);
                    const event = { evento: 'groq', http: incoming.statusCode, ms: Math.round(performance.now() - started) };
                    if (incoming.statusCode === 200) {
                        const parsed = JSON.parse(body);
                        const { prompt_tokens: entrada, completion_tokens: salida, total_tokens: total } = parsed.usage || {};
                        event.tokens = { entrada, salida, total };
                        try { event.texto_publico = JSON.parse(parsed.choices[0].message.content).text?.slice(0, 640); } catch (_) { /* lo valida el adaptador */ }
                    }
                    emit(event);
                    const retryAfter = incoming.headers['retry-after'];
                    resolve(new Response(body.length ? body : null, {
                        status: incoming.statusCode, headers: retryAfter ? { 'Retry-After': retryAfter } : undefined
                    }));
                } catch (error) {
                    incoming.destroy();
                    reject(error);
                }
            });
            outgoing.once('error', reject);
            outgoing.end(options.body);
        });
    };
}

async function main() {
    await isolation();
    let apiKey = 'groq-fixture-only';
    if (real) {
        assert.ok(Number.isInteger(budget) && budget >= 1 && budget <= 20);
        apiKey = fs.readFileSync(secret, 'utf8').trim();
    } else {
        assert.equal(fs.existsSync(secret), false);
        assert.equal(fs.existsSync(dir + '/groq.sock'), false);
    }
    const provider = createGroqCloudProvider({ model, apiKey, transport: real ? relayTransport() : scriptedTransport() });
    const app = createConversationService({
        validateSession, provider, providerMs: real ? 6000 : 300,
        onProviderError: code => { codes.push(code); emit({ evento: 'respaldo', codigo: code }); }
    });
    const server = http.createServer(app);
    const socketPath = dir + '/chat.sock';
    await new Promise((ok, bad) => { server.once('error', bad); server.listen(socketPath, ok); });
    emit({ evento: 'listo', modo: real ? 'groq-real' : 'controlado', modelo: model, presupuesto_externo: real ? budget : 0 });

    let stopping = false;
    const stop = () => {
        if (stopping) return;
        stopping = true;
        server.closeAllConnections();
        server.close(() => {
            emit({ evento: 'resumen', modo: real ? 'groq-real' : 'controlado', intentos_externos: external, codigos_backend: codes });
            process.exit(0);
        });
    };
    setTimeout(stop, Math.min(1800, Math.max(5, Number(ttlText) || 600)) * 1000).unref();
    // El anfitrión cierra stdin para pedir un apagado ordenado con resumen.
    process.stdin.on('end', stop);
    process.stdin.resume();
}

main().catch(() => {
    console.error('Sandbox bloqueado por configuración o aislamiento. No se imprimen detalles del transporte.');
    process.exit(1);
});
