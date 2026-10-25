# Android y Capacitor

Configuración de **v1.0.0**, contrastada con [capacitor.config.js](../capacitor.config.js), [Gradle app](../android/app/build.gradle), [variables Gradle](../android/variables.gradle) y [manifiesto](../android/app/src/main/AndroidManifest.xml).

## Desarrollo posterior — avance 15

El [plan de transición Android/OTP](android-transicion.md) documenta H01, guardia
de compatibilidad, recuperación de solicitudes, pruebas y publicación coordinada.
La configuración nativa conserva la identidad de v1.0.0 y propone 1.1.0/código 3.
Los permisos, SDK, firma pública, esquema HTTPS y plugins siguen sin cambios.
El [avance 16](pruebas/android-1.1.0-nativo.md) compiló el candidato y comprobó
la actualización firmada sobre 1.0.0 en un AVD Android 15 sin desinstalar.
Los flujos funcionales usan otro AVD con APK debug y backend aislado. No hay
distribución nueva ni validación de esta candidata en teléfono físico.

## Desarrollo posterior — avance 17

La [persistencia segura de sesión](pruebas/android-sesion-persistente.md) utiliza
un plugin propio basado en Android Keystore y AES-GCM, con archivos privados fuera
de backup. El JWT se mantiene únicamente en memoria web; Android lo restaura solo
después de validar cuenta, rol y suministro con `/api/auth/session`. No se amplía
su duración de ocho horas ni se añaden refresh tokens. El bridge no registra datos
ni siquiera en debug. Logout espera la retirada nativa y limpia datos/socket.
La recuperación OTP y ubicación quedaron verificadas en AVD en ese informe.
La candidata final firmada actualizó 1.0.0 sin desinstalar y conservó UID y
preferencias; no hay distribución nueva ni validación física de 1.1.0.

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
- **Ubicación:** `navigator.geolocation.getCurrentPosition`, petición puntual de alta precisión en Android, sin caché web y con timeout de ocho segundos. El usuario puede rechazarla o continuar sin coordenadas. Una petición fallida retira la posición anterior y los callbacks de formularios cerrados se descartan. No hay mapas nuevos ni seguimiento continuo.
- **Fotografías:** selector HTML de archivos, JPG/PNG/WebP, máximo 2 MB; FileReader genera data URL para la API. La disponibilidad de cámara/galería depende del selector WebView/sistema; no existe plugin propio de cámara.
- **PDF:** `HidroDocumentsPlugin` registrado por MainActivity. Valida nombre y contenido, usa Storage Access Framework/ACTION_CREATE_DOCUMENT, guarda fuera del hilo visual y solicita apertura con un visor disponible. Cancelar no informa éxito; si falta visor el archivo puede seguir guardado. No requiere acceso general al almacenamiento.
- **Atrás:** cierra modal, menú o minimiza HidroBot; durante tutorial conserva el recorrido. Desde una sección secundaria vuelve a Inicio; desde Inicio/login permite salir con App. No produce un segundo logout implícito.
- **Pantalla:** márgenes edge-to-edge automáticos en Capacitor, estilos con safe areas y viewport móvil; icono y splash propios locales. El manifiesto admite cambios de orientación/configuración sin recrear toda la navegación.

## Debug y release

Debug sirve para pruebas locales o contra producción, según el runtime generado; no garantiza por sí mismo una API de producción. Release usa firma permanente externa, certificado comprobado y `debuggable=false`; mantiene `minifyEnabled=false`.

Una debug no actualiza una release ni viceversa si difieren los certificados. Las reglas de transición, compilación release, actualización futura y respaldo se encuentran únicamente en [ANDROID-RELEASE](ANDROID-RELEASE.md).

## Validación

Hay pruebas unitarias del payload PDF y una prueba instrumental de applicationId. Compilar instrumentación no equivale a ejecutarla en un dispositivo. La release v1.0.0 fue validada físicamente por el propietario, incluyendo fotos, ubicación, PDF, Atrás y tiempo real; eso no certifica todos los dispositivos o versiones WebView. Evidencia y comandos: [TESTING](TESTING.md).

Seguimiento OTP (avance 17): Android conserva únicamente UUID/suministro en un
estado cifrado independiente de la sesión. Recupera por consulta al backend;
ningún dato del disco habilita OTP/reenvío sin validar SQL. Ver el
[informe de sesión y OTP](pruebas/android-sesion-persistente.md).


Seguimiento de avance 18: [integración local de Android, chatbot y Kubernetes](pruebas/integracion-avance-18.md).
Se conservan historiales en una rama aislada; pruebas WebView de sesión/OTP/
ubicación y chatbot aprobadas. Kubernetes solo se renderizó/validó con SQL nuevo,
sin aplicar recursos; altas cerradas por defecto y worker preparado detenido.
La release firmada del avance 17 permanece intacta. Una release con la integración
y su actualización desde 1.0.0 requieren nueva validación antes de distribuir.
No se modifican main, la rama del PR ni servicios productivos.
## Próxima funcionalidad en revisión: 2FA opcional

La [auditoría posterior](pruebas/auditoria-2fa-seguridad.md) comprueba carreras,
revocación, rotación de claves y compatibilidad con el panel Admin. No se publicó
1.2.0 ni se reemplazaron las candidatas anteriores; faltan pruebas físicas.

La rama `feature/seguridad-totp` prepara TOTP y recuperación de un solo uso.
Propuesta de publicación: **1.2.0 / versionCode 6**, todavía sin aplicar al
versionado ni compilar una release nueva. La APK firmada 1.1.2/5 no se modifica.
La sesión completa sigue usando el Keystore; secretos TOTP, contraseñas,
desafíos y códigos de recuperación no se guardan en Android.
El QR se muestra transitoriamente para vincular el autenticador; ese autenticador
necesariamente conserva su propia copia del secreto. Hidro-Mejora no la persiste.
[Pruebas y requisitos de despliegue](pruebas/seguridad-totp.md).

### Pagos y documentos en desarrollo para futura 1.2.0

La rama `feature/pagos-pdf-120` parte de seguridad TOTP (Draft PR #12) y se revisa
contra esa rama en Draft PR #13. No cambia versionName/versionCode ni crea una
release. La APK 1.1.1 y la candidata 1.1.2 se conservan sin sobrescribirlas.

El flujo de pruebas separa demostración, declaración Yape y revisión manual; el
recibo no pasa a Pagado por una simulación. `npm run test:payments:native` utiliza
el AVD dedicado, PostgreSQL 18 aislado y un QR sintético. Se comprobó recuperación
tras respuesta perdida/force-stop, sesión Keystore, logout y guardado/visor de recibo
y constancia mediante SAF. No son pruebas físicas ni transferencias financieras.

Las APK antiguas conservan login y consultas; el POST demostrativo sin UUID devuelve
409 explicativo para impedir que su UI anuncie una deuda cancelada. No pueden usar
la nueva declaración Yape hasta una futura actualización. 007/008 pendientes en
producción; backend productivo no desplegado desde esta rama. Informe y límites:
[Pagos/PDF 1.2.0](pruebas/pagos-pdf-120.md), [roadmap](ROADMAP-1.2.0.md).
