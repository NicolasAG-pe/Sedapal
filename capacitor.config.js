// Única fuente de configuración Capacitor; el JSON nativo lo genera cap sync.
const { readApiBase } = require('./scripts/public-api-config');
const apiBase = readApiBase('android');
const localHttp = apiBase.startsWith('http:');

module.exports = {
    appId: process.env.HM_ANDROID_LAB === '1' ? 'pe.edu.hidromejora.app.lab120' : 'pe.edu.hidromejora.app',
    appName: process.env.HM_ANDROID_LAB === '1' ? 'Hidro-Mejora LAB' : 'Hidro-Mejora',
    // El bridge transporta credenciales en memoria; tampoco registrarlas en debug.
    loggingBehavior: 'none',
    webDir: 'artifacts/android/web-runtime',
    // Capacitor 7 reserva las barras del sistema y el recorte en Android 15+.
    android: { adjustMarginsForEdgeToEdge: 'auto' },
    server: {
        androidScheme: localHttp ? 'http' : 'https'
    }
};
