'use strict';
// API real y PostgreSQL aislado: una base nueva por proceso, sin .env ni envíos reales.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { iniciar } = require('./email-api.cjs');
let ctx, admin, user, other, supply, sequence = 0, hook;
const releases = new Set();
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const body = (periodo, monto = 10) => ({ numero_suministro: '950000002', periodo,
    fecha_emision: '2026-10-01', fecha_vencimiento: '2026-11-01', monto, consumo_m3: 1 });
async function request(method, route, token, data, base = ctx.base) {
    const res = await fetch(base + route, { method, signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `198.51.100.${++sequence % 250 + 1}`,
            ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    const result = { status: res.status, data: await res.json() };
    assert.ok(!JSON.stringify(result.data).match(/clave_hash|codigo_hash|SELECT |INSERT INTO|fixture-only/));
    return result;
}
const create = data => request('POST', '/api/admin/recibos', admin, data);
const edit = (id, data) => request('PATCH', '/api/admin/recibos/' + id, admin, data);
const cancel = id => request('PATCH', '/api/admin/recibos/' + id + '/anular', admin);
const pay = (id, token = user) => request('POST', '/api/me/operaciones-pago', token, { id_recibo: id, metodo: 'demostrativo', solicitud_id: crypto.randomUUID(), monto: 999 });
async function receipt(periodo, monto = 10) {
    const result = await create(body(periodo, monto)); assert.equal(result.status, 201);
    return result.data.recibo.id_recibo;
}
async function state(id) {
    return (await ctx.db.query(`SELECT r.estado,r.monto::text,
        (SELECT count(*)::int FROM pagos p WHERE p.id_recibo=r.id_recibo) AS pagos,
        (SELECT min(p.monto)::text FROM pagos p WHERE p.id_recibo=r.id_recibo) AS pagado
        FROM recibos r WHERE r.id_recibo=$1`, [id])).rows[0];
}
function pauseNext(predicate) {
    const reached = deferred(), gate = deferred(); let used = false;
    const release = () => { gate.resolve(); releases.delete(release); };
    releases.add(release);
    hook = async (sql, result) => {
        if (!used && predicate(sql)) { used = true; reached.resolve(); await gate.promise; }
        return result;
    };
    return { reached: Promise.race([reached.promise, new Promise((_, reject) => {
        const timeout = setTimeout(() => reject(new Error('No se alcanzó la barrera SQL.')), 5000); timeout.unref();
    })]), release };
}
async function competing(promise) {
    let finished = false;
    promise.finally(() => { finished = true; }).catch(() => {});
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        if (finished) return;
        const { rows: [r] } = await ctx.db.query(`SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE datname=current_database() AND wait_event_type='Lock'`);
        if (r.n > 0) return;
        await new Promise(r => setTimeout(r, 10));
    }
    throw new Error('La petición competidora no terminó ni esperó un lock PostgreSQL.');
}
const paymentCheck = sql => /AS tiene_pago/.test(sql) && /FROM (?:public\.)?pagos/.test(sql);
before(async () => {
    ctx = await iniciar();
    if (process.env.HIDRO_RECEIPT_TEST_LEGACY === '1') {
        // Únicamente constraints de esta base sintética recién creada; no borra filas.
        await ctx.db.query(`ALTER TABLE recibos DROP CONSTRAINT uq_recibos_suministro_periodo;
            ALTER TABLE pagos DROP CONSTRAINT uq_pagos_recibo`);
    }
    // Intercepta resultados de consultas, conservando la API callback interna de pg.Pool.
    const query = ctx.pool.query.bind(ctx.pool), connect = ctx.pool.connect.bind(ctx.pool);
    const inspect = async (sql, result) => hook ? hook(String(sql), result) : result;
    ctx.pool.query = async (...args) => inspect(args[0], await query(...args));
    ctx.pool.connect = (...args) => typeof args[0] === 'function' ? connect(...args) : connect().then(client => ({
        query: async (...q) => inspect(q[0], await client.query(...q)), release: error => client.release(error)
    }));
    const password = 'FixtureReceipt123', salt = crypto.randomBytes(16).toString('hex');
    const hash = 'scrypt$' + salt + '$' + crypto.scryptSync(password, salt, 64).toString('hex');
    for (const [n, role] of [[1, 'admin'], [2, 'usuario'], [3, 'usuario']]) {
        const { rows: [u] } = await ctx.db.query(`INSERT INTO usuarios(correo,clave_hash,rol)
            VALUES ($1,$2,$3) RETURNING id_usuario`, [`receipt${n}@example.invalid`, hash, role]);
        const { rows: [s] } = await ctx.db.query(`INSERT INTO suministros(numero_suministro,id_usuario)
            VALUES ($1,$2) RETURNING id_suministro`, ['95000000' + n, u.id_usuario]);
        const token = (await ctx.request('login', { numero_suministro: '95000000' + n, password }, 200)).data.token;
        if (n === 1) admin = token;
        if (n === 2) { user = token; supply = s.id_suministro; }
        if (n === 3) other = token;
    }
});
after(async () => {
    for (const release of releases) release(); hook = undefined;
    if (ctx) {
        try {
            assert.equal((await ctx.db.query('SELECT deadlocks FROM pg_stat_database WHERE datname=current_database()')).rows[0].deadlocks, '0');
            assert.equal((await ctx.db.query(`SELECT count(*)::int AS n FROM pg_stat_activity
                WHERE datname=current_database() AND state='idle in transaction'`)).rows[0].n, 0);
            assert.equal(ctx.pool.waitingCount, 0);
            assert.equal(ctx.pool.totalCount, ctx.pool.idleCount);
        } finally { await ctx.close(); }
    }
});

test('alta concurrente: exactamente un 201 y un 409, un recibo y una notificación', { timeout: 20000 }, async () => {
    const pause = pauseNext(sql => /SELECT r.id_recibo/.test(sql) && /r.periodo/.test(sql));
    const first = create(body('duplicado'));
    try {
        await pause.reached;
        const second = create(body('duplicado')); await competing(second); pause.release();
        const results = await Promise.all([first, second]);
        assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
        assert.equal((await ctx.db.query("SELECT count(*)::int AS n FROM recibos WHERE periodo='duplicado'")).rows[0].n, 1);
        assert.equal((await ctx.db.query("SELECT count(*)::int AS n FROM notificaciones WHERE titulo='Nuevo recibo disponible: duplicado'")).rows[0].n, 1);
    } finally { pause.release(); hook = undefined; }
});

test('edición frente a demostración: usa el monto actual sin crear un pago financiero', { timeout: 20000 }, async () => {
    const id = await receipt('editar-pagar'); const pause = pauseNext(paymentCheck);
    const editing = edit(id, body('editar-pagar', 20));
    try {
        await pause.reached; const paying = pay(id); await competing(paying); pause.release();
        const [e, p] = await Promise.all([editing, paying]);
        assert.equal(e.status, 200); assert.equal(p.status, 201);
        assert.deepEqual(await state(id), { estado: 'Emitido', monto: '20.00', pagos: 0, pagado: null });
    } finally { pause.release(); hook = undefined; }
});

test('anulación frente a pago: anulación ganadora impide cualquier pago', { timeout: 20000 }, async () => {
    const id = await receipt('anular-pagar'); const pause = pauseNext(paymentCheck);
    const cancelling = cancel(id);
    try {
        await pause.reached; const paying = pay(id); await competing(paying); pause.release();
        const [c, p] = await Promise.all([cancelling, paying]);
        assert.equal(c.status, 200); assert.equal(p.status, 409);
        assert.deepEqual(await state(id), { estado: 'Anulado', monto: '10.00', pagos: 0, pagado: null });
    } finally { pause.release(); hook = undefined; }
});

test('demostración no impide editar o anular ni crea acreditaciones paralelas', { timeout: 20000 }, async () => {
    const id = await receipt('demo-primero');
    const pause = pauseNext(sql => /FROM recibos WHERE id_recibo/.test(sql) && /FOR UPDATE/.test(sql));
    const paying = pay(id);
    try {
        await pause.reached;
        const editing = edit(id, body('demo-primero', 30));
        await competing(editing); pause.release();
        assert.deepEqual((await Promise.all([paying,editing])).map(r=>r.status),[201,200]);
        assert.equal((await cancel(id)).status,200);
        assert.deepEqual(await state(id), { estado:'Anulado', monto:'30.00', pagos:0, pagado:null });
    } finally { pause.release(); hook=undefined; }
});

test('permisos, propiedad, validación y compatibilidad de respuestas', async () => {
    const id = await receipt('permisos');
    for (const [method, url, data] of [
        ['POST', '/api/admin/recibos', body('prohibido')],
        ['PATCH', '/api/admin/recibos/' + id, body('permisos', 20)],
        ['PATCH', '/api/admin/recibos/' + id + '/anular', undefined]
    ]) {
        assert.equal((await request(method, url, undefined, data)).status, 401);
        assert.equal((await request(method, url, user, data)).status, 403);
    }
    assert.equal((await pay(id, other)).status, 404);
    assert.equal((await create(body(''))).status, 400);
    assert.equal((await create({ ...body('inexistente'), numero_suministro: '959999999' })).status, 404);
    assert.equal((await edit(999999, body('inexistente'))).status, 404);
    assert.equal((await cancel(999999)).status, 404);
    assert.equal((await pay(999999)).status, 404);
    const edited = await edit(id, { ...body('permisos', 25), numero_suministro: '950000003', estado: 'Pagado' });
    assert.equal(edited.status, 200);
    assert.equal(edited.data.estado, 'ok'); assert.equal(edited.data.recibo.numero_suministro, '950000002');
    assert.equal(edited.data.recibo.estado, 'Emitido'); assert.equal(edited.data.recibo.tiene_pago, false);
    assert.equal((await ctx.db.query('SELECT id_suministro FROM recibos WHERE id_recibo=$1', [id])).rows[0].id_suministro, supply);
    assert.equal((await cancel(id)).status, 200); assert.equal((await cancel(id)).status, 200);
    assert.equal((await pay(id)).status, 409);
    // Editar Anulado sin pago era permitido por el panel; no cambia ese contrato.
    assert.equal((await edit(id, body('permisos', 26))).status, 200);
    assert.equal((await state(id)).estado, 'Anulado');
});

test('ediciones concurrentes y alta/edición comparten unicidad; intercambio no deadlockea', async () => {
    const a = await receipt('periodo-a'), b = await receipt('periodo-b');
    const edited = await Promise.all([edit(a, body('destino')), edit(b, body('destino'))]);
    assert.deepEqual(edited.map(r => r.status).sort(), [200, 409]);
    const id = await receipt('antes-alta');
    const raced = await Promise.all([edit(id, body('nuevo-destino')), create(body('nuevo-destino'))]);
    assert.ok((raced[0].status === 200 && raced[1].status === 409) ||
        (raced[0].status === 409 && raced[1].status === 201));
    assert.equal((await ctx.db.query("SELECT count(*)::int AS n FROM recibos WHERE periodo='nuevo-destino'")).rows[0].n, 1);
    const c = await receipt('intercambio-c'), d = await receipt('intercambio-d');
    assert.deepEqual((await Promise.all([edit(c, body('intercambio-d')), edit(d, body('intercambio-c'))])).map(r => r.status), [409, 409]);
});

test('histórico inconsistente no permite segundo pago ni cambios de recibo pagado', async () => {
    const id = await receipt('historico-pago');
    await ctx.db.query("INSERT INTO pagos(id_recibo,monto,metodo) VALUES ($1,10,'fixture')", [id]);
    for (const call of [() => pay(id), () => edit(id, body('historico-pago', 50)), () => cancel(id)]) assert.equal((await call()).status, 409);
    const missing = await receipt('historico-estado');
    await ctx.db.query("UPDATE recibos SET estado='Pagado' WHERE id_recibo=$1", [missing]);
    for (const call of [() => pay(missing), () => edit(missing, body('historico-estado', 50)), () => cancel(missing)]) assert.equal((await call()).status, 409);
});

test('fallo tras insertar declaración revierte todo; error público no contiene detalles SQL', async () => {
    const id = await receipt('rollback');
    hook = async (sql, result) => { if (/INSERT INTO operaciones_pago/.test(sql)) throw new Error('fixture-sensitive-details'); return result; };
    const errors = [], original = console.error; console.error = value => errors.push(String(value));
    try {
        const result = await pay(id);
        assert.equal(result.status, 500); assert.equal(result.data.mensaje, 'No se pudo procesar la operación.');
        assert.ok(!errors.join('').includes('fixture-sensitive-details'));
        assert.deepEqual(await state(id), { estado: 'Emitido', monto: '10.00', pagos: 0, pagado: null });
    } finally { hook = undefined; console.error = original; }
    assert.equal((await pay(id)).status, 201);
});

test('lock_timeout responde 409, revierte y libera conexión; otros suministros avanzan', async () => {
    const id = await receipt('lock-timeout'), locker = await ctx.db.connect();
    try {
        await locker.query('BEGIN'); await locker.query('SELECT 1 FROM suministros WHERE id_suministro=$1 FOR NO KEY UPDATE', [supply]);
        const blocked = edit(id, body('lock-timeout', 40));
        assert.equal((await create({ ...body('independiente'), numero_suministro: '950000003' })).status, 201);
        assert.equal((await blocked).status, 409);
        assert.equal((await state(id)).monto, '10.00');
    } finally { await locker.query('ROLLBACK'); locker.release(); }
    assert.equal((await edit(id, body('lock-timeout', 40))).status, 200);
});

test('carga mixta concurrente no convierte demostraciones en pagos financieros', async () => {
    const ids = await Promise.all([1, 2, 3].map(n => receipt('mixto-' + n)));
    const results = await Promise.all(ids.flatMap((id, index) => [
        pay(id), edit(id, body('mixto-' + (index + 1), 35)), cancel(id), pay(id)
    ]));
    assert.ok(results.every(r => [200, 201, 409].includes(r.status)));
    for (const id of ids) {
        const r = await state(id); assert.ok(r.pagos <= 1);
        if (r.pagos) { assert.equal(r.estado, 'Pagado'); assert.equal(r.monto, r.pagado); }
        else assert.equal(r.estado, 'Anulado');
    }
});

test('dos procesos API independientes no duplican el mismo suministro/periodo', { timeout: 20000 }, async () => {
    const { spawn } = require('node:child_process');
    const code = `const b=require('./Backend/server'); b.httpServer.listen(0,'127.0.0.1',()=>process.send(b.httpServer.address().port));
        process.on('message',()=>b.io.close(()=>b.pool.end().then(()=>process.exit(0))));`;
    const child = spawn(process.execPath, ['-e', code], { cwd: require('node:path').resolve(__dirname, '../..'),
        env: { ...process.env, RESEND_API_KEY: '', RESEND_FROM: '', EMAIL_OTP_SECRET: '' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    let timer;
    try {
        const port = await new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(new Error('API secundaria no inició.')), 5000);
            child.once('message', resolve); child.once('error', reject); child.once('exit', () => reject(new Error('API secundaria terminó.')));
        }); clearTimeout(timer);
        const results = await Promise.all([create(body('dos-procesos')),
            request('POST', '/api/admin/recibos', admin, body('dos-procesos'), 'http://127.0.0.1:' + port)]);
        assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
        assert.equal((await ctx.db.query("SELECT count(*)::int AS n FROM recibos WHERE periodo='dos-procesos'")).rows[0].n, 1);
    } finally {
        clearTimeout(timer);
        if (child.connected) child.send('stop');
        await new Promise(resolve => { const timeout = setTimeout(() => { child.kill('SIGTERM'); resolve(); }, 2000);
            child.once('exit', () => { clearTimeout(timeout); resolve(); }); });
    }
});

test('UNIQUE resuelve escritor externo intercalado con 409 sanitizado',
    { skip: process.env.HIDRO_RECEIPT_TEST_LEGACY === '1' }, async () => {
        const pause = pauseNext(sql => /SELECT r.id_recibo/.test(sql) && /r.periodo/.test(sql));
        const creating = create(body('escritor-externo'));
        try {
            await pause.reached;
            await ctx.db.query(`INSERT INTO recibos(id_suministro,periodo,fecha_emision,fecha_vencimiento,monto,consumo_m3,estado)
                VALUES ($1,'escritor-externo',CURRENT_DATE,CURRENT_DATE,10,1,'Emitido')`, [supply]);
            pause.release(); assert.equal((await creating).status, 409);
            assert.equal((await ctx.db.query("SELECT count(*)::int AS n FROM recibos WHERE periodo='escritor-externo'")).rows[0].n, 1);
        } finally { pause.release(); hook = undefined; }
    });

test('histórico duplicado sin migración se conserva pero no puede cobrarse',
    { skip: process.env.HIDRO_RECEIPT_TEST_LEGACY !== '1' }, async () => {
        const id = await receipt('historico-duplicado');
        await ctx.db.query(`INSERT INTO recibos(id_suministro,periodo,fecha_emision,fecha_vencimiento,monto,consumo_m3,estado)
            VALUES ($1,'historico-duplicado',CURRENT_DATE,CURRENT_DATE,10,1,'Emitido')`, [supply]);
        assert.equal((await pay(id)).status, 409);
        assert.equal((await state(id)).pagos, 0);
        assert.equal((await ctx.db.query("SELECT count(*)::int AS n FROM recibos WHERE periodo='historico-duplicado'")).rows[0].n, 2);
    });
