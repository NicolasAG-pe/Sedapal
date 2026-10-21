// Sesión exclusiva de clientes. Sin restauración automática de JWT antiguos.
(function (global) {
  'use strict';
  global.createHMClientSession = function (onDenied) {
    let token = '', role = '', generation = 0;
    const authRequests = new Set();
    const session = {
      token: () => token, role: () => role, generation: () => generation,
      isUser: () => !!token && role === 'usuario'
    };
    const api = global.HMShared.createApi(session, onDenied);
    function clear() {
      generation++; token = ''; role = '';
      api.cancel();
      authRequests.forEach(controller => controller.abort()); authRequests.clear();
      try { sessionStorage.removeItem('hm_token'); sessionStorage.removeItem('hm_rol'); } catch (_) {}
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
    clear();
    return {
      ...session, clear, authFetch,
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
      set(value, verifiedRole) {
        clear();
        if (verifiedRole !== 'usuario' || !value) throw new Error('Esta aplicación es exclusiva para clientes.');
        token = value; role = verifiedRole;
        try { sessionStorage.setItem('hm_token', token); sessionStorage.setItem('hm_rol', role); } catch (_) {}
      },
      fetch: (path, options) => session.isUser()
        ? api.fetch(path, options) : Promise.reject(new DOMException('Sesión cerrada.', 'AbortError'))
    };
  };
})(window);
