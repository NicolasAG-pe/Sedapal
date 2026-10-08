// Única fuente de configuración Capacitor; el JSON nativo lo genera cap sync.
const { readApiBase } = require('./scripts/public-api-config');
const apiBase = readApiBase('android');
const localHttp = apiBase.startsWith('http:');

module.exports = {
    appId: 'pe.edu.hidromejora.app',
    appName: 'Hidro-Mejora',
    webDir: 'artifacts/android/web-runtime',
    // Capacitor 7 reserva las barras del sistema y el recorte en Android 15+.
    android: { adjustMarginsForEdgeToEdge: 'auto' },
    server: {
        androidScheme: localHttp ? 'http' : 'https'
    }
};
