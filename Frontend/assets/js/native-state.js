/* Puente exclusivo Android. Web conserva sesión en memoria, sin fallback persistente. */
(function(global){
  'use strict';
  const cap=global.Capacitor;
  const native=!!cap?.isNativePlatform?.();
  let operations=Promise.resolve();
  function call(method,options={}){
    if(!native)return Promise.resolve({});
    const result=operations.then(()=>{
      if(!cap.isPluginAvailable('HidroSecureState'))throw new Error('Actualiza la aplicación para usar almacenamiento seguro.');
      return cap.nativePromise('HidroSecureState',method,options);
    });
    operations=result.catch(()=>{});
    return result;
  }
  global.HMNativeState={isNative:()=>native,
    readSession:()=>call('readSession'),
    writeSession:token=>call('writeSession',{token}),
    clearSession:()=>call('clearSession')};
})(window);
