(function (global) {
  'use strict';
  global.HMShared = global.HMShared || {};
  global.HMShared.createRealtime = function (session, options) {
    let socket = null, timer = null;
    function stop() {
      clearTimeout(timer); timer = null;
      if (socket) { socket.removeAllListeners(); socket.disconnect(); socket = null; }
    }
    return {
      stop,
      isConnected: () => !!socket?.connected,
      start() {
        stop();
        if (!session.token() || typeof global.io !== 'function') return;
        const config = {
          auth: { token: session.token() }, path: '/socket.io/',
          transports: ['polling', 'websocket'], reconnection: true,
          reconnectionDelay: 1000, reconnectionDelayMax: 8000, timeout: 10000
        };
        socket = global.HM_API_BASE ? global.io(global.HM_API_BASE, config) : global.io(config);
        let connected = false;
        socket.on('connect', () => {
          options.onStatus?.('online');
          if (connected && session.token()) options.onChange('reconnect');
          connected = true;
        });
        (options.events || []).forEach(event => socket.on(event, () => {
          clearTimeout(timer);
          timer = setTimeout(() => { if (session.token()) options.onChange(event); }, 150);
        }));
        socket.on('sesion:invalidada', options.onInvalidated);
        socket.on('disconnect',()=>options.onStatus?.(navigator.onLine?'connecting':'offline'));
        socket.on('connect_error', () => options.onStatus?.(navigator.onLine?'connecting':'offline'));
      }
    };
  };
})(window);
