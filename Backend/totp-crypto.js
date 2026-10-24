'use strict';
const crypto=require('node:crypto');
const unavailable=()=>new Error('Configuración o material de cifrado TOTP inválido.');
function decode(raw,size){if(typeof raw!=='string'||!raw||Buffer.from(raw,'base64').toString('base64')!==raw)throw unavailable();const b=Buffer.from(raw,'base64');if(size&&b.length!==size)throw unavailable();return b;}
const identifier=key=>crypto.createHash('sha256').update(key).digest('hex').slice(0,16);
function ring(env){
 const current=decode(env.TOTP_ENCRYPTION_KEY,32),previous=JSON.parse(env.TOTP_PREVIOUS_ENCRYPTION_KEYS||'[]');
 if(!Array.isArray(previous)||previous.length>3)throw unavailable();
 const keys=[current,...previous.map(k=>decode(k,32))];
 if(new Set(keys.map(identifier)).size!==keys.length)throw unavailable();
 return{current,keys};
}
function seal(clear,key,aad){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(aad));return[iv.toString('base64'),Buffer.concat([c.update(clear),c.final()]).toString('base64'),c.getAuthTag().toString('base64')];}
function open(parts,key,aad){if(parts.length!==3)throw unavailable();const[iv,text,tag]=parts,d=crypto.createDecipheriv('aes-256-gcm',key,decode(iv,12));d.setAAD(Buffer.from(aad));d.setAuthTag(decode(tag,16));return Buffer.concat([d.update(decode(text)),d.final()]);}
function crearCifradoTotp(env=process.env){
 function get(){try{return ring(env);}catch(_){throw unavailable();}}
 return{
  available(){try{get();return true;}catch(_){return false;}},
  currentId(){return identifier(get().current);},
  encrypt(secret,id){if(!/^[A-Z2-7]{32}$/.test(secret))throw unavailable();const{current}=get(),kid=identifier(current);return['v2',kid,...seal(Buffer.from(secret),current,'hidro-totp-v2:'+kid+':'+id)].join('.');},
  decrypt(raw,id){
   try{
    if(typeof raw!=='string'||raw.length>256)throw unavailable();
    const parts=raw.split('.'),{keys}=get();let clear;
    if(parts[0]==='v2'&&parts.length===5){const k=keys.find(k=>identifier(k)===parts[1]);if(!k)throw unavailable();clear=open(parts.slice(2),k,'hidro-totp-v2:'+parts[1]+':'+id);}
    else if(parts[0]==='v1'&&parts.length===4){for(const k of keys){try{clear=open(parts.slice(1),k,'hidro-totp-v1:'+id);break;}catch(_){}}}
    if(!clear||!/^[A-Z2-7]{32}$/.test(clear.toString('utf8')))throw unavailable();return clear.toString('utf8');
   }catch(_){throw unavailable();}
  }
 };
}
function respaldarClaves(env,recoveryKey){
 try{
  const r=ring(env);if(!Buffer.isBuffer(recoveryKey)||recoveryKey.length!==32||r.keys.some(k=>crypto.timingSafeEqual(k,recoveryKey)))throw unavailable();
  const payload=Buffer.from(JSON.stringify({TOTP_ENCRYPTION_KEY:r.current.toString('base64'),TOTP_PREVIOUS_ENCRYPTION_KEYS:JSON.stringify(r.keys.slice(1).map(k=>k.toString('base64')))}));
  return JSON.stringify({format:'hm-totp-key-backup-v1',payload:seal(payload,recoveryKey,'hm-totp-key-backup-v1')});
 }catch(_){throw unavailable();}
}
function restaurarClaves(raw,recoveryKey){
 try{
  if(typeof raw!=='string'||Buffer.byteLength(raw)>8192||!Buffer.isBuffer(recoveryKey)||recoveryKey.length!==32)throw unavailable();
  const b=JSON.parse(raw);if(b.format!=='hm-totp-key-backup-v1')throw unavailable();
  const env=JSON.parse(open(b.payload,recoveryKey,b.format).toString('utf8'));ring(env);return env;
 }catch(_){throw unavailable();}
}
module.exports={crearCifradoTotp,respaldarClaves,restaurarClaves};
