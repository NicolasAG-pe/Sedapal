'use strict';
// Empaqueta, nunca instala. La identidad de desarrollo se prepara fuera de Git.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function privateSigning(file){
 const real=fs.realpathSync(file),s=fs.statSync(real);
 if(real.startsWith(root+path.sep)||!s.isFile()||(s.mode&0o077))throw Error('Firma privada fuera del repositorio y modo 600 requeridos.');
 const data=JSON.parse(fs.readFileSync(real,'utf8'));
 for(const key of ['STORE_FILE','STORE_PASSWORD','KEY_ALIAS','KEY_PASSWORD'])if(typeof data[key]!=='string'||!data[key])throw Error('Firma LAB incompleta.');
 const keyFile=fs.realpathSync(data.STORE_FILE),ks=fs.statSync(keyFile);
 if(keyFile.startsWith(root+path.sep)||!ks.isFile()||(ks.mode&0o077))throw Error('Keystore LAB privado inválido.');
 return Object.fromEntries(Object.entries(data).filter(([k])=>['STORE_FILE','STORE_PASSWORD','KEY_ALIAS','KEY_PASSWORD'].includes(k)).map(([k,v])=>['HM_LAB_'+k,v]));
}
function main(){
 if(process.argv.length!==3)throw Error('Uso: node scripts/build-android-physical-lab.cjs /privado/lab-signing.json');
 if(!fs.statSync(path.join(root,'.git')).isFile())throw Error('Usa un worktree independiente.');
 if(fs.existsSync(path.join(root,'android/app/google-services.json')))throw Error('LAB física requiere Firebase sin configuración.');
 fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
 const output=fs.mkdtempSync(path.join(root,'artifacts/android-physical-lab-'));fs.chmodSync(output,0o700);
 const env={...process.env,...privateSigning(process.argv[2]),HM_ANDROID_LAB:'1',HM_PUSH_ANDROID_ENABLED:'0',API_BASE_URL:'http://127.0.0.1:45679'};
 for(const [cmd,args,name]of [
  [process.execPath,['scripts/sync-android.cjs'],'sync.log'],
  ['bash',['scripts/android-gradle.sh','--offline','--no-daemon','--console=plain','-PhidroBuildDir='+path.join(output,'app'),':app:assembleLab',':app:assembleLabAndroidTest',':app:testLabUnitTest',':app:lintLab'],'build.log']]){
  const r=spawnSync(cmd,args,{cwd:root,env,encoding:'utf8',maxBuffer:32*1024*1024});
  fs.writeFileSync(path.join(output,name),(r.stdout||'')+(r.stderr||''),{mode:0o600});
  if(r.error||r.status!==0)throw Error('Compilación detenida; consulta '+path.join(output,name));
 }
 const apk=path.join(output,'app/outputs/apk/lab/app-lab.apk');fs.chmodSync(apk,0o600);
 const result={applicationId:'pe.edu.hidromejora.app.lab120',versionName:'1.2.0-lab.1',api:'http://127.0.0.1:45679',transport:'USB adb reverse',realDeliveryAllowed:false,firebaseConfigured:false,apk,sha256:crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex')};
 fs.writeFileSync(path.join(output,'candidate.json'),JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result));
}
if(require.main===module)try{main();}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={privateSigning};
