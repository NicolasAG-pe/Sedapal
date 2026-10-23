'use strict';
// Renderizado local sin contexto/servidor Kubernetes. SQL solo en base nueva.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const YAML = require(process.env.HIDRO_YAML_MODULE || 'yaml');
const { nuevaBase, sql } = require('../../Backend/test/email-schema.cjs');
const root = path.resolve(__dirname, '../..');
const kubectl = process.env.HIDRO_KUBECTL || 'kubectl';
function render(target) {
  return YAML.parseAllDocuments(execFileSync(kubectl, ['kustomize', 'k8s/' + target,
    '--load-restrictor', 'LoadRestrictionsNone'], { cwd: root, encoding: 'utf8' })).map(d => {
      assert.deepEqual(d.errors, []);return d.toJSON();
    });
}
const find = (items, kind, name) => items.find(x => x.kind === kind && x.metadata.name === name);
const container = resource => resource.spec.template.spec.containers[0];
const env = resource => Object.fromEntries(container(resource).env.map(x => [x.name,x]));

test('base y overlays: fuente SQL vigente, PVC, red, secretos y altas cerradas', () => {
  for (const target of ['base', 'local', 'mail']) {
    const items = render(target);
    assert.equal(items.filter(x => x.kind === 'Secret').length, 0, 'No valores secretos renderizados');
    const init = items.find(x => x.kind === 'ConfigMap' && x.data?.['01-init.sql']);
    assert.equal(init.data['01-init.sql'], sql('init.sql'));
    const db = find(items,'Deployment','db');
    assert.equal(container(db).image,'postgres:18');
    assert.equal(db.spec.strategy.type,'Recreate');
    assert.ok(db.spec.template.spec.volumes.some(v => v.persistentVolumeClaim?.claimName === 'db-data'));
    assert.ok(db.spec.template.spec.volumes.some(v => v.configMap?.name === init.metadata.name));
    assert.equal(find(items,'Service','db').spec.type,'ClusterIP');
    const backend = find(items,'Deployment','backend'), config = env(backend);
    assert.equal(backend.spec.replicas,1);
    assert.equal(config.EMAIL_REGISTRATION_ENABLED.value,'0');
    assert.ok(config.CORS_ALLOWED_ORIGINS.value.split(',').includes('https://localhost'));
    assert.equal(config.AUTH_TOKEN_SECRET.valueFrom.secretKeyRef.key,'AUTH_TOKEN_SECRET');
    assert.equal(config.RESEND_API_KEY,undefined, 'Solo el worker necesita clave Resend');
    assert.equal(container(backend).readinessProbe.httpGet.path,'/api/health');
    for (const workload of items.filter(x => x.kind === 'Deployment')) {
      assert.equal(workload.spec.template.spec.automountServiceAccountToken,false);
      for (const entry of container(workload).env || []) {
        if (/PASSWORD|SECRET|KEY|DATABASE_URL/.test(entry.name)) assert.ok(entry.valueFrom?.secretKeyRef,entry.name);
      }
    }
    for (const name of ['web','admin']) {
      assert.ok(find(items,'Service',name));
      const conf=fs.readFileSync(path.join(root,name==='web'?'Frontend':'Admin','nginx/default.conf'),'utf8');
      assert.match(conf,/backend:3000/);assert.match(conf,/socket\.io/);assert.match(conf,/Upgrade/);
    }
    if (target==='local') {
      assert.equal(find(items,'Service','web').spec.ports[0].nodePort,30080);
      assert.equal(find(items,'Service','admin').spec.ports[0].nodePort,30081);
    }
    if (target==='mail') {
      const worker = find(items,'Deployment','email-worker');
      assert.equal(worker.spec.replicas,0);
      assert.equal(container(worker).image,container(backend).image);
      assert.deepEqual(container(worker).command,['node','workers/email-outbox.cjs','--run']);
      const vars = env(worker);
      for (const key of ['EMAIL_WORKER_DATABASE_URL','EMAIL_WORKER_EXPECTED_DATABASE','EMAIL_OUTBOX_KEY','RESEND_API_KEY']) assert.ok(vars[key].valueFrom.secretKeyRef);
      assert.deepEqual(config.EMAIL_OUTBOX_KEY.valueFrom,vars.EMAIL_OUTBOX_KEY.valueFrom);
      assert.equal(vars.AUTH_TOKEN_SECRET,undefined);
      assert.equal(vars.EMAIL_OTP_SECRET,undefined);
    }
  }
});

test('SQL renderizado inicializa base nueva compatible con migraciones 003–006', async () => {
  const items=render('base');const init=items.find(x=>x.kind==='ConfigMap').data['01-init.sql'];
  const {pool}=await nuevaBase('k8s18');
  try {
    await pool.query(init);
    for (let repeat=0;repeat<2;repeat++) {
      for (const file of ['003_verificacion_correo.sql','004_retencion_correo.sql','005_integridad_recibos.sql','006_correo_outbox.sql']) await pool.query(sql('migrations/'+file));
    }
    for (const table of ['registros_correo_pendientes','registros_correo_envios','correo_outbox']) {
      assert.equal((await pool.query('SELECT to_regclass($1)::text AS name',[table])).rows[0].name,table);
    }
    const result=await pool.query("SELECT conname FROM pg_constraint WHERE conname IN ('uq_recibos_suministro_periodo','uq_pagos_recibo')");
    assert.equal(result.rowCount,2);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM usuarios')).rows[0].n,0);
  } finally {await pool.end();}
});

test('cierre operativo de altas rechaza registro aun con secretos válidos, sin encolar', async () => {
  process.env.EMAIL_REGISTRATION_ENABLED='0';let ctx;
  try {
    ctx=await require('../../Backend/test/email-api.cjs').iniciar({autoDrain:false});
    await ctx.request('register',ctx.registro(818),503);
    assert.equal((await ctx.db.query('SELECT COUNT(*)::int AS n FROM registros_correo_pendientes')).rows[0].n,0);
    assert.equal((await ctx.db.query('SELECT COUNT(*)::int AS n FROM correo_outbox')).rows[0].n,0);
    assert.equal(ctx.mensajes.length,0);
    // Una solicitud ya enviada todavía puede consultarse/confirmarse al pausar altas.
    const service=require('../../Backend/email-registration').crearRegistroCorreo({pool:ctx.db,
      key:Buffer.from(process.env.EMAIL_OUTBOX_KEY,'base64'),from:process.env.RESEND_FROM,
      secreto:process.env.EMAIL_OTP_SECRET,generarClaveHash:()=> 'synthetic-hash'});
    const account=ctx.registro(819),pending=await service.registrar(account);
    await ctx.drain();
    await ctx.request('verification-status',{registro_id:pending.registro_id},200);
    await ctx.request('resend-verification',{registro_id:pending.registro_id},503);
    await ctx.request('verify-email',ctx.verificar(pending.registro_id,ctx.codigo(account.correo)),201);
    assert.equal((await fetch(ctx.base+'/api/health')).status,200);
    assert.equal((await fetch(ctx.base+'/api/auth/session')).status,401);
  } finally {if(ctx)await ctx.close();delete process.env.EMAIL_REGISTRATION_ENABLED;}
});
