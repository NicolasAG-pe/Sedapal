# Sesión automática después del OTP — Android 1.1.2

Fecha: 24 de octubre de 2026. Base: `origin/main` en
`d6a6b83057f179168d54d3691e5738ff2d060740`; trabajo en
`feature/verificacion-correo`. No se fusiona ni despliega este incremento.

## Cambio y límites de seguridad

`verify-email` crea la cuenta con la transacción existente. Solo después de su
COMMIT, un emisor inyectado consulta nuevamente el usuario y su suministro,
exige `activo=true` y rol `usuario`, y firma mediante `generarTokenAcceso`.
Se conserva la caducidad de ocho horas, sin refresh tokens ni cambios de permisos.
Cada petición autenticada continúa comprobando la cuenta en PostgreSQL.

La respuesta 201 añade `token`, datos de usuario y `suministro`; mantiene
`usuario.numero_suministro` para clientes anteriores. Un OTP incorrecto,
caducado, consumido o sin intentos no entrega credenciales. Ni la consulta pública
de estado ni repetir una confirmación permiten recuperar el JWT. Un fallo de firma
posterior al COMMIT deja la cuenta creada y permite recuperarla por login normal.

`completarVerificacion` limpia OTP, formulario y metadatos. Usa `guardarSesion`,
que llama al `establish()` de `createHMClientSession`, y después reutiliza
`entrarDashboard()`. Android conserva el JWT mediante el Keystore/AES-GCM existente;
la web solo lo mantiene en memoria. No se guarda ni reutiliza la contraseña para
hacer otro login. Se muestra «¡Correo verificado! Bienvenido a Hidro-Mejora».
La consulta periódica no puede adelantar el login mientras se procesa el OTP.

Si falla el almacenamiento seguro, se retira la sesión incompleta y no se abre el
dashboard. Si también falla la retirada, se conserva la pantalla bloqueada de
cierre seguro existente. Respuesta perdida o servidor anterior sin JWT: login
normal, con contraseña vacía. Un reinicio posterior valida la sesión con el backend
antes de mostrar información privada, como en la implementación anterior.

No se modificaron esquema/migraciones, cuentas existentes, algoritmos de hash,
correo, proveedor, outbox, flags de registro, Neon ni configuración de Render.

## Pruebas ejecutadas

Todas las escrituras usaron PostgreSQL 18 nuevo, datos sintéticos y correo simulado.
No se conectó Neon ni se enviaron mensajes reales. El contenedor de prueba empleó
una red Docker interna y datos temporales independientes; se conservaron los
cuatro servicios originales y el clúster de Kubernetes.

| Comprobación | Resultado y alcance |
| --- | --- |
| Node 22.23.4: `otp-auto-session`, `email-contract`, `email-outbox-api`, `android-session`, `email-otp.test` | 26 tests aprobados con API/SQL reales aislados. Incluyen JWT 8h, sesión, aislamiento, roles, duplicación concurrente, rollback, firma después de COMMIT, fallo de firma, cuenta deshabilitada y rol cambiado. |
| Node 22: `Backend/test/email-api.cjs` | Aprobado: registro, rechazo previo al OTP, normalización, confirmación atómica, vencimiento, intentos/reenvíos, conflictos y login anterior. |
| Chromium: `scripts/test/android-transition.cjs` | 16 tests aprobados: dashboard directo sin petición de login, limpieza, respuesta perdida, compatibilidad con cliente v1.0.0 y v1.1.1, y backend anterior sin JWT. No son pruebas Android nativas. |
| `secure-session`, `client-session`, `registration-state` | 17 tests aprobados: memoria, cancelación, rechazo/restauración, cambio de cuenta y persistencia separada del registro. |
| Configuración, API pública y actualización Android | 14 tests aprobados en Node 20.19.2 del host; identidad, versión superior y runtime sin Admin. |
| Android 15/API 35, AVD `hm_110_debug_api35`, WebView real | 12 comprobaciones aprobadas con APK debug 1.1.2/5 contra API local y PostgreSQL aislado. |
| Instrumentación Android Keystore | 1 test aprobado: clave no exportable, AES-GCM/IV distintos, rechazo de alteración y borrado. |
| Release firmada, AVD nuevo `hm_112_release_api35` | Instalación 1.1.1/4 seguida de `adb install -r` 1.1.2/5, sin desinstalar; fecha de primera instalación conservada. Apertura del login correcta con Wi-Fi y datos móviles apagados. No se hizo login contra producción. |
| Release Java 21 / Gradle 8.11.1 | `assembleRelease`, `testReleaseUnitTest` (4 tests), `lintRelease` y `compileDebugAndroidTestSources`: aprobados. Lint: 0 errores y 16 advertencias de manifiesto/recursos; no se cambian esos archivos para esta UX. |

La ejecución nativa OTP comprobó respuesta de registro perdida, UUID estable,
concurrencia, cola/procesamiento/aceptación simulada, OTP incorrecto y vencido,
reenvío y recuperación de confirmación perdida sin JWT. Luego comprobó:

- Fallo inyectado de `writeSession`: sin dashboard ni credencial persistida.
- OTP correcto: dashboard sin llamar a `/api/auth/login`, formulario vacío y
  registro temporal eliminado; token ausente de WebStorage y del archivo cifrado.
- Force-stop y muerte del proceso: restauración de la sesión automática con un
  único Socket.IO. La muerte se simuló con SIGKILL del PID propio tras HOME;
  no se afirma haber provocado una terminación real por presión de memoria.
- Logout y reapertura: la credencial no reaparece.

Las primeras ejecuciones fallaron por herramientas, no por la aplicación:
Chromium no encontraba su caché hasta usar `PLAYWRIGHT_BROWSERS_PATH`, y la imagen
Node Alpine no incluía Git para el test que consulta el tag v1.0.0. Se corrigió
la ruta del navegador y se ejecutó la suite de configuración completa en el host,
donde Git está disponible. Las ejecuciones finales indicadas arriba aprobaron.
La comprobación inicial de apertura release buscaba el campo antiguo
`mResumedActivity`; Android 15 expone `topResumedActivity`. Se comprobó ese campo
y se inspeccionó visualmente la captura del login, sin repetir la instalación.
UIAutomator no expuso el texto de la WebView release; esa aserción no se cuenta
como aprobada. La apertura visual sí quedó confirmada en `release-upgrade.png`.

Evidencia privada e ignorada por Git:
`artifacts/otp-auto-session-112/` (logs, checksums y resultados) y
`artifacts/android-session-native-snTDNd/` (instrumentación, 12 comprobaciones y
captura `otp-auto-dashboard.png`). No se versionan cuentas, tokens ni capturas.

## Artefacto candidato

Generación oficial: `npm ci` y `npm run android:release`, con runtime regenerado
para `https://hidro-mejora-api.onrender.com` después de las pruebas debug locales.
Salida Gradle independiente: `artifacts/android/builds/release-1.1.2-urk8dp/`.

- APK: `artifacts/android/hidro-mejora-v1.1.2-release.apk`, 3.405.717 bytes.
- SHA-256: `a6b81541a210e79ffb6ec8a38c79b8b1260758ab45c246b81fca45ee4439ed93`.
- `pe.edu.hidromejora.app`, versión `1.1.2`, código `5`, no depurable.
- Certificado SHA-256 permanente:
  `ea195e488d3746cfc846a3dbe69f188fb242e6eda7f5391d05b3ba203ad0b972`.
- `apksigner verify`: correcto. Runtime con OTP, sesión segura e HidroBot,
  sin código Admin, configuración de API local ni material privado de servidor.
- APK 1.1.1 conservada: SHA-256
  `541b4c9d70a52396266358d786032db47c85e99aa2ae4d7ae1bcf5eb28c3bb4b`.

La validación nativa del flujo utiliza debug con backend aislado. No se atribuyen
esas pruebas a producción ni a un teléfono físico. Se comprobó actualización
nativa de la release 1.1.1 a 1.1.2. La firma y el incremento de versión mantienen
la identidad distribuida desde 1.0.0; para 1.0.0 se comprobó certificado/versión y
contrato mediante Chromium, sin repetir su actualización nativa en este avance.

## Reproducir y publicar más adelante

`npm run test:email:auto-session` requiere el puerto de un PostgreSQL sintético
según `Backend/test/email-schema.cjs`; nunca apuntarlo a una base existente.
Para Chromium se usa la herramienta Playwright local documentada en TESTING y
`PLAYWRIGHT_BROWSERS_PATH=artifacts/vercel-validation/browsers`. Para WebView:
`npm run test:android:otp:native`, exclusivamente en el AVD dedicado indicado por
el harness. El script release evita sobrescribir un APK de la misma versión.

Backend preparado y probado, **no desplegado**. Con el backend actual que devuelve
solo suministro después del OTP, esta candidata usa login normal. Pendiente:
revisión y autorización para integrar/desplegar la respuesta ampliada, prueba
física de OTP y sesión frente al backend aprobado, y autorización separada para
publicar el APK. No se amplió el registro ni se enviaron correos de prueba.
Vercel mantiene la exclusión de esta rama en ambas raíces; Render fue consultado
solo en lectura y conserva autodespliegue/previews desactivados.
