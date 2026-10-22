'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
function fixture(fetch){
 const store=new Map(),win={crypto:crypto.webcrypto,HM_API_BASE:'https://api.example.invalid'};
 const c=vm.createContext({window:win,fetch,AbortController,DOMException,setTimeout,clearTimeout,Uint8Array,
  sessionStorage:{setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}});
 for(const file of ['Shared/api.js','Frontend/assets/js/client-session.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);
 let denied=0;return{session:win.createHMClientSession(()=>{denied++;}),store,denied:()=>denied};
}
test('UUID criptográfico y contrato explícito; libera controladores al consumir cuerpo',async()=>{
 let aborted=0,headers;
 const f=fixture(async(url,o)=>{headers=o.headers;o.signal.addEventListener('abort',()=>{aborted++;});return Response.json({estado:'ok'});});
 assert.match(f.session.nuevoRegistroId(),/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
 await(await f.session.authFetch('/api/auth/register')).json();assert.equal(headers['X-Hidro-Auth-Contract'],'otp-outbox-v1');
 await(await f.session.authFetch('/api/auth/login')).json();assert.equal(headers['X-Hidro-Auth-Contract'],undefined);
 f.session.set('fixture-token','usuario');assert.equal(aborted,0);assert.equal(f.session.isUser(),true);
});
test('Timeout de autenticación no cierra sesión ni reintenta escrituras automáticamente',async()=>{
 let calls=0;
 const f=fixture((url,o)=>new Promise((resolve,reject)=>{calls++;o.signal.addEventListener('abort',()=>reject(new DOMException('abort','AbortError')));}));
 f.session.set('fixture-token','usuario');
 await assert.rejects(f.session.authFetch('/api/auth/register',{timeoutMs:20}),{name:'TimeoutError'});
 assert.equal(calls,1);assert.equal(f.session.isUser(),true);assert.equal(f.denied(),0);
});
test('403 de OTP/426 de contrato no invalidan una sesión existente',async()=>{
 for(const status of [400,403,426,429,503]){
  const f=fixture(async()=>Response.json({estado:'error'},{status}));f.session.set('fixture-token','usuario');
  const r=await f.session.authFetch('/api/auth/verify-email');await r.json();
  assert.equal(f.session.isUser(),true);assert.equal(f.denied(),0);
 }
});
test('API anterior se detecta antes de enviar el registro; sin restaurar JWT local sin validarlo',async()=>{
 const f=fixture(async()=>new Response('<html>404</html>',{status:404}));
 await assert.rejects(f.session.comprobarRegistro(),/no está disponible/);
 assert.equal(f.session.token(),'');assert.equal(f.store.size,0);
});
