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
  if (!fs.existsSync(credentialsFile)) {
    fs.writeFileSync(credentialsFile, JSON.stringify({
      admin: { correo: 'admin@prueba.invalid', numero_suministro: '900000001', password: 'AdminLocal2026!' },
      user: { correo: 'usuario@prueba.invalid', numero_suministro: '900000002', password: 'UsuarioLocal2026!' }
    }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  }
  const credentials = JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));
  for (const base of [webBase, adminBase]) {
    assert.equal((await fetch(base)).status, 200);
    assert.equal((await request(base, '/api/health')).estado, 'ok');
  }
  for (const account of [credentials.admin, credentials.user]) {
    const response = await fetch(adminBase + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(account) });
    assert.ok([201, 409].includes(response.status), 'Registro local: ' + await response.text());
    // Antes de promover, comprobar la contraseña del suministro existente.
    await request(adminBase, '/api/auth/login', 'POST', null, account);
  }
  const promotion = `const {Pool}=require('pg');let raw='';process.stdin.on('data',x=>raw+=x);process.stdin.on('end',async()=>{const a=JSON.parse(raw);const p=new Pool({host:process.env.DB_HOST,port:process.env.DB_PORT,database:process.env.POSTGRES_DB,user:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD});try{const r=await p.query("UPDATE usuarios u SET rol='admin' FROM suministros s WHERE s.id_usuario=u.id_usuario AND u.correo=$1 AND s.numero_suministro=$2 RETURNING u.id_usuario",[a.correo,a.numero_suministro]);if(r.rowCount!==1)throw Error('Cuenta local no coincide');console.log('Administrador local habilitado');}catch(e){console.error(e.message);process.exitCode=1;}finally{await p.end();}});`;
  console.log(run(['exec', '-i', 'deployment/backend', '--', 'node', '-e', promotion], JSON.stringify(credentials.admin)).trim());
  const admin = await request(adminBase, '/api/auth/login', 'POST', null, credentials.admin);
  const user = await request(webBase, '/api/auth/login', 'POST', null, credentials.user);
  assert.equal(admin.usuario.rol, 'admin');
  assert.equal(user.usuario.rol, 'usuario');
  console.log('OK: login con suministro/contraseña en ambos paneles y roles correctos.');
  console.log(run(['exec', '-i', 'deployment/backend', '--', 'env', 'TEST_WEB_ORIGIN=' + webBase, 'TEST_ADMIN_ORIGIN=' + adminBase, 'node'], fs.readFileSync(path.join(root, 'scripts/check-admin-local.cjs'))));
  const marker = 'Prueba K8s ' + Date.now();
  const attention = await request(webBase, '/api/atencion', 'POST', user.token,
    { categoria: 'Prueba local', asunto: marker, descripcion: 'Solicitud creada en Kubernetes local para verificar el flujo completo.' }, 201);
  const id = attention.solicitud.id_solicitud;
  await request(adminBase, '/api/admin/atencion/' + id, 'PATCH', admin.token,
    { estado: 'Respondida', respuesta: 'Respuesta verificada desde Kubernetes local.' });
  const list = await request(webBase, '/api/atencion', 'GET', user.token);
  assert.ok(JSON.stringify(list).includes('Respuesta verificada desde Kubernetes local.'));
  console.log('OK: usuario crea solicitud; administrador responde; usuario consulta respuesta persistida.');
  fs.writeFileSync(path.join(root, '.local/k8s/state/verification.json'), JSON.stringify({ date: new Date().toISOString(), attentionId: id, supply: credentials.user.numero_suministro, status: 'passed' }, null, 2) + '\n');
  console.log('OK: verificación completada. Cuentas locales en .local/k8s/state/accounts.json (excluido de Git).');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
