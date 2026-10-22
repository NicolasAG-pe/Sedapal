'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const kube = path.join(__dirname, 'kubectl.sh');
const reportFile = path.join(root, '.local/k8s/state/verification.json');
(async () => {
  const report = JSON.parse(fs.readFileSync(reportFile));
  const backendState = () => {
    const data = JSON.parse(execFileSync(kube, ['get', 'pod', '-l', 'app=backend', '-o', 'json'], { encoding: 'utf8' }));
    const pod = data.items.find(item => !item.metadata.deletionTimestamp);
    return { uid: pod.metadata.uid, container: pod.status.containerStatuses[0].containerID, restarts: pod.status.containerStatuses[0].restartCount };
  };
  assert.equal((await fetch('http://localhost:8082/api/health')).status, 200);
  const before = backendState();
  execFileSync(kube, ['rollout', 'restart', 'deployment/db'], { stdio: 'inherit' });
  execFileSync(kube, ['rollout', 'status', 'deployment/db', '--timeout=180s'], { stdio: 'inherit' });
  let healthy = false;
  for (let i = 0; i < 30; i++) {
    try { healthy = (await fetch('http://localhost:8082/api/health', { signal: AbortSignal.timeout(3000) })).ok; } catch {}
    if (healthy) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(healthy, 'Backend debe recuperar conexión a PostgreSQL');
  const accounts = JSON.parse(fs.readFileSync(path.join(root, '.local/k8s/state/accounts.json')));
  for (const [role, base] of [['admin', 'http://localhost:8083'], ['user', 'http://localhost:8082']]) {
    const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(accounts[role]) });
    assert.equal(login.status, 200, 'Cuenta persistida: ' + role);
    const session = await login.json();
    if (role === 'user') {
      const response = await fetch(base + '/api/atencion', { headers: { Authorization: 'Bearer ' + session.token } });
      assert.equal(response.status, 200);
      const data = await response.json();
      const rows = data.solicitudes;
      assert.ok(Array.isArray(rows), 'Lista de solicitudes');
      const saved = rows.find(row => String(row.id_solicitud) === String(report.attentionId));
      assert.equal(saved?.respuesta, 'Respuesta verificada desde Kubernetes local.');
    }
  }
  assert.deepEqual(backendState(), before, 'El backend debe recuperar la conexión sin reiniciar su contenedor');
  report.persistence = { date: new Date().toISOString(), status: 'passed', action: 'Recreación del Pod PostgreSQL, login de ambas cuentas y lectura de respuesta existente.' };
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  console.log('OK: cuentas y solicitud conservadas después de recrear PostgreSQL; backend recuperado sin reinicios.');
})().catch(error => { console.error(error); process.exitCode = 1; });
