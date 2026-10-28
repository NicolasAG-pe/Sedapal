'use strict';
// Cadena real en una base NUEVA. Nunca consulta ni modifica Neon.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { nuevaBase, sql } = require('./email-schema.cjs');

test('007–013 repetibles conservan historia; dependencias 008/012 fallan cerradas', async () => {
  const { pool, connection } = await nuevaBase('quality_migrations');
  const client = await pool.connect();
  const result = { newSyntheticDatabase: true, migrated: [], guards: [], previousIncidentEvents: null };
  try {
    const marker = '-- Manual, aditiva e idempotente. No activa 2FA ni modifica cuentas existentes.';
    const source = sql('init.sql'); assert.ok(source.includes(marker));
    await client.query(source.split(marker)[0]);
    await client.query("INSERT INTO usuarios(correo,clave_hash) VALUES('migration@example.invalid','fixture-not-a-login-key'); INSERT INTO suministros(numero_suministro,id_usuario) VALUES('900009901',1); INSERT INTO incidencias(id_suministro,tipo,descripcion,estado) VALUES(1,'Fuga','Reporte anterior sintético','En revisión')");
    const files = fs.readdirSync(path.join(__dirname, '../../Base-de-Datos/migrations')).filter(name => /^0(?:07|08|09|10|11|12|13)_/.test(name)).sort();
    assert.equal(files.length, 7);
    for (const file of files) {
      if (file.startsWith('007') || file.startsWith('011')) {
        const guard = file.startsWith('007') ? files.find(n => n.startsWith('008')) : files.find(n => n.startsWith('012'));
        await assert.rejects(client.query(sql('migrations/' + guard)), { code: 'P0001' });
        await client.query('ROLLBACK'); result.guards.push(guard.slice(0, 3));
      }
      for (let repeat = 0; repeat < 2; repeat++) await client.query(sql('migrations/' + file));
      result.migrated.push(file.slice(0, 3));
    }
    assert.equal((await client.query('SELECT correo FROM usuarios WHERE id_usuario=1')).rows[0].correo, 'migration@example.invalid');
    assert.equal((await client.query('SELECT estado FROM incidencias WHERE id_incidencia=1')).rows[0].estado, 'En revisión');
    result.previousIncidentEvents = (await client.query('SELECT count(*)::int n FROM incidencia_eventos WHERE id_incidencia=1')).rows[0].n;
    assert.equal(result.previousIncidentEvents, 0, 'No inventar seguimiento anterior');
    await client.query("INSERT INTO incidencias(id_suministro,tipo,descripcion) VALUES(1,'Fuga','Nuevo reporte sintético')");
    assert.equal((await client.query('SELECT count(*)::int n FROM incidencia_eventos WHERE id_incidencia=2')).rows[0].n, 1);
    result.database = connection.database;
    result.result = 'passed';
    const out = path.join(__dirname, '../../artifacts/auditoria-calidad-120'); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'migrations.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
  } finally { client.release(); await pool.end(); }
});
