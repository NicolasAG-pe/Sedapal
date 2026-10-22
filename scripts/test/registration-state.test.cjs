'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const id='b7bfca9a-4aa7-4e27-a379-8243c4467622',minimal={id,suministro:'900000721'};
function fixture(native=true){
 const storage=new Map();let pending=null;const calls=[];
 const window={HMNativeState:{isNative:()=>native,writeRegistration:async value=>{calls.push('writeRegistration');pending=value;},readRegistration:async()=>({pending}),clearRegistration:async()=>{calls.push('clearRegistration');pending=null;}}};
 vm.runInNewContext(fs.readFileSync('Frontend/assets/js/registration-state.js','utf8'),{window,sessionStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k),removeItem:k=>storage.delete(k)}});
 return {state:window.HMRegistrationState,calls,storage,pending:()=>pending,seed:value=>{pending=value;}};
}
test('OTP Android conserva exclusivamente UUID/suministro, separado de la sesión autenticada',async()=>{
 const f=fixture();await f.state.save({...minimal,password:'synthetic-not-to-store',codigo:'123456',token:'synthetic.jwt.value',correo:'fixture@example.invalid',aceptada:true,venceEn:'2099-01-01'});
 assert.deepEqual(JSON.parse(JSON.stringify(f.pending())),minimal);assert.equal(f.storage.size,0);assert.deepEqual(JSON.parse(JSON.stringify(await f.state.read())),minimal);
 await f.state.clear();assert.equal(await f.state.read(),null);assert.deepEqual(f.calls,['writeRegistration','clearRegistration']);
});
test('Identificadores inválidos no se guardan y estado nativo corrupto se retira',async()=>{
 const f=fixture();for(const value of [{...minimal,id:'bad'},{...minimal,suministro:'123'},null])await assert.rejects(f.state.save(value));assert.equal(f.pending(),null);
 f.seed({id:'bad',suministro:'123'});assert.equal(await f.state.read(),null);assert.equal(f.pending(),null);
});
test('Web conserva comportamiento OTP de pestaña; no recibe persistencia autenticada',async()=>{
 const f=fixture(false),value={...minimal,aceptada:false,solicitudHasta:123};await f.state.save(value);assert.deepEqual(JSON.parse(JSON.stringify(await f.state.read())),value);assert.deepEqual(f.calls,[]);await f.state.clear();assert.equal(await f.state.read(),null);
});
test('Guardar, abandonar y comenzar otra solicitud se serializan sin recuperar metadatos anteriores',async()=>{
 let pending=null,release;const gate=new Promise(r=>{release=r;});let first=true;
 const window={Capacitor:{isNativePlatform:()=>true,isPluginAvailable:()=>true,nativePromise:async(plugin,method,options)=>{
  if(method==='writeRegistration'){if(first){first=false;await gate;}pending=options.pending;return{};}
  if(method==='clearRegistration'){pending=null;return{};}
  if(method==='readRegistration')return{pending};throw Error('Operación de sesión inesperada');
 }}};
 const context=vm.createContext({window,sessionStorage:{removeItem(){}}});
 for(const p of ['native-state','registration-state'])vm.runInContext(fs.readFileSync('Frontend/assets/js/'+p+'.js','utf8'),context);
 const a=window.HMRegistrationState.save(minimal),clear=window.HMRegistrationState.clear(),b=window.HMRegistrationState.save({...minimal,id:'b7bfca9a-4aa7-4e27-a379-8243c4467623',suministro:'900000722'});release();await Promise.all([a,clear,b]);
 assert.equal((await window.HMRegistrationState.read()).suministro,'900000722');
});
