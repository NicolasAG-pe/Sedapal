(function (global) {
  'use strict';
  global.HMShared = global.HMShared || {};
  global.HMShared.apiUrl = function (path) {
    const base = String(global.HM_API_BASE || '').replace(/\/$/, '');
    return base + '/' + String(path).replace(/^\//, '');
  };
  global.HMShared.createApi = function (session, onDenied) {
    const pending = new Set();
    function aborted() { return new DOMException('Petición cancelada.', 'AbortError'); }
    return {
      cancel() { pending.forEach(controller => controller.abort()); pending.clear(); },
      async fetch(path, options = {}) {
        if (!session.token()) throw aborted();
        const generation = session.generation();
        const controller = new AbortController();
        const abort = () => controller.abort();
        if (options.signal) {
          if (options.signal.aborted) controller.abort();
          options.signal.addEventListener('abort', abort, { once: true });
        }
        pending.add(controller);
        const guard = () => {
          if (controller.signal.aborted || generation !== session.generation() || !session.token()) throw aborted();
        };
        const finish = () => {
          pending.delete(controller);
          if (options.signal) options.signal.removeEventListener('abort', abort);
        };
        try {
          const response = await fetch(global.HMShared.apiUrl(path), {
            ...options, signal: controller.signal,
            headers: { ...options.headers, Authorization: 'Bearer ' + session.token() }
          });
          guard();
          if (response.status === 401 || response.status === 403) {
            onDenied(response.status);
            throw aborted();
          }
          const read = async method => {
            try { const value = await response[method](); guard(); return value; }
            finally { finish(); }
          };
          // Conservar el control hasta consumir el cuerpo: también puede llegar tras logout.
          return { ok: response.ok, status: response.status, json: () => read('json'), blob: () => read('blob') };
        } catch (error) { finish(); throw error; }
      }
    };
  };
})(window);
