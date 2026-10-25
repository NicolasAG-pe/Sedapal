'use strict';
const{AUTH_CONTRACT}=require('../Backend/auth-contract');
async function comprobarCandidato(base,{fetchImpl=fetch,allowHttpFixture=false}={}){
 const u=new URL(base);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('Destino de comprobación inválido.');
 if(u.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(u.hostname)&&!allowHttpFixture)throw Error('El candidato remoto requiere HTTPS verificado.');
 // Esta herramienta solo comprueba. No contiene funciones de deploy ni rollback.
 for(const path of ['/api/health','/api/auth/capabilities']){
  const r=await fetchImpl(u.origin+path,{signal:AbortSignal.timeout(10000),redirect:'error'}),d=await r.json();
  if(!r.ok||d.auth_contract!==AUTH_CONTRACT)throw Error('Candidato incompatible: bloqueo de despliegue/rollback por contrato 2FA.');
 }
 return{compatible:true,auth_contract:AUTH_CONTRACT};
}
if(require.main===module)comprobarCandidato(process.argv[2]).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Candidato rechazado o no verificable; no desplegar.');process.exitCode=1;});
module.exports={comprobarCandidato};
