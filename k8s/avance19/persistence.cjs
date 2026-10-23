'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const state=path.resolve(__dirname,'../../artifacts/kubernetes-avance-19/state');
const kube=(...args)=>execFileSync('bash',[path.join(__dirname,'kube.sh'),...args],{encoding:'utf8',timeout:240000});
const json=(...args)=>JSON.parse(kube(...args,'-o','json'));
const pod=app=>json('get','pods','-l','app='+app).items.find(p=>!p.metadata.deletionTimestamp);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 assert.equal(json('get','nodes').items[0].metadata.name,'hidro-avance19-control-plane');
 const report=JSON.parse(fs.readFileSync(path.join(state,'verification.json')));assert.equal(report.status,'passed');
 const pvc=json('get','pvc','db-data'),beforeDB=pod('db'),beforeAPI=pod('backend');
 // Solo recrea el Pod propio; conserva PVC, volumen y todas las filas.
 console.log(kube('rollout','restart','deployment/db').trim());console.log(kube('rollout','status','deployment/db','--timeout=180s').trim());
 const end=Date.now()+60000;let healthy=false;
 while(Date.now()<end){try{healthy=(await fetch('http://localhost:8084/api/health',{signal:AbortSignal.timeout(2000)})).ok;}catch{}if(healthy)break;await pause(500);}
 assert.ok(healthy,'API debe recuperar SQL');
 const accounts=JSON.parse(fs.readFileSync(path.join(state,'accounts.json')));
 const r=await fetch('http://localhost:8084/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(accounts.user)});assert.equal(r.status,200);const {token}=await r.json();
 const headers={Authorization:'Bearer '+token};
 const receipts=await(await fetch('http://localhost:8084/api/me/recibos',{headers})).json();assert.ok(receipts.recibos.some(x=>String(x.id_recibo)===String(report.receiptId)));
 const payments=await(await fetch('http://localhost:8084/api/me/pagos',{headers})).json();assert.equal(payments.pagos.filter(x=>String(x.id_recibo)===String(report.receiptId)).length,1);
 const incidents=await(await fetch('http://localhost:8084/api/me/incidencias',{headers})).json();assert.ok(incidents.incidencias.some(x=>x.descripcion.includes(report.marker)));
 const afterDB=pod('db'),afterAPI=pod('backend');assert.notEqual(beforeDB.metadata.uid,afterDB.metadata.uid);assert.equal(json('get','pvc','db-data').metadata.uid,pvc.metadata.uid);
 assert.equal(afterAPI.metadata.uid,beforeAPI.metadata.uid);assert.equal(afterAPI.status.containerStatuses[0].restartCount,beforeAPI.status.containerStatuses[0].restartCount);
 const result={status:'passed',date:new Date().toISOString(),pvcUID:pvc.metadata.uid,previousDBPod:beforeDB.metadata.uid,currentDBPod:afterDB.metadata.uid,backendRestarts:afterAPI.status.containerStatuses[0].restartCount,checks:['UID del Pod DB cambió','PVC idéntico','Login y recibo/pago/incidencia conservados','Backend recuperó SQL sin reiniciar']};
 fs.writeFileSync(path.join(state,'persistence.json'),JSON.stringify(result,null,2),{mode:0o600});console.log('OK: persistencia y reconexión SQL tras recrear el Pod PostgreSQL propio; backend sin reinicios.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
