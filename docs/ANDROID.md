# Android y Capacitor

Configuración de **v1.0.0**, contrastada con [capacitor.config.js](../capacitor.config.js), [Gradle app](../android/app/build.gradle), [variables Gradle](../android/variables.gradle) y [manifiesto](../android/app/src/main/AndroidManifest.xml).

## Plataforma

| Elemento | Valor |
|---|---|
| Capacitor | Serie 7; core/CLI/Android 7.6.9 según lockfile. |
| Plugin App | 7.1.2 según lockfile. |
| applicationId y namespace | `pe.edu.hidromejora.app`. |
| Nombre visible | Hidro-Mejora. |
| Java de compilación | 21. |
| Gradle / AGP | Wrapper 8.11.1 / Android Gradle Plugin 8.7.2. |
| minSdk / targetSdk / compileSdk | 23 / 35 / 35. |

La versión distribuida y todas las reglas de firma/versionado se mantienen en [ANDROID-RELEASE](ANDROID-RELEASE.md), sin duplicar la configuración privada aquí. No hay un proyecto Flutter/React Native ni backend Java.

## Entorno de desarrollo

Instalar JDK 21 y Android SDK, configurando el SDK local según Android Studio. `local.properties` y ajustes IDE locales no se publican. Para seleccionar Java de este proyecto se puede usar `JAVA_HOME_21`; el wrapper no cambia Java global.

```bash
npm ci
npm run cap:sync
npm run android:gradle -- :app:assembleDebug :app:testDebugUnitTest :app:lintDebug :app:compileDebugAndroidTestSources
npm run cap:open
```

Antes de `cap:sync`, proporcionar `API_BASE_URL` pública desde el entorno o configuración privada Android. Se rechaza una URL externa HTTP, credenciales en la URL y Quick Tunnel. Una URL HTTP local/emulador se permite únicamente como configuración de desarrollo; no debe terminar en una APK de producción.

El wrapper [android-gradle.sh](../scripts/android-gradle.sh) busca JDK 21 o utiliza `JAVA_HOME_21`, configura Java para el proceso y almacena cachés locales bajo `artifacts/android/cache/` por defecto. Cada invocación crea una salida nueva en `artifacts/android/builds/<ejecución>/app/`; admite `-PhidroBuildDir` para una salida explícita. Localizar la APK en `outputs/apk/debug/` dentro de esa salida, no asumir `android/app/build/outputs`.

## Runtime exclusivo del cliente

La fuente única Capacitor es [capacitor.config.js](../capacitor.config.js). `webDir` apunta a `artifacts/android/web-runtime`; no a Admin ni a la raíz completa.

`build-web.js android` copia Frontend y el subconjunto necesario de Shared, genera configuración pública y verifica recursos. `sync-android.cjs` genera en salida limpia, sincroniza Capacitor y comprueba el contenido de `android/app/src/main/assets/public`. Conserva rollback hasta verificar; los archivos generados no son otra fuente de configuración.

[verify-client-runtime.js](../scripts/verify-client-runtime.js) comprueba HTML/CSS/JS, secciones cliente y recursos requeridos, y rechaza directorios, scripts y referencias administrativas. Una referencia textual al rechazo de rol admin no significa que exista interfaz administrativa.

## Producción y comunicación

API y Socket.IO: `https://hidro-mejora-api.onrender.com`. El script release fuerza ese destino, independientemente de una configuración local/emulador, y requiere HTTPS. No hay secretos PostgreSQL ni JWT de servidor dentro del runtime.

La release utiliza el origen virtual WebView `https://localhost`. Ese origen debe estar autorizado en CORS, pero no es el destino de REST/Socket.IO. El debug HTTP puede utilizar esquema WebView HTTP; su network security config permite cleartext únicamente para hosts locales/emulador. No se incorpora esa excepción debug a la variante release.

REST mantiene los datos de Neon mediante Render. Socket.IO usa la misma base pública, JWT de sesión, polling/WebSocket y reconexión. Eventos y ciclo de vida: [API](API.md).

## Comportamiento nativo

- **Permisos:** INTERNET, ACCESS_COARSE_LOCATION y ACCESS_FINE_LOCATION. No se solicitan permisos de almacenamiento para PDF ni ubicación en segundo plano.
- **Ubicación:** `navigator.geolocation.getCurrentPosition`, petición puntual con timeout; el usuario puede rechazarla. No hay mapas nuevos ni seguimiento continuo.
- **Fotografías:** selector HTML de archivos, JPG/PNG/WebP, máximo 2 MB; FileReader genera data URL para la API. La disponibilidad de cámara/galería depende del selector WebView/sistema; no existe plugin propio de cámara.
- **PDF:** `HidroDocumentsPlugin` registrado por MainActivity. Valida nombre y contenido, usa Storage Access Framework/ACTION_CREATE_DOCUMENT, guarda fuera del hilo visual y solicita apertura con un visor disponible. Cancelar no informa éxito; si falta visor el archivo puede seguir guardado. No requiere acceso general al almacenamiento.
- **Atrás:** cierra modal, menú o minimiza HidroBot; durante tutorial conserva el recorrido. Desde una sección secundaria vuelve a Inicio; desde Inicio/login permite salir con App. No produce un segundo logout implícito.
- **Pantalla:** márgenes edge-to-edge automáticos en Capacitor, estilos con safe areas y viewport móvil; icono y splash propios locales. El manifiesto admite cambios de orientación/configuración sin recrear toda la navegación.

## Debug y release

Debug sirve para pruebas locales o contra producción, según el runtime generado; no garantiza por sí mismo una API de producción. Release usa firma permanente externa, certificado comprobado y `debuggable=false`; mantiene `minifyEnabled=false`.

Una debug no actualiza una release ni viceversa si difieren los certificados. Las reglas de transición, compilación release, actualización futura y respaldo se encuentran únicamente en [ANDROID-RELEASE](ANDROID-RELEASE.md).

## Validación

Hay pruebas unitarias del payload PDF y una prueba instrumental de applicationId. Compilar instrumentación no equivale a ejecutarla en un dispositivo. La release v1.0.0 fue validada físicamente por el propietario, incluyendo fotos, ubicación, PDF, Atrás y tiempo real; eso no certifica todos los dispositivos o versiones WebView. Evidencia y comandos: [TESTING](TESTING.md).
