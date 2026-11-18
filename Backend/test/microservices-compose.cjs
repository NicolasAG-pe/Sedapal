'use strict';
// Prueba manual opt-in del Compose NUEVO. Parar solo su worker antes de ejecutar;
// arrancarlo tras "fixture_encolado". Nunca ejecutar contra la instalación oficial.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { descifrarMensaje } = require('../outbox-crypto');
const { setTimeout: delay } = require('node:timers/promises');
async function main() {
    assert.equal(process.env.NODE_ENV, 'test');
    assert.equal(process.env.AUTH_SERVICE_URL, 'http://auth:3100');
    const url = new URL(process.env.DATABASE_URL);
    assert.equal(url.hostname, 'db'); assert.equal(url.pathname, '/hm_email_lab');
    const db = new Pool({ connectionString: url.toString() });
    try {
        assert.equal((await db.query('SELECT current_database() AS db')).rows[0].db, 'hm_email_lab');
        const base = 'http://web', panel = 'http://admin';
        for (const origin of [base, panel]) {
            assert.equal((await fetch(origin)).status, 200);
            assert.match(await (await fetch(origin + '/hm-api-config.js')).text(), /window.HM_API_BASE = ''/);
            assert.equal((await fetch(origin + '/api/health')).status, 200);
            assert.equal((await fetch(origin + '/internal/v1/auth/introspect', { method: 'POST' })).status, 405);
        }
        async function request(origin, route, body, token) {
            const res = await fetch(origin + route, { method: body ? 'POST' : 'GET', headers: {
                'Content-Type': 'application/json', 'X-Hidro-Auth-Contract': 'otp-outbox-v1',
                ...(token ? { Authorization: 'Bearer ' + token } : {})
            }, ...(body ? { body: JSON.stringify(body) } : {}) });
            return { status: res.status, data: await res.json() };
        }
        const suffix = crypto.randomInt(10000000, 99999999);
        const account = { correo: `compose${suffix}@example.invalid`, numero_suministro: '9' + suffix, password: 'FixtureCompose123' };
        const pending = await request(base, '/api/auth/otp/register', { ...account, solicitud_id: crypto.randomUUID() });
        assert.equal(pending.status, 202);
        const job = (await db.query('SELECT o.*,e.registro_id FROM correo_outbox o JOIN registros_correo_envios e USING(id) WHERE e.registro_id=$1', [pending.data.registro_id])).rows[0];
        assert.equal(job.estado, 'pendiente');
        const message = JSON.parse(descifrarMensaje(job.payload, Buffer.from(process.env.EMAIL_OUTBOX_KEY, 'base64'), job.id, job.registro_id));
        const code = message.text.match(/: (\d{6})/)[1];
        console.log('fixture_encolado: iniciar únicamente el worker del Compose integrado');
        let delivered;
        for (let i = 0; i < 120; i++) {
            delivered = (await db.query('SELECT estado,proveedor_id FROM correo_outbox WHERE id=$1', [job.id])).rows[0];
            if (delivered.estado === 'aceptado') break;
            await delay(500);
        }
        assert.equal(delivered.estado, 'aceptado'); assert.match(delivered.proveedor_id, /^stub-/);
        const verified = await request(base, '/api/auth/verify-email', { registro_id: pending.data.registro_id, codigo: code });
        assert.equal(verified.status, 201);
        const login = await request(base, '/api/auth/login', { numero_suministro: account.numero_suministro, password: account.password });
        assert.equal(login.status, 200);
        const token = login.data.token;
        for (const route of ['/api/me/perfil', '/api/recibos/' + account.numero_suministro, '/api/incidencias/' + account.numero_suministro]) {
            assert.equal((await request(base, route, undefined, token)).status, 200);
        }
        assert.equal((await request(panel, '/api/admin/usuarios', undefined, token)).status, 403);
        // Elevar solo esta cuenta fixture comprueba el login/permiso real del panel.
        await db.query("UPDATE usuarios SET rol='admin' WHERE id_usuario=$1", [verified.data.usuario.id_usuario]);
        const admin = await request(panel, '/api/auth/login', { numero_suministro: account.numero_suministro, password: account.password });
        assert.equal(admin.status, 200);
        assert.equal((await request(panel, '/api/admin/usuarios', undefined, admin.data.token)).status, 200);
        console.log('OK: Nginx cliente/panel → backend → Auth; worker → Notifications stub; permisos y módulos conservados.');
    } finally { await db.end(); }
}
if (require.main === module) main().catch(() => { console.error('Falló smoke del laboratorio integrado; revisar aserciones sin publicar datos.'); process.exitCode = 1; });
