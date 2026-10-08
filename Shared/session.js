// Utilidad independiente del DOM. Cada cliente usa su propio espacio de sesión.
(function (global) {
  'use strict';
  global.HMShared = global.HMShared || {};
  global.HMShared.createSession = function (namespace) {
    let token = '', role = '', generation = 0;
    function clear() {
      token = ''; role = ''; generation++;
      try { sessionStorage.removeItem(namespace + '_token'); sessionStorage.removeItem(namespace + '_rol'); } catch (_) {}
    }
    // No recuperar una sesión del almacenamiento sin validarla en el servidor.
    clear();
    return {
      clear,
      set(value, verifiedRole) {
        clear(); token = value; role = verifiedRole;
        try { sessionStorage.setItem(namespace + '_token', token); sessionStorage.setItem(namespace + '_rol', role); } catch (_) {}
      },
      token: () => token,
      role: () => role,
      generation: () => generation,
      isAdmin: () => !!token && role === 'admin'
    };
  };
})(window);
