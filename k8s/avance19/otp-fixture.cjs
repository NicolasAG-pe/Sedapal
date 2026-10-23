'use strict';
// Opt-in, clúster fijo, DB nueva, API solo ClusterIP, proveedor que nunca usa red.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),state=path.join(root,'artifacts/kubernetes-avance-19/state');
const kube=(args,input)=>execFileSync('bash',[path.join(__dirname,'kube.sh'),...args],{encoding:'utf8',input,timeout:120000,maxBuffer:8*1024*1024});
const create=obj=>kube(['create','-f','-'],JSON.stringify(obj));
const node=(source,input)=>JSON.parse(kube(['exec','-i','deployment/backend','--','node','-e',source],JSON.stringify(input)));
const suffix=crypto.randomBytes(4).toString('hex'),database='hm_avance19_otp_'+suffix;
const apiName='otp-api19-'+suffix,workerName='otp-worker19-'+suffix,secretName='otp-secret19-'+suffix,configName='otp-provider19-'+suffix;
const report={cluster:'hidro-avance19',database,apiName,workerName,checks:[]};let resourcesStarted=false;
const ok=text=>{report.checks.push(text);console.log('OK: '+text);};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function request(endpoint,body,status=200,token){
 return node(`const assert=require('node:assert/strict');(async()=>{let s='';for await(const d of process.stdin)s+=d;const p=JSON.parse(s);const r=await fetch(p.url,{method:p.body?'POST':'GET',headers:{'Content-Type':'application/json','X-Hidro-Auth-Contract':'otp-outbox-v1',...(p.token?{Authorization:'Bearer '+p.token}:{})},...(p.body?{body:JSON.stringify(p.body)}:{}),signal:AbortSignal.timeout(10000)});assert.equal(r.status,p.status,'HTTP interno OTP');console.log(JSON.stringify(await r.json()));})().catch(()=>{console.error('Fallo de contrato OTP interno');process.exitCode=1;});`,{url:'http://'+apiName+':3000/api/auth/'+endpoint,body,status,token});
}
function sql(query,params=[]){return node(`const assert=require('node:assert/strict'),{Pool}=require('pg');(async()=>{let s='';for await(const d of process.stdin)s+=d;const p=JSON.parse(s);assert.match(p.database,/^hm_avance19_otp_[a-f0-9]{8}$/);const db=new Pool({host:process.env.DB_HOST,port:process.env.DB_PORT,user:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD,database:p.database});try{console.log(JSON.stringify((await db.query(p.query,p.params)).rows));}finally{await db.end();}})().catch(()=>process.exitCode=1);`,{database,query,params});}
(async()=>{
 assert.deepEqual(process.argv.slice(2),['--simulated-only'],'Requiere --simulated-only');
 assert.equal(JSON.parse(kube(['get','nodes','-o','json'])).items[0].metadata.name,'hidro-avance19-control-plane');
 const dbSecret=JSON.parse(kube(['get','secret','sedapal-secrets','-o','json']));
 const decode=name=>Buffer.from(dbSecret.data[name],'base64').toString();assert.equal(decode('POSTGRES_DB'),'hm_avance19');
 const migrations=['003_verificacion_correo.sql','004_retencion_correo.sql','005_integridad_recibos.sql','006_correo_outbox.sql'];
 node(`const assert=require('node:assert/strict'),{Pool}=require('pg');(async()=>{let s='';for await(const d of process.stdin)s+=d;const p=JSON.parse(s);assert.match(p.database,/^hm_avance19_otp_[a-f0-9]{8}$/);const cfg={host:process.env.DB_HOST,port:process.env.DB_PORT,user:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD};const parent=new Pool({...cfg,database:process.env.POSTGRES_DB});try{assert.equal((await parent.query('select current_database() db')).rows[0].db,'hm_avance19');await parent.query('CREATE DATABASE "'+p.database+'"');}finally{await parent.end();}const db=new Pool({...cfg,database:p.database});try{await db.query(p.init);for(const migration of p.migrations)await db.query(migration);console.log(JSON.stringify({fresh:true}));}finally{await db.end();}})().catch(()=>{console.error('Fallo de DB nueva OTP');process.exitCode=1;});`,{database,init:fs.readFileSync(path.join(root,'Base-de-Datos/init.sql'),'utf8'),migrations:migrations.map(f=>fs.readFileSync(path.join(root,'Base-de-Datos/migrations',f),'utf8'))});
 ok('PostgreSQL Kubernetes: base OTP nueva e init/migraciones 003–006 compatibles');
 const data={POSTGRES_DB:database,POSTGRES_USER:decode('POSTGRES_USER'),POSTGRES_PASSWORD:decode('POSTGRES_PASSWORD'),AUTH_TOKEN_SECRET:crypto.randomBytes(48).toString('hex'),EMAIL_OTP_SECRET:crypto.randomBytes(32).toString('hex'),EMAIL_OUTBOX_KEY:crypto.randomBytes(32).toString('base64'),RESEND_FROM:'correo@fixture.invalid',RESEND_API_KEY:'fixture-provider-key'};
 data.EMAIL_WORKER_DATABASE_URL='postgres://'+encodeURIComponent(data.POSTGRES_USER)+':'+encodeURIComponent(data.POSTGRES_PASSWORD)+'@db:5432/'+database;
 create({apiVersion:'v1',kind:'Secret',metadata:{name:secretName},type:'Opaque',stringData:data});
 const provider=`'use strict';const fs=require('node:fs'),crypto=require('node:crypto');global.fetch=async(url,options)=>{if(String(url)!=='https://api.resend.com/emails')throw Error('Fixture bloquea toda salida HTTP externa');const body=JSON.parse(options.body),codigo=body.text.match(/: (\\d{6})/)[1];fs.writeFileSync('/mailbox/'+crypto.randomUUID()+'.json',JSON.stringify({correo:body.to[0],codigo}),{mode:0o600});return Response.json({id:crypto.randomUUID()});};`;
 create({apiVersion:'v1',kind:'ConfigMap',metadata:{name:configName},data:{'provider.cjs':provider}});
 const image=JSON.parse(kube(['get','deployment','backend','-o','json'])).spec.template.spec.containers[0].image;
 const secretEnv=keys=>keys.map(name=>({name,valueFrom:{secretKeyRef:{name:secretName,key:name}}}));
 const volumes=[{name:'provider',configMap:{name:configName}},{name:'mailbox',emptyDir:{}}],mounts=[{name:'provider',mountPath:'/fixture',readOnly:true},{name:'mailbox',mountPath:'/mailbox'}];
 create({apiVersion:'apps/v1',kind:'Deployment',metadata:{name:apiName},spec:{replicas:1,selector:{matchLabels:{app:apiName}},template:{metadata:{labels:{app:apiName}},spec:{automountServiceAccountToken:false,volumes,containers:[{name:'otp-api',image,imagePullPolicy:'IfNotPresent',command:['node','--require','/fixture/provider.cjs','server.js'],env:[{name:'NODE_ENV',value:'production'},{name:'PORT',value:'3000'},{name:'DB_HOST',value:'db'},{name:'DB_PORT',value:'5432'},{name:'EMAIL_REGISTRATION_ENABLED',value:'1'},...secretEnv(['POSTGRES_DB','POSTGRES_USER','POSTGRES_PASSWORD','AUTH_TOKEN_SECRET','EMAIL_OTP_SECRET','EMAIL_OUTBOX_KEY','RESEND_FROM'])],ports:[{containerPort:3000,name:'http'}],readinessProbe:{httpGet:{path:'/api/health',port:'http'},initialDelaySeconds:2,periodSeconds:2},resources:{requests:{cpu:'50m',memory:'64Mi'},limits:{cpu:'1',memory:'256Mi'}},volumeMounts:mounts}]}}}});
 resourcesStarted=true;
 create({apiVersion:'v1',kind:'Service',metadata:{name:apiName},spec:{type:'ClusterIP',selector:{app:apiName},ports:[{port:3000,targetPort:'http'}]}});
 // Reutilizar el Deployment independiente del avance 18, sin publicar API de fixture.
 const worker=JSON.parse(kube(['create','--dry-run=client','--validate=false','-f',path.join(root,'k8s/mail/worker-deployment.yaml'),'-o','json']));
 worker.metadata={name:workerName};worker.spec.selector.matchLabels={app:workerName};worker.spec.template.metadata.labels={app:workerName};
 const wc=worker.spec.template.spec.containers[0];wc.image=image;wc.imagePullPolicy='IfNotPresent';wc.command=['node','--require','/fixture/provider.cjs','workers/email-outbox.cjs','--run'];
 for(const e of wc.env)if(e.valueFrom)e.valueFrom.secretKeyRef.name=secretName;
 worker.spec.template.spec.volumes=volumes;wc.volumeMounts=mounts;create(worker);
 kube(['rollout','status','deployment/'+apiName,'--timeout=90s']);
 const account={solicitud_id:crypto.randomUUID(),correo:'otp19@fixture.invalid',numero_suministro:'900001919',password:'Synthetic19-'+crypto.randomBytes(16).toString('hex')};
 const pending=await request('otp/register',account,202);assert.equal(pending.registro_id,account.solicitud_id);
 await request('otp/register',account,202);
 assert.equal(sql('select count(*)::int n from usuarios')[0].n,0);
 assert.equal(sql('select count(*)::int n from correo_outbox')[0].n,1);
 assert.equal(sql('select estado,payload is not null cifrado from correo_outbox')[0].cifrado,true);
 ok('API interna encola 202; UUID repetido conserva un evento y cero usuarios, worker inicialmente detenido');
 kube(['scale','deployment/'+workerName,'--replicas=1']);kube(['rollout','status','deployment/'+workerName,'--timeout=90s']);
 let accepted=false;for(let i=0;i<30;i++){accepted=sql('select estado from correo_outbox')[0].estado==='aceptado';if(accepted)break;await pause(500);}assert.ok(accepted,'Worker debe aceptar mediante stub sin red');
 const status=await request('verification-status',{registro_id:pending.registro_id},200);assert.equal(status.estado_envio,'aceptado');
 const messages=JSON.parse(kube(['exec','deployment/'+workerName,'--','node','-e',"const fs=require('fs');console.log(JSON.stringify(fs.readdirSync('/mailbox').map(n=>JSON.parse(fs.readFileSync('/mailbox/'+n)))));"]));assert.equal(messages.length,1);
 const code=messages[0].codigo;assert.match(code,/^\d{6}$/);
 await request('verify-email',{registro_id:pending.registro_id,codigo:code==='000000'?'111111':'000000'},400);
 await request('verify-email',{registro_id:pending.registro_id,codigo:code},201);
 const login=await request('login',{numero_suministro:account.numero_suministro,password:account.password},200);
 const session=await request('session',null,200,login.token);assert.equal(session.suministro.numero_suministro,account.numero_suministro);
 assert.equal(sql('select count(*)::int n from usuarios')[0].n,1);assert.equal(sql('select count(*)::int n from suministros')[0].n,1);assert.equal(sql('select payload is null borrado from correo_outbox')[0].borrado,true);
 ok('Worker independiente acepta con proveedor simulado; OTP incorrecto/correcto, cuenta única y login/sesión funcionan');
 const publicRegistration=await fetch('http://localhost:8084/api/auth/otp/register',{method:'POST',headers:{'Content-Type':'application/json','X-Hidro-Auth-Contract':'otp-outbox-v1'},body:JSON.stringify(account)});assert.equal(publicRegistration.status,503);
 for(const name of [apiName,workerName]){const logs=kube(['logs','deployment/'+name,'--tail=1000']);for(const value of [account.password,code,login.token,data.AUTH_TOKEN_SECRET,data.EMAIL_OTP_SECRET,data.EMAIL_OUTBOX_KEY,data.POSTGRES_PASSWORD])assert.ok(!logs.includes(value),'Fixture sin secretos en logs');}
 ok('Registro público continúa cerrado; API/worker no registran secretos, contraseñas, JWT ni OTP sintéticos');
 report.status='passed';
})().catch(e=>{report.status='failed';report.error=e.message;console.error(e.message);process.exitCode=1;}).finally(()=>{
 if(resourcesStarted){for(const name of [apiName,workerName])try{kube(['scale','deployment/'+name,'--replicas=0']);}catch{}}
 fs.writeFileSync(path.join(state,'otp.json'),JSON.stringify(report,null,2),{mode:0o600});
});
