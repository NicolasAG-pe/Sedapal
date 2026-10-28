'use strict';

// Solo el servidor del laboratorio, después de terminar las comprobaciones nativas.
// El proxy netsimd puede conservar HTTP abierto aunque la WebView ya esté detenida.
module.exports = async function closeNativeFixture(ctx) {
  const closing = ctx.close();
  ctx.httpServer.closeAllConnections();
  await closing;
};
