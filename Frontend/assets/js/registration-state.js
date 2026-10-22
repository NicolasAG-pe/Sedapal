/* Estado OTP independiente: identificadores mínimos en Android, nunca credenciales. */
(function(global){
  'use strict';
  const native=!!global.HMNativeState?.isNative();
  const key='hm_email_pending';
  function identifiers(value){
    if(!value || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.id) || !/^\d{9}$/.test(value.suministro))throw new Error('Solicitud pendiente inválida.');
    return {id:value.id,suministro:value.suministro};
  }
  global.HMRegistrationState={
    async save(value){
      const minimal=identifiers(value);
      if(native){await global.HMNativeState.writeRegistration(minimal);sessionStorage.removeItem(key);}
      else sessionStorage.setItem(key,JSON.stringify(value));
    },
    async read(){
      if(native){
        const saved=(await global.HMNativeState.readRegistration()).pending;
        if(!saved)return null;
        try{return identifiers(saved);}catch(_){await global.HMNativeState.clearRegistration();return null;}
      }
      try{return JSON.parse(sessionStorage.getItem(key)||'null');}catch(_){sessionStorage.removeItem(key);return null;}
    },
    async clear(){
      sessionStorage.removeItem(key);
      if(native)await global.HMNativeState.clearRegistration();
    }
  };
})(window);
