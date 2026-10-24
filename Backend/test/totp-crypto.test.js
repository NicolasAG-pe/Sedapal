'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const{crearCifradoTotp,respaldarClaves,restaurarClaves}=require('../totp-crypto');
const secret='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',env=()=>({TOTP_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64')});
test('AES-GCM v2: IV único, binding de usuario, etiqueta/header y encoding estrictos',()=>{
 const e=env(),c=crearCifradoTotp(e),one=c.encrypt(secret,1),two=c.encrypt(secret,1);
 assert.notEqual(one,two);assert.ok(!one.includes(secret));assert.equal(c.decrypt(one,1),secret);
 assert.throws(()=>c.decrypt(one,2));assert.throws(()=>crearCifradoTotp(env()).decrypt(one,1));
 for(const index of [0,1,2,3,4]){const p=one.split('.');p[index]='X'+p[index].slice(1);assert.throws(()=>c.decrypt(p.join('.'),1));}
 assert.throws(()=>c.decrypt(one+'junk',1));assert.throws(()=>c.decrypt(one+'.extra',1));
});
test('Lee v1 histórico con clave anterior y escribe solo con la clave actual identificada',()=>{
 const old=env(),next=env(),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',Buffer.from(old.TOTP_ENCRYPTION_KEY,'base64'),iv);
 cipher.setAAD(Buffer.from('hidro-totp-v1:7'));const v1=['v1',iv.toString('base64'),Buffer.concat([cipher.update(secret),cipher.final()]).toString('base64'),cipher.getAuthTag().toString('base64')].join('.');
 next.TOTP_PREVIOUS_ENCRYPTION_KEYS=JSON.stringify([old.TOTP_ENCRYPTION_KEY]);const ring=crearCifradoTotp(next);
 assert.equal(ring.decrypt(v1,7),secret);const current=ring.encrypt(secret,7);assert.ok(current.startsWith('v2.'+ring.currentId()+'.'));
 assert.equal(crearCifradoTotp({TOTP_ENCRYPTION_KEY:next.TOTP_ENCRYPTION_KEY}).decrypt(current,7),secret);
 assert.throws(()=>crearCifradoTotp({TOTP_ENCRYPTION_KEY:next.TOTP_ENCRYPTION_KEY}).decrypt(v1,7));
});
test('Respaldo cifrado restaura el anillo y exige una clave independiente y correcta',()=>{
 const e=env(),kek=crypto.randomBytes(32),backup=respaldarClaves(e,kek),c=crearCifradoTotp(e),encrypted=c.encrypt(secret,3);
 assert.ok(!backup.includes(e.TOTP_ENCRYPTION_KEY));assert.equal(crearCifradoTotp(restaurarClaves(backup,kek)).decrypt(encrypted,3),secret);
 assert.throws(()=>restaurarClaves(backup,crypto.randomBytes(32)));assert.throws(()=>respaldarClaves(e,Buffer.from(e.TOTP_ENCRYPTION_KEY,'base64')));
 const tampered=JSON.parse(backup);tampered.payload[1]='A'+tampered.payload[1].slice(1);if(JSON.stringify(tampered)===backup)tampered.payload[1]='B'+tampered.payload[1].slice(1);
 assert.throws(()=>restaurarClaves(JSON.stringify(tampered),kek));
});
test('Configuración ausente, no canónica, duplicada o excesiva falla cerrada',()=>{
 const e=env();for(const x of [{},{TOTP_ENCRYPTION_KEY:'invalid'}, {...e,TOTP_PREVIOUS_ENCRYPTION_KEYS:'invalid'}, {...e,TOTP_PREVIOUS_ENCRYPTION_KEYS:JSON.stringify([e.TOTP_ENCRYPTION_KEY])}, {...e,TOTP_PREVIOUS_ENCRYPTION_KEYS:JSON.stringify(Array.from({length:4},()=>env().TOTP_ENCRYPTION_KEY))}])assert.equal(crearCifradoTotp(x).available(),false);
});
