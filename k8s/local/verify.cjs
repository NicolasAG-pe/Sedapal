// Prueba exclusiva del clúster local creado por up.sh. No utiliza .env.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const kube = path.join(__dirname, 'kubectl.sh');
const credentialsFile = path.join(root, '.local/k8s/state/accounts.json');
const adminBase = 'http://localhost:8083', webBase = 'http://localhost:8082';
const run = (args, input) => execFileSync(kube, args, { cwd: root, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] });
async function request(base, endpoint, method = 'GET', token, body, status = 200) {
  const response = await fetch(base + endpoint, { method, signal: AbortSignal.timeout(15000),
    headers: { Origin: base, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  assert.equal(response.status, status, method + ' ' + endpoint + ': ' + JSON.stringify(data));
  return data;
}
(async () => {
  assert.equal(JSON.parse(run(['get', 'node', 'sedapal-test-control-plane', '-o', 'json'])).metadata.name, 'sedapal-test-control-plane');
  assert.ok(fs.existsSync(credentialsFile), 'Proveer accounts.json sintético privado: no se crean ni promueven cuentas ni se omite OTP.');
  const credentials = JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));
  for (const base of [webBase, adminBase]) {
    assert.equal((await fetch(base)).status, 200);
    assert.equal((await request(base, '/api/health')).estado, 'ok');
  }
  // El cliente 1.0.0 debe recibir 426 sin crear cuentas ni encolar correo.
  await request(webBase, '/api/auth/register', 'POST', null, {}, 426);
  const admin = await request(adminBase, '/api/auth/login', 'POST', null, credentials.admin);
  const user = await request(webBase, '/api/auth/login', 'POST', null, credentials.user);
  assert.equal(admin.usuario.rol, 'admin');
  assert.equal(user.usuario.rol, 'usuario');
  console.log('OK: login con suministro/contraseña en ambos paneles y roles correctos.');
  console.log(run(['exec', '-i', 'deployment/backend', '--', 'env', 'TEST_WEB_ORIGIN=' + webBase, 'TEST_ADMIN_ORIGIN=' + adminBase, 'node'], fs.readFileSync(path.join(root, 'scripts/check-admin-local.cjs'))));
  const session = await request(webBase, '/api/auth/session', 'GET', user.token);
  assert.equal(session.suministro.numero_suministro, credentials.user.numero_suministro);
  await request(webBase, '/api/auth/session', 'GET', null, null, 401);
  console.log('OK: contrato legacy 426 y validación de sesión con cuenta existente.');
  fs.writeFileSync(path.join(root, '.local/k8s/state/verification.json'), JSON.stringify({ date: new Date().toISOString(), supply: credentials.user.numero_suministro, status: 'passed' }, null, 2) + '\n');
  console.log('OK: verificación completada. Cuentas locales en .local/k8s/state/accounts.json (excluido de Git). Sin altas ni promoción automática.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
