'use strict';
// Opt-in: imagen local sin puertos ni red. No despliega ni entrega secretos.
const {test}=require('node:test'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
test('Imagen release incluye dependencias runtime de recuperación, push y seguimiento',{skip:process.env.HIDRO_RELEASE_IMAGE_TEST!=='1'},()=>{
 const script=`const assert=require('node:assert/strict');
 const modules=['./password-recovery','./password-recovery-crypto','./password-recovery-worker','./push','./push-credentials','./push-provider','./push-worker','./incident-tracking'];
 for(const name of modules)require(name);
 const backend=require('./server');assert.equal(backend.httpServer.listening,false);
 assert.equal(require('./two-factor').permiteSesion({rol:'usuario'},{rol:'usuario',mfa_version:0,mfa_activo:false}),true);
 backend.io.close(()=>backend.pool.end().then(()=>console.log('RELEASE_RUNTIME_IMPORTS_OK')));`;
 const output=execFileSync('docker',['run','--pull=never','--name','hm-release120-image-smoke-'+process.pid,'--label','hidromejora.release=120-smoke','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--log-driver','none','--env','NODE_ENV=production','--env','EMAIL_REGISTRATION_ENABLED=0','--env','EMAIL_WORKER_ENABLED=0','--env','PUSH_ENABLED=0','--env','PUSH_REAL_DELIVERY_ALLOWED=0','--env','TOTP_ENROLLMENT_ENABLED=0','--env','TOTP_ADMIN_ENROLLMENT_ENABLED=0','--env','PASSWORD_RECOVERY_ENABLED=0','--env','PAYMENTS_MANUAL_ENABLED=0','--entrypoint','node','hidro-mejora-api:release-120-preparation','-e',script],{encoding:'utf8',timeout:30000});
 assert.match(output,/RELEASE_RUNTIME_IMPORTS_OK/);
});
