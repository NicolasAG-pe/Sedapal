// JWT solo en memoria; Android persiste cifrado y valida en servidor antes de restaurar.
(function (global) {
  'use strict';
  global.createHMClientSession = function (onDenied) {
    let token = '', role = '', generation = 0;
    let restoration = null;
    const secure=global.HMNativeState;
    const native=!!secure?.isNative();
    const authRequests = new Set();
    const session = {
      token: () => token, role: () => role, generation: () => generation,
      isUser: () => !!token && role === 'usuario'
    };
    const api = global.HMShared.createApi(session, onDenied);
    function clearMemory() {
      generation++; token = ''; role = '';
      api.cancel();
      authRequests.forEach(controller => controller.abort()); authRequests.clear();
      try { sessionStorage.removeItem('hm_token'); sessionStorage.removeItem('hm_rol'); } catch (_) {}
      try { global.localStorage?.removeItem('hm_token'); global.localStorage?.removeItem('hm_rol'); } catch (_) {}
    }
    function clear() {
      clearMemory();
      const removal=native?secure.clearSession():Promise.resolve();
      removal.catch(()=>{}); // Los llamadores de UI esperan y muestran el error; no descartar el rechazo.
      return removal;
    }
    function set(value, verifiedRole) {
      clearMemory();
      if (verifiedRole !== 'usuario' || typeof value!=='string' || !value) throw new Error('Esta aplicación es exclusiva para clientes.');
      token=value; role=verifiedRole;
    }
    async function establish(value, verifiedRole) {
      clearMemory();
      const epoch=generation;
      if(verifiedRole!=='usuario' || typeof value!=='string' || !value)throw new Error('Esta aplicación es exclusiva para clientes.');
      if(native){
        try{
          await secure.clearSession();
          if(epoch!==generation)throw new DOMException('Sesión cancelada.','AbortError');
          await secure.writeSession(value);
        }catch(error){
          if(epoch!==generation || error.name==='AbortError')throw new DOMException('Sesión cancelada.','AbortError');
          const failure=new Error('No se pudo guardar la sesión de forma segura. Reintenta.');
          failure.code='SECURE_STATE_UNAVAILABLE';throw failure;
        }
      }
      if(epoch!==generation)throw new DOMException('Sesión cancelada.','AbortError');
      token=value;role=verifiedRole;
    }
    function restore() {
      if(!native)return Promise.resolve({state:'anonymous'});
      if(restoration)return restoration;
      const epoch=generation;
      const guard=()=>{if(epoch!==generation)throw new DOMException('Restauración cancelada.','AbortError');};
      const operation=(async()=>{
        try{
          const saved=await secure.readSession();guard();
          if(!saved.token)return {state:'anonymous'};
          const response=await authFetch('/api/auth/session',{headers:{Authorization:'Bearer '+saved.token}});guard();
          if(response.status===401 || response.status===403){await response.json().catch(()=>null);guard();await secure.clearSession();guard();return {state:'ended'};}
          const data=await response.json().catch(()=>null);guard();
          if(!response.ok || data?.estado!=='ok' || data.usuario?.rol!=='usuario' || !/^\d{9}$/.test(data.suministro?.numero_suministro || ''))return {state:'unavailable'};
          set(saved.token,'usuario');
          return {state:'authenticated',data};
        }catch(error){
          if(error.name==='AbortError')return {state:'cancelled'};
          // Sin red/5xx/almacén inaccesible: no mostrar datos ni borrar una credencial aún no validada.
          return {state:'unavailable'};
        }
      })();
      restoration=operation;
      operation.finally(()=>{if(restoration===operation)restoration=null;});
      return operation;
    }
    async function authFetch(path, options = {}) {
      const {timeoutMs=15000,signal,...rest}=options;
      if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw new Error('Tiempo de espera inválido.');
      const controller=new AbortController(),epoch=generation;
      let timedOut=false;
      const abort=()=>controller.abort();
      const finish=()=>{clearTimeout(timer);authRequests.delete(controller);signal?.removeEventListener('abort',abort);};
      const timer=setTimeout(()=>{timedOut=true;controller.abort();finish();},timeoutMs);
      authRequests.add(controller);
      if(signal?.aborted)controller.abort();
      signal?.addEventListener('abort',abort,{once:true});
      const guard=()=>{if(generation!==epoch||controller.signal.aborted)throw new DOMException('Petición cancelada.','AbortError');};
      const errorFor=error=>timedOut?new DOMException('No se confirmó la respuesta a tiempo.','TimeoutError'):error;
      try{
        const headers={...rest.headers};
        if(['/api/auth/register','/api/auth/resend-verification','/api/auth/otp/register','/api/auth/otp/resend-verification'].includes(path))headers['X-Hidro-Auth-Contract']='otp-outbox-v1';
        const response=await fetch(global.HMShared.apiUrl(path),{...rest,signal:controller.signal,headers});
        guard();
        const read=async method=>{try{const value=await response[method]();guard();return value;}catch(error){throw errorFor(error);}finally{finish();}};
        return {ok:response.ok,status:response.status,headers:response.headers,json:()=>read('json'),blob:()=>read('blob')};
      }catch(error){finish();throw errorFor(error);}
    }
    clearMemory();
    return {
      ...session, clear, authFetch, set, establish, restore, isNative:()=>native,
      nuevoRegistroId(){
        const bytes=new Uint8Array(16);global.crypto.getRandomValues(bytes);
        bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
        const h=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
        return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
      },
      async comprobarRegistro(){
        const response=await authFetch('/api/auth/capabilities');
        const data=await response.json().catch(()=>null);
        if(!response.ok || !data?.contratos_registro?.includes('otp-outbox-v1') || data.verificacion_correo_obligatoria!==true){
          throw new Error('El registro con verificación no está disponible en este servidor. Intenta más tarde. Si ya tienes cuenta, inicia sesión.');
        }
      },
      fetch: (path, options) => session.isUser()
        ? api.fetch(path, options) : Promise.reject(new DOMException('Sesión cerrada.', 'AbortError'))
    };
  };
})(window);
