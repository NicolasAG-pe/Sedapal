'use strict';
// Operador local: backup, restauración en otra base y correo simulado opt-in.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process'),{Pool}=require('../Backend/node_modules/pg');
const {inspect}=require('./android-physical-lab-server.cjs');
const directory=path.join(os.homedir(),'.local/share/hidromejora/android-lab-120/private');
async function main(action=process.argv[2]){
 inspect();const stateFile=path.join(directory,'backend-state.json');if(fs.statSync(stateFile).mode&0o077)throw Error('Estado debe ser privado.');
 const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));if(!/^hm_physical_[a-f0-9]{16}$/.test(state.database)||state.user!=='hm_lab_app')throw Error('Estado ajeno al laboratorio.');
 const output=fs.mkdtempSync(path.join(directory,'operation-'));fs.chmodSync(output,0o700);
 const db=new Pool({host:'127.0.0.1',port:45680,database:state.database,user:state.user,password:state.password});
 try{
  if(action==='backup'||action==='verify-restore'){
   const dump=execFileSync('docker',['exec','hm-physical-120-pg','pg_dump','-U','hm_lab_owner','-Fc','-d',state.database],{maxBuffer:64*1024*1024});fs.writeFileSync(path.join(output,'synthetic-backup.dump'),dump,{mode:0o600});
   const result={sourceDatabase:state.database,dumpSha256:crypto.createHash('sha256').update(dump).digest('hex'),sourcePreserved:true};
   if(action==='verify-restore'){
    const destination='hm_physical_'+crypto.randomBytes(8).toString('hex');
    execFileSync('docker',['exec','hm-physical-120-pg','createdb','-U','hm_lab_owner',destination]);
    execFileSync('docker',['exec','-i','hm-physical-120-pg','pg_restore','-U','hm_lab_owner','--no-owner','--exit-on-error','-d',destination],{input:dump});
    const counts=async database=>JSON.parse(execFileSync('docker',['exec','hm-physical-120-pg','psql','-U','hm_lab_owner','-d',database,'-Atc',"SELECT json_build_object('users',(SELECT count(*) FROM usuarios),'incidents',(SELECT count(*) FROM incidencias),'events',(SELECT count(*) FROM incidencia_eventos))"],{encoding:'utf8'}));
    result.originalCounts=await counts(state.database);result.restoredCounts=await counts(destination);if(JSON.stringify(result.originalCounts)!==JSON.stringify(result.restoredCounts))throw Error('Restauración no coincide.');
    const replacement={...state,database:destination};fs.writeFileSync(path.join(output,'restored-backend-state.json'),JSON.stringify(replacement,null,2),{mode:0o600});
    result.restoredDatabase=destination;result.runtimeStateUnchanged=true;
   }
   fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2),{mode:0o600});
  }else if(action==='simulate-mail'){
   // Adapter local explícito: ninguna API de correo, códigos solo en archivo 600.
   const messages=[];
   const receive=async({mensaje})=>{const mail=JSON.parse(mensaje);if(!Array.isArray(mail.to)||mail.to.length!==1||!mail.to[0].endsWith('@example.invalid'))throw Error('Destinatario no sintético.');messages.push({email:mail.to[0],text:mail.text,simulated:true});return{id:'local-simulation-'+crypto.randomUUID()};};
   const env=require('./android-physical-lab-server.cjs').environment(state);
   const registration=require('../Backend/email-outbox').crearProcesadorOutbox({pool:db,key:Buffer.from(state.EMAIL_OUTBOX_KEY,'base64'),enviarCodigo:receive});
   const recovery=require('../Backend/password-recovery-worker').createRecoveryWorker({pool:db,env,enviarCodigo:receive});
   for(const worker of [registration,recovery])for(let i=0;i<20;i++){if((await worker.procesarUno()).estado==='vacio')break;}
   fs.writeFileSync(path.join(output,'simulated-mail.json'),JSON.stringify(messages,null,2),{mode:0o600});
  }else throw Error('Usa backup, verify-restore o simulate-mail.');
  console.log('Operación privada completada: '+output);
 }finally{await db.end();}
}
if(require.main===module)main().catch(()=>{console.error('Operación detenida; no se sobrescriben bases ni evidencias.');process.exitCode=1;});
module.exports={main};
