'use strict';
// Ensayo sintético opt-in. No lee .env, URL PostgreSQL ni datos de otros recursos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const container = process.env.HIDRO_PREPRODUCCION_TEST_CONTAINER;
assert.equal(container, 'hm23-db', 'Requiere el contenedor sintético dedicado del avance 23.');
const inspect = JSON.parse(execFileSync('docker', ['inspect', container]))[0];
assert.equal(inspect.Config.Labels['hidro.avance'], '23');
assert.equal(inspect.State.Running, true);
assert.ok(inspect.NetworkSettings.Networks['hm23-isolated']);
assert.equal(JSON.parse(execFileSync('docker', ['network', 'inspect', 'hm23-isolated']))[0].Internal, true);
const state = path.join(root, 'artifacts/avance-24');
fs.mkdirSync(state, { recursive: true, mode: 0o700 });
const database = 'hm24_preflight_' + crypto.randomBytes(6).toString('hex');
const restored = database + '_restore';
const report = { status: 'running', checks: [], databases: [database, restored] };
const sqlFile = path.join(root, 'Base-de-Datos/checks/024_preproduccion.sql');
const schemaRevision = '864e0e1818ac9a61dd8305411deb63b5b944bfe2';
function save(name, content) { fs.writeFileSync(path.join(state, name), content, { mode: 0o600 }); }
function ok(message) { report.checks.push(message); console.log('OK: ' + message); }
function psql(db, input, vars = []) {
  return execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'hm_fixture', '-d', db,
    '-v', 'ON_ERROR_STOP=1', '--no-align', '--field-separator', '\t', '--pset', 'footer=off', ...vars],
  { input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
}
function diagnostic(db, expected = db, authorized = true, role = 'hm_fixture') {
  // Expandir solo el include conocido; psql por stdin no conserva directorio de archivo.
  const source = fs.readFileSync(sqlFile, 'utf8').replace('\\ir 005_integridad_recibos.sql',
    fs.readFileSync(path.join(root, 'Base-de-Datos/checks/005_integridad_recibos.sql'), 'utf8'));
  return psql(db, source, ['-v', 'expected_database=' + expected, '-v', 'expected_role=' + role,
    '-v', 'huellas_completas=1', ...(authorized ? ['-v', 'diagnostico_autorizado=1'] : [])]);
}
function hashes(output) {
  const result = {};
  for (const match of output.matchAll(/tabla_huella\tfilas\thuella_filas\n([a-z_]+)\t(\d+)\t([a-f0-9]{64})/g))
    result[match[1]] = [match[2], match[3]];
  return result;
}
function photoHash(output) { return output.match(/huella_fotografias\n([a-f0-9]{64})/)[1]; }
function sequenceReport(output) {
  return [...output.matchAll(/secuencia\tlast_value\tis_called\tmaximo_id\n([^\n]+)/g)].map(match => match[1]);
}
const foreignKeys = db => JSON.parse(psql(db, `SELECT json_agg(f ORDER BY tabla,nombre) FROM (
  SELECT conrelid::regclass::text AS tabla,conname AS nombre,pg_get_constraintdef(oid) AS definicion
  FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace) f;`).split('\n').slice(1).join('\n').trim());
const sequences = db => psql(db, "SELECT json_agg(s ORDER BY sequencename) FROM (SELECT sequencename,last_value FROM pg_sequences WHERE schemaname='public') s;");
try {
  assert.match(psql('hm_email_test', 'SHOW server_version;'), /18\./);
  psql('hm_email_test', `CREATE DATABASE "${database}";`);
  const oldSchema = execFileSync('git', ['show', schemaRevision + ':Base-de-Datos/init.sql'], { cwd: root, encoding: 'utf8' });
  assert.ok(!/\b(?:DROP|TRUNCATE)\b/i.test(oldSchema));
  psql(database, oldSchema);
  // PNG mínimo sintético: no fotografía ni información de personas.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGOoBwAAgQCA05RTSgAAAABJRU5ErkJggg==', 'base64');
  psql(database, `BEGIN;
    WITH u AS (INSERT INTO usuarios(correo,clave_hash) VALUES ('preflight24@fixture.invalid','fixture-hash') RETURNING id_usuario)
      INSERT INTO suministros(numero_suministro,id_usuario) SELECT '908000024',id_usuario FROM u;
    INSERT INTO recibos(id_suministro,periodo,fecha_emision,fecha_vencimiento,monto,consumo_m3,estado)
      SELECT id_suministro,'Fixture24','2026-10-01','2030-11-01',12,3,'Pagado' FROM suministros;
    INSERT INTO pagos(id_recibo,monto,metodo) SELECT id_recibo,12,'Fixture24' FROM recibos;
    INSERT INTO incidencias(id_suministro,tipo,descripcion,foto,foto_mime)
      SELECT id_suministro,'Fixture24','Imagen sintética',decode('${png.toString('hex')}','hex'),'image/png' FROM suministros;
    INSERT INTO incidencias(id_suministro,tipo,descripcion) SELECT id_suministro,'Fixture24','Sin imagen' FROM suministros;
    COMMIT;`);
  const seqBefore = sequences(database);
  for (const attempt of [() => diagnostic(database, database, false), () => diagnostic(database, restored),
    () => diagnostic(database, database, true, 'otro_rol_sintetico')]) {
    assert.throws(attempt, error => error.status === 3);
  }
  ok('Guardias rechazan falta de autorización, base y rol incorrectos sin leer filas de negocio.');
  const before = diagnostic(database); save('diagnostico-antes.txt', before);
  assert.match(before, /on\trepeatable read/);
  for (const migration of ['003', '004', '005', '006']) assert.ok(before.includes(migration + '\tf'));
  const original = hashes(before); assert.equal(Object.keys(original).length, 10);
  const fksBefore = foreignKeys(database);
  assert.ok(sequenceReport(before).length > 0);
  assert.equal(Object.values(original).reduce((n, row) => n + Number(row[0]), 0), 6);
  assert.equal(sequences(database), seqBefore);
  ok('Diagnóstico en esquema antiguo: solo lectura, diez tablas, seis filas y cuatro indicios ausentes; no avanza secuencias.');
  for (const migration of ['003_verificacion_correo.sql', '004_retencion_correo.sql', '005_integridad_recibos.sql', '006_correo_outbox.sql'])
    psql(database, fs.readFileSync(path.join(root, 'Base-de-Datos/migrations', migration), 'utf8'));
  const after = diagnostic(database); save('diagnostico-despues.txt', after);
  for (const migration of ['003', '004', '005', '006']) assert.ok(after.includes(migration + '\tt'));
  const current = hashes(after); assert.equal(Object.keys(current).length, 13);
  for (const [table, hash] of Object.entries(original)) assert.deepEqual(current[table], hash);
  const fksAfter = foreignKeys(database);
  for (const fk of fksBefore) assert.ok(fksAfter.some(candidate => JSON.stringify(candidate) === JSON.stringify(fk)));
  assert.deepEqual(sequenceReport(after), sequenceReport(before));
  assert.equal(photoHash(before), photoHash(after)); assert.equal(sequences(database), seqBefore);
  ok('Indicios 003–006 presentes; huellas/conteos de todas las tablas anteriores y fotografía/MIME conservados.');
  const dump = execFileSync('docker', ['exec', container, 'pg_dump', '-U', 'hm_fixture', '-d', database, '--format=custom'], { maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  save('fotografia-sintetica.dump', dump);
  psql('hm_email_test', `CREATE DATABASE "${restored}";`);
  execFileSync('docker', ['exec', '-i', container, 'pg_restore', '-U', 'hm_fixture', '-d', restored,
    '--exit-on-error', '--no-owner'], { input: dump, stdio: ['pipe', 'pipe', 'pipe'] });
  const restoredOutput = diagnostic(restored); save('diagnostico-restaurado.txt', restoredOutput);
  assert.deepEqual(hashes(restoredOutput), current);
  assert.deepEqual(foreignKeys(restored), fksAfter);
  assert.deepEqual(sequenceReport(restoredOutput), sequenceReport(after));
  assert.equal(photoHash(restoredOutput), photoHash(after)); assert.equal(sequences(restored), seqBefore);
  ok('Dump sintético restaurado en base nueva: tablas, filas, fotografía, MIME, secuencias y huellas idénticas.');
  // Validar el archivo con su include relativo real, además del ensayo por stdin.
  const copy = '/tmp/hidro-check24-' + crypto.randomBytes(6).toString('hex');
  execFileSync('docker', ['exec', container, 'mkdir', copy]);
  for (const file of ['024_preproduccion.sql', '005_integridad_recibos.sql'])
    execFileSync('docker', ['cp', path.join(root, 'Base-de-Datos/checks', file), container + ':' + copy + '/' + file]);
  const run = spawnSync('docker', ['exec', container, 'psql', '-X', '-U', 'hm_fixture', '-d', restored,
    '-v', 'diagnostico_autorizado=1', '-v', 'expected_database=' + restored, '-v', 'expected_role=hm_fixture',
    '-f', copy + '/024_preproduccion.sql'], { encoding: 'utf8' });
  assert.equal(run.status, 0); save('diagnostico-include-real.txt', run.stdout);
  ok('Archivo psql real e include 005 válidos; modo ligero sin huellas también aprobado.');
  report.status = 'passed'; report.photoBytes = png.length;
  report.dumpSha256 = crypto.createHash('sha256').update(dump).digest('hex');
} catch (error) {
  report.status = 'failed'; save('diagnostico-error.txt', String(error.stack));
  console.error('Falló ensayo local de diagnóstico; revisar evidencia privada, sin publicar sus datos.'); process.exitCode = 1;
} finally { save('preproduccion24.json', JSON.stringify(report, null, 2) + '\n'); }
