# Android 1.1.0: compilación y validación nativa — avance 16

Fecha: 21 de octubre de 2026. Rama `feature/verificacion-correo`, Draft PR #1.
Fuentes de aplicación compiladas: `10db953198487833319a4930d1785bee05e41f88`.
Los cambios de este avance son pruebas y documentación; no cambian el runtime,
la identidad Android, el diseño, los permisos ni el destino productivo.

**Resultado:** candidata release compilada y firmada; actualización sobre la APK
oficial 1.0.0 comprobada en Android 15, sin desinstalar. Los flujos de escritura
se prueban con una APK debug distinta y API/PostgreSQL aislados, con Resend
simulado. Esto no autoriza distribución ni acredita el backend productivo OTP.

## Entorno realmente utilizado

| Elemento | Versión / configuración |
| --- | --- |
| Equipo | Debian 13, Linux 6.12.113, x86_64; KVM disponible fuera del sandbox. |
| Node.js | 20.19.2. |
| JDK | Temurin 21.0.12.1+1, seleccionado por el wrapper sin cambiar Java global. |
| Gradle / AGP | 8.11.1 / 8.7.2. |
| Capacitor / App | Core, CLI y Android 7.6.9; App 7.1.2. |
| SDK / build-tools | Android 35 / 34.0.0. |
| adb / command-line tools | 37.0.1 / 22.0. |
| Android Emulator | 37.2.12, build 16428233, KVM, GPU software, sin ventana. |
| Sistema invitado | Android 15, API 35, Google APIs x86_64, imagen revisión 9. |
| WebView | `com.google.android.webview` 124.0.6367.219, incluido en la imagen. |
| AVD | Pixel 5, 1080×2340, 440 dpi, 2 GB RAM, dos CPU por AVD. |
| Backend de pruebas | Proceso Node local temporal; PostgreSQL 18, puerto loopback 32768; base nueva por ejecución. |

Al inicio no había emulator, imágenes, AVD ni dispositivos conectados. El sandbox
impedía abrir el socket de adb. La consulta autorizada fuera del sandbox confirmó
KVM y permitió instalar las herramientas oficiales **dentro de
`artifacts/android-native-1.1.0/sdk`** y crear AVD privados de este avance. No se
instalaron paquetes Debian ni se cambiaron Java global, servicios Compose,
contenedores existentes o sus volúmenes. Se utilizó únicamente el PostgreSQL de
fixtures `hidro-compat-test-20261021`, creando bases nuevas, sin borrar las previas.

AVD separados: `hm_110_upgrade_api35` (`emulator-5580`) y
`hm_110_debug_api35` (`emulator-5582`). El primero permaneció sin conectividad
antes de instalar las releases: Wi-Fi/datos apagados y modo avión activo. El
segundo ejecutó exclusivamente el runtime debug dirigido a `10.0.2.2` y a la API
temporal. No se introdujeron cuentas reales ni se probaron escrituras productivas.

## Compilaciones y artefactos locales

Se ejecutó `npm run android:release`: carga privada de la identidad existente,
generación desde Frontend, verificación de runtime cliente, `cap sync`,
`assembleRelease`, `testReleaseUnitTest`, `lintRelease` y compilación de fuentes
instrumentales. El HTML empaquetado coincide byte a byte con `Frontend/index.html`.
No se utilizó un `assemble` con recursos anteriores.

| APK local, nunca distribuida | Identidad y tamaño | SHA-256 |
| --- | --- | --- |
| `artifacts/android/hidro-mejora-v1.1.0-release.apk` | `pe.edu.hidromejora.app`, 1.1.0 / 3; 3.394.282 bytes; no depurable. | `e9305575b3f75a7f0079d3cebb69ca977075cb65de76e33abd5f038289d4a943` |
| `artifacts/android-native-1.1.0/debug/app/outputs/apk/debug/app-debug.apk` | Mismo paquete/versión; firma debug, API HTTP exclusivamente local; 4.339.989 bytes. | `c5b6a1898796f437d2bc7a1f981a43e3b2ba5aee54a791eb98609ce2364e524d` |

La debug se generó **después**, con `API_BASE_URL` del proceso aislado mediante
`npm run cap:sync` y el wrapper `npm run android:gradle`, ejecutando
`assembleDebug`, `testDebugUnitTest`, `lintDebug` y `assembleDebugAndroidTest`.
Los assets generados actuales del árbol local corresponden a esa debug; no deben
reutilizarse para un assemble release directo. La APK release anterior quedó
intacta con su runtime HTTPS y checksum comprobado después de estas pruebas.

Release y debug: cuatro pruebas Java aprobadas por variante (tres de payload PDF
y la prueba aritmética de ejemplo). Lint terminó sin errores: 16 avisos de orden
del manifiesto/recursos sin uso/iconos en release. Son deuda previa, no errores
de compilación corregidos en este avance. Se observaron también avisos de
flatDir, compatibilidad de metadatos SDK y APIs Java obsoletas, sin fallo de build.

## Firma y actualización real 1.0.0 → 1.1.0

La copia local de `hidro-mejora-v1.0.0-release.apk` tiene 3.389.545 bytes y SHA-256
`577ac34bef2c8c6b3cec7954fd860cf78809ab58bfb66f424bcdbaf5202d23d5`,
coincidente con el digest del asset de la [release oficial v1.0.0](https://github.com/NicolasAG-pe/Sedapal/releases/tag/v1.0.0).
`aapt` confirma 1.0.0 / código 2 frente a 1.1.0 / código 3.

`apksigner verify --verbose --print-certs` aprobó ambas APK, firmas v1 y v2,
un solo firmante RSA de 3072 bits. Ambas coinciden con el fingerprint público:

```text
ea195e488d3746cfc846a3dbe69f188fb242e6eda7f5391d05b3ba203ad0b972
```

La validación de Gradle abrió la identidad privada existente y verificó su
certificado. No se modificó ni recreó el keystore. Los avisos de apksigner sobre
entradas META-INF se refieren a cobertura de firma JAR; la verificación v2 del
APK completo terminó correctamente. No se interpreta esto como auditoría absoluta
de toda la cadena de suministro.

Secuencia ejecutada en `emulator-5580`, sin desinstalación ni borrado de datos:

1. Instalar la APK oficial 1.0.0 y una APK de instrumentación **local**, firmada
   con la misma identidad para poder instrumentar la release no depurable.
2. Ejecutar `AndroidUpgradeInstrumentedTest` con `hidroUpgradePhase=seed`:
   verificar versión, origen `https://localhost`, Capacitor nativo y plugin PDF;
   guardar preferencia real `hm_tutorial_seen=1` y marcador sintético en localStorage.
3. Ejecutar `adb -s emulator-5580 install -r` con la candidata release 1.1.0.
4. Repetir la instrumentación con `hidroUpgradePhase=verify`: comprobar versión,
   apertura del formulario, plugin y conservación exacta de ambos valores locales.

**Ambas fases: `OK (1 test)`**. Se conservaron `appId=10209` y
`firstInstallTime=2026-10-21 12:01:58` del AVD. No se utilizó downgrade, firma debug,
`pm clear` ni reinstalación limpia para simular compatibilidad. La release abrió
después de actualizar; el buffer de crash del AVD quedó vacío.

La prueba permanente está en
`android/app/src/androidTest/java/pe/edu/hidromejora/app/AndroidUpgradeInstrumentedTest.java`.
Requiere fase explícita y comprueba que el dispositivo sea un emulador. Se invoca
con el runner `pe.edu.hidromejora.app.test/androidx.test.runner.AndroidJUnitRunner`
y `-e class pe.edu.hidromejora.app.AndroidUpgradeInstrumentedTest`. Preparar un
AVD nuevo sin red y firmar la instrumentación con la configuración privada
existente; nunca copiar contraseñas a argumentos o documentos. Una instrumentación
con firma debug no sirve para probar la release. La prueba de paquete ya existente
`ExampleInstrumentedTest` se ejecutó además en el AVD debug: `OK (1 test)`.

Esta comprobación acredita preferencias persistentes y compatibilidad de firma;
no promete conservar una sesión activa o sessionStorage entre procesos, ni
equivale a una prueba con un teléfono de un usuario real.

## Matriz de ejecución funcional

Las acciones DOM de la debug se automatizaron mediante la conexión **Android**
de Playwright al WebView del AVD; no mediante Chromium de escritorio con un
User-Agent Android. Teclado, Atrás, rotación, Photo Picker, permisos, SAF y visor
se operaron con adb/UIAutomator. SQL y el proveedor de correo son fixtures locales.

| Comprobación | Evidencia nativa / alcance |
| --- | --- |
| Instalación, apertura y Capacitor | Release actualizada y debug abiertas; origen local y plugin HidroDocuments reconocidos. |
| Registro y OTP | 202/en cola sin usuario/JWT, código incorrecto con intento persistido, caducidad y confirmación deshabilitada, reenvío y confirmación; una cuenta/suministro después del OTP. |
| Cola | Estados en cola, procesando y aceptado mostrados en WebView; aceptación simulada, nunca envío real. Otros estados terminales se acreditan en las regresiones Chromium/API. |
| Desconexión | Interfaces del AVD apagadas: fallo real de fetch/consulta, UUID conservado; al activar Wi-Fi recupera el mismo registro sin repetir el POST. |
| Login / Perfil | Login con cuenta sintética verificada, dashboard y correo/suministro recuperados desde PostgreSQL. |
| Atrás / teclado | Teclado Android al enfocar; Atrás lo oculta. Fuera del tutorial, Perfil vuelve a Inicio sin logout. Durante tutorial Atrás conserva el recorrido, como exige el código. |
| Rotación | Cambio real de orientación; dashboard y sesión continúan. Captura horizontal local. |
| Recibos / pagos | Recibo creado en API de fixtures aparece en Android; detalle, pago una sola vez en SQL, deuda e historial actualizados. Pago del prototipo, sin cargo bancario. |
| PDF | jsPDF → plugin nativo → ACTION_CREATE_DOCUMENT → Downloads. PDF real de 10.041 bytes, cabecera `%PDF-`, abierto y revisado en el visor Android de Google Docs, sin cuenta Google. |
| Fotografías | Photo Picker del sistema, imagen PNG válida, FileReader y vista previa sin permisos de almacenamiento general. |
| Ubicación | Denegación y formulario sin coordenadas aprobados. **Obtención de posición no aprobada:** permiso concedido, pero timeout en el AVD incluso con proveedor Android de pruebas. Coordenadas exitosas solo comprobadas mediante simulación Chromium. |
| Incidencias | Formulario Android con PNG del selector nativo; incidencia persistida con foto y coordenadas NULL tras el error de ubicación. Recuperación por endpoint autenticado y visualización de la foto aprobadas. |
| Logout / proceso | Logout limpia sesión; tras `am force-stop` y reapertura hay login limpio, tutorial conservado y solicitud pendiente intacta en SQL. **El UUID pendiente de sessionStorage no sobrevive al proceso**. |
| Cortes / notificaciones | Corte de zona aplicable al suministro sintético, listado, notificación dentro de la app y lectura persistida. No hay plugin de push del sistema en este proyecto. |
| Socket.IO | Conexión real AVD → API aislada; crear recibo actualiza la deuda en la pantalla mediante el socket. |

No se certifican cámara física, GPS físico, autofill SMS/OTP, TalkBack, Android 6,
otros fabricantes, cambios Wi-Fi/datos móviles reales ni WebView actualizado a la
última versión. Se comprobó la selección de una foto local, no captura por cámara.

La pérdida de sessionStorage tras detener el proceso confirma el límite anunciado
en el avance 15: no hay recuperación automática de esa solicitud desde el nuevo
WebView. No se borró la solicitud del servidor ni se creó una cuenta sin OTP.
El usuario debe reintroducir datos conforme a los límites vigentes. Antes de
prometer continuidad tras cierre forzado, decidir y validar persistencia durable
solo de UUID/suministro/plazos, retención y limpieza; nunca contraseña, correo,
OTP o restauración automática de JWT. Ese cambio de almacenamiento requiere un
avance propio y no se implementó como atajo durante esta validación.

## Seguridad comprobada

- Paquete y versión del manifiesto compilado correctos; release sin debug ni la
  excepción de red debug. API y Socket.IO conservan
  `https://hidro-mejora-api.onrender.com`; no se alteró esa URL para probar escrituras.
- La release utiliza `https://localhost` como origen interno. La debug usa HTTP
  local con el XML de desarrollo ya existente; no se amplió el permiso cleartext.
- APK inspeccionada: 17 archivos en `assets/public`, recursos cliente completos,
  sin Admin, keystore, `.env`, dumps ni patrones comprobados de claves privadas o
  conexiones PostgreSQL. Comparación adicional con cinco valores privados locales
  de al menos 16 caracteres: cero coincidencias, sin imprimirlos ni registrarlos.
- Permisos: Internet, ubicación coarse/fine y permiso interno de receiver
  no exportado añadido por AndroidX. Sin almacenamiento general, cámara ni
  ubicación en segundo plano. FileProvider no exportado con concesión temporal.
- Ningún dato real se introdujo en los AVD/logs. Evidencia local solo sintética;
  no se publican buzones simulados, tokens, capturas, PDF, APK o configuración privada.
  No se acredita el comportamiento de todos los errores posibles ni se hace una
  afirmación de ausencia absoluta de secretos desconocidos.
- `allowBackup=true` permanece como antes. Revisar política de respaldo y estado
  WebView antes de distribuir; tampoco se acredita almacenamiento cifrado o TLS pinning.

## Regresión independiente de Android

Suite Node 20: **114 pruebas TAP, 113 aprobadas, una omisión condicional H02,
cero fallos**. Incluye correo, contrato, outbox/PostgreSQL, recibos/pagos
concurrentes, configuración, firma, candidato Android, documentos, sesión,
transición OTP y Perfil. Las pruebas del contrato antiguo cargan el HTML de
`v1.0.0`; no ejecutan su APK.

También pasaron esquema de correo, API, retención y CLI de limpieza en bases
nuevas. Preparación y simulación terminal pasaron indicando explícitamente
`HIDRO_EMAIL_TEST_CONTAINER=hidro-compat-test-20261021`; el primer intento con el
nombre predeterminado de otro contenedor fue rechazado por el guardia de fixtures
antes de continuar y se corrigió la invocación. No se ejecutó `--live`.

Harness Chromium cliente/admin con matriz visual y doble submit: **25
comprobaciones, cero errores JavaScript y cero recursos fallidos**, repetido
después de corregir el PNG sintético. Sus fotos/ubicación/puente PDF simulados no
se contabilizan como pruebas nativas. La suite nativa anterior usa WebView real.

Comandos de regresión: scripts `test:config`, `test:email`, `test:email:contract`,
`test:email:outbox`, `test:receipts`, `test:documents`, `test:android:upgrade`,
`test:android:transition` y pruebas de firma/Perfil; PostgreSQL de fixtures requiere
`HIDRO_EMAIL_TEST_DB_PORT=32768`. Para Perfil/transición se utilizó
`PLAYWRIGHT_BROWSERS_PATH=artifacts/vercel-validation/browsers`.

## Incidencias de validación y límites

- Resueltos los bloqueos de sandbox mediante ejecución autorizada, sin debilitar
  HTTPS ni cambiar permisos del sistema Debian. No eran fallos de la app.
- Herramientas CLI enlazadas al SDK original no descubrían la imagen aislada;
  se copiaron las command-line tools al SDK de artifacts y se indicó el directorio
  AVD explícito. No se sustituyó el SDK del usuario.
- El harness inicial de escritorio no era compatible con contextos WebView;
  se usó la conexión Android de Playwright. UIAutomator a veces devolvió raíz nula:
  esas lecturas no se contaron como aprobación y se repitieron con jerarquía actual.
- Se corrigió el CRC de IDAT del PNG sintético de `scripts/test/admin-e2e.cjs`.
  Chromium lo toleraba; el proveedor de medios nativo no garantizaba su lectura.
  Solo cambia el fixture, sin modificar el tratamiento de imágenes de la app.
- `navigator.onLine` siguió en true con interfaces apagadas. Se validó la pérdida
  mediante una petición realmente fallida y el mensaje de la app, sin confundir
  el indicador con disponibilidad del backend.
- La primera navegación del harness coincidió con el tutorial móvil abierto;
  se respetó su prioridad y se omitió mediante su control móvil antes de probar
  Atrás. El primer recibo sintético excedía el máximo de periodo y fue rechazado;
  se corrigió el fixture. No se cambiaron reglas de negocio para aprobar pruebas.
- El GPS por `emu geo fix` no proporcionó una posición al proveedor utilizado
  por WebView dentro del timeout de 8 s de la app. Con permiso concedido y un
  proveedor `network` de pruebas tampoco se obtuvo posición. Una consulta
  diagnóstica adicional con alta precisión devolvió código 3, `Timeout expired`.
  **Prueba nativa de ubicación concedida pendiente/fallida en este entorno**;
  no se afirma que se deba a una causa concreta de la app o de Google Play
  Services. No se cambió la precisión/timeout del producto para hacer pasar el
  harness. Siguiente diagnóstico: teléfono de pruebas, GPS/red conocidos y
  WebView actualizado; si persiste, evaluar con evidencia una política explícita
  de precisión/reintento. No se implementa ese cambio aquí.

Evidencia local ignorada: `artifacts/android-native-1.1.0/` y build release
`artifacts/android/builds/release-1.1.0-MA9z2U/`. Incluye XML de pruebas/lint,
checksums, salidas de instrumentación, capturas de login actualizado, teclado,
dashboard, rotación, recibo, SAF, visor PDF y Photo Picker. Las capturas solo
contienen información sintética. Este documento permite evaluar el resultado
sin publicar los artefactos privados.

## Antes de distribuir

1. Resolver la obtención de ubicación y completar validación de la release en un
   teléfono de pruebas y Android/API adicionales, incluyendo permisos permanentes,
   cámara, GPS, accesibilidad y la decisión sobre recuperación tras muerte del proceso.
2. Resolver los requisitos operativos de [transición OTP](../android-transicion.md)
   y [outbox](../correo-outbox.md): migraciones, dominio, trabajador, monitoreo y
   canario real requieren autorización independiente. Este avance no los ejecuta.
3. Revisar `allowBackup`, límites de sessionStorage/ciclo de vida y avisos lint;
   conservar certificado y código superior a cualquier versión distribuida.
4. Confirmar checksum/commit de la APK que se vaya a entregar y obtener autorización
   explícita para tag, Release y distribución. El artefacto local de este informe
   **no se ha publicado ni reemplaza el asset 1.0.0**.

Referencias de preparación del AVD:
[avdmanager](https://developer.android.com/tools/avdmanager) y
[emulador por línea de comandos](https://developer.android.com/studio/run/emulator-commandline).
