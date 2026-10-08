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
    clear();
    return {
      ...session, clear,
      set(value, verifiedRole) {
        clear();
        if (verifiedRole !== 'usuario' || !value) throw new Error('Esta aplicación es exclusiva para clientes.');
        token = value; role = verifiedRole;
        try { sessionStorage.setItem('hm_token', token); sessionStorage.setItem('hm_rol', role); } catch (_) {}
      },
      fetch: (path, options) => session.isUser()
        ? api.fetch(path, options) : Promise.reject(new DOMException('Sesión cerrada.', 'AbortError')),
      async authFetch(path, options = {}) {
        const controller = new AbortController();
        authRequests.add(controller);
        try {
          return await fetch(global.HMShared.apiUrl(path), { ...options, signal: controller.signal });
        } catch (error) { authRequests.delete(controller); throw error; }
      }
    };
  };
})(window);
