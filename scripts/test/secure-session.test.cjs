'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const info={estado:'ok',usuario:{id_usuario:1,rol:'usuario',correo:'session@fixture.invalid'},suministro:{numero_suministro:'900000701'}};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
function fixture({native=true,saved='fixture.header.signature',fetch=async()=>Response.json(info),write,read,available=true}={}){
 let durable=saved;const calls=[],store=new Map(),win={crypto:crypto.webcrypto,HM_API_BASE:'https://api.example.invalid'};
 if(native)win.Capacitor={isNativePlatform:()=>true,isPluginAvailable:()=>available,nativePromise:async(plugin,method,options)=>{
  assert.equal(plugin,'HidroSecureState');calls.push(method);
  if(method==='readSession'){if(read)await read();return{token:durable};}
  if(method==='writeSession'){if(write)await write();durable=options.token;return{};}
  if(method==='clearSession'){durable=null;return{};}
  throw Error('Método inesperado');
 }};
 const context=vm.createContext({window:win,fetch,AbortController,DOMException,setTimeout,clearTimeout,Uint8Array,
  sessionStorage:{setItem:(k,v)=>store.set(k,v),getItem:k=>store.get(k),removeItem:k=>store.delete(k)}});
 for(const file of ['Shared/api.js','Frontend/assets/js/native-state.js','Frontend/assets/js/client-session.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
 return {session:win.createHMClientSession(()=>{}),calls,store,durable:()=>durable};
}
test('Android restaura una vez y no autoriza interfaz antes de la validación remota',async()=>{
 const gate=deferred();let requests=0;
 const f=fixture({fetch:async(url,options)=>{requests++;assert.equal(url,'https://api.example.invalid/api/auth/session');assert.equal(options.headers.Authorization,'Bearer fixture.header.signature');await gate.promise;return Response.json(info);}});
 const a=f.session.restore(),b=f.session.restore();assert.equal(a,b);assert.equal(f.session.isUser(),false);
 await new Promise(r=>setTimeout(r,10));assert.equal(requests,1);assert.equal(f.session.token(),'');gate.resolve();
 assert.equal((await a).state,'authenticated');assert.equal(f.session.isUser(),true);assert.equal(f.store.size,0);
});
for(const status of [401,403])test('Restauración '+status+' limpia credencial y no inicia sesión',async()=>{
 const f=fixture({fetch:async()=>Response.json({estado:'error'},{status})});assert.equal((await f.session.restore()).state,'ended');assert.equal(f.durable(),null);assert.equal(f.session.isUser(),false);
});
test('Sin red y 5xx conservan ciphertext pendiente, pero nunca autorizan datos privados',async()=>{
 for(const fetch of [async()=>{throw new TypeError('offline');},async()=>Response.json({estado:'error'},{status:500})]){
  const f=fixture({fetch});assert.equal((await f.session.restore()).state,'unavailable');assert.equal(f.durable(),'fixture.header.signature');assert.equal(f.session.token(),'');assert.equal(f.store.size,0);
 }
 let offline=true;const f=fixture({fetch:async()=>{if(offline)throw new TypeError('offline');return Response.json(info);}});
 await f.session.restore();offline=false;assert.equal((await f.session.restore()).state,'authenticated');
});
test('Logout durante lectura o validación no permite que una respuesta tardía restaure la sesión',async()=>{
 for(const phase of ['read','validate']){
  const gate=deferred();const f=fixture({read:phase==='read'?()=>gate.promise:undefined,fetch:async()=>{await gate.promise;return Response.json(info);}});
  const restoring=f.session.restore();await new Promise(r=>setTimeout(r,10));const clearing=f.session.clear();gate.resolve();await clearing;
  assert.equal((await restoring).state,'cancelled');assert.equal(f.durable(),null);assert.equal(f.session.token(),'');
 }
});
test('Logout concurrente con guardado impide resurrección y sobrescritura tardía',async()=>{
 const gate=deferred(),entered=deferred();const f=fixture({write:async()=>{entered.resolve();await gate.promise;}});
 const login=f.session.establish('new.header.signature','usuario');const rejected=assert.rejects(login,{name:'AbortError'});
 await entered.promise;const logout=f.session.clear();gate.resolve();await logout;await rejected;
 assert.equal(f.session.token(),'');assert.equal(f.durable(),null);assert.deepEqual(f.calls,['clearSession','writeSession','clearSession']);
});
test('Fallo de almacenamiento seguro rechaza login; web mantiene solo memoria',async()=>{
 const f=fixture({write:async()=>{throw Error('fixture-private-storage-detail');}});
 await assert.rejects(f.session.establish('new.header.signature','usuario'),e=>e.code==='SECURE_STATE_UNAVAILABLE'&&!e.message.includes('fixture-private'));
 assert.equal(f.session.isUser(),false);assert.equal(f.durable(),null);assert.equal(f.store.size,0);
 const web=fixture({native:false});await web.session.establish('memory-only','usuario');assert.equal(web.session.token(),'memory-only');assert.equal(web.store.size,0);assert.deepEqual(web.calls,[]);
});
test('Plugin ausente y respuesta incompatible fallan cerrados sin fallback persistente',async()=>{
 const missing=fixture({available:false});assert.equal((await missing.session.restore()).state,'unavailable');await assert.rejects(missing.session.establish('new.header.signature','usuario'));
 const old=fixture({fetch:async()=>new Response('<html>404</html>',{status:404})});assert.equal((await old.session.restore()).state,'unavailable');assert.equal(old.session.isUser(),false);assert.equal(old.durable(),'fixture.header.signature');
});
test('Cambio explícito de cuenta sustituye la credencial anterior y cancela su generación',async()=>{
 const f=fixture();await f.session.establish('accountA.header.signature','usuario');const epoch=f.session.generation();await f.session.clear();await f.session.establish('accountB.header.signature','usuario');
 assert.ok(f.session.generation()>epoch);assert.equal(f.session.token(),'accountB.header.signature');assert.equal(f.durable(),'accountB.header.signature');assert.equal(f.store.size,0);
});
