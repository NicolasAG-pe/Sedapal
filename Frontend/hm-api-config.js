/* Configuración local Docker: REST y Socket.IO utilizan el mismo origen.
 * Para web publicada y Android, scripts/build-web.js genera este archivo
 * en la salida desde API_BASE_URL (.env.frontend / .env.android o entorno).
 * Solo contiene la URL pública; nunca credenciales del backend.
 */
window.HM_API_BASE = '';
