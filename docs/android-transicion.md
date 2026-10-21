# Transición Android y contrato OTP — avance 15

Fecha: 21 de octubre de 2026. Rama `feature/verificacion-correo`, Draft PR #1.
Referencia distribuida: tag `v1.0.0` (`135cb54173ee60e2f528738805564773e3c32e8b`),
versionName 1.0.0 / versionCode 2. Referencia anterior a este avance: `226048c`.
La consulta de Releases al iniciar este trabajo mostró únicamente v1.0.0 publicada.

## Dictamen y reproducción de H01

H01 está mitigado en el código de desarrollo con contrato explícito y rutas OTP;
la transición productiva requiere validación nativa, firma y autorización propias.
**No se declara esta actualización lista para producción.** No se puede añadir una
pantalla OTP ni reemplazar remotamente los recursos de una APK ya instalada.

Antes de editar se ejecutó el HTML/JS de v1.0.0 obtenido de Git en Chromium móvil,
contra API actual/PostgreSQL 18 en una base nueva y proveedor simulado. Se observó
202/en_cola, mensaje mostrado como error, ausencia de pantalla OTP, una solicitud
pendiente y cero usuarios creados. El mismo HTML inició sesión y abrió dashboard
con una cuenta sintética cuya fecha de verificación era NULL. Evidencia local
ignorada: `artifacts/h15-verification/baseline.txt`.

La prueba permanente `scripts/test/android-transition.cjs` carga también los
recursos originales del tag; después de la corrección comprueba 426 legible,
cero solicitudes/eventos creados por el cliente antiguo y login conservado.
No se modifican flags de verificación de cuentas históricas, JWT, contraseñas,
suministros, recibos, pagos ni permisos de negocio.

## Matriz de compatibilidad

| Cliente / API | Resultado y límite |
| --- | --- |
| APK 1.0.0 / backend 1.0.0 | Contrato histórico 201/ok y alta inmediata, sin OTP. Solo referencia; no habilitar este modo como puente. |
| APK 1.0.0 / backend de avance 15 | Login habitual; el intento de alta recibe 426 y un mensaje que el HTML antiguo muestra mediante textContent. No crea solicitudes ni envía correo. |
| Cliente OTP anterior (avances 5–14) / backend nuevo | Login conservado; altas/reenvíos sin contrato se rechazan. Puede confirmar una solicitud anterior que conserve su UUID/código; no se inventan vencimientos ni se reenvían históricos automáticamente. |
| Cliente nuevo / API antigua | Consulta capacidades; si no hay contrato, muestra indisponibilidad antes del POST. Login no añade cabecera nueva y conserva compatibilidad CORS con API anterior. |
| Cliente nuevo / API cambia a antigua después del preflight | POST a ruta OTP inexistente en la API antigua: 404, sin creación insegura de cuenta. Nunca hay fallback al POST de registro histórico. |
| Cliente nuevo / API nueva / trabajador apagado | 202 en cola, sin usuario/JWT. Espera/consulta/reenvío según límites. Capacidades no certifican trabajador, dominio ni entrega. |
| Cliente nuevo / API nueva / trabajador habilitado posteriormente | OTP de seis dígitos, 300 s desde primer claim confirmado, confirmación 201 y login posterior. Aceptación Resend no equivale a entrega. |

La cabecera de contrato identifica capacidad técnica, **no autentica ni autoriza**.
Cualquier cliente puede imitarla; todas las altas siguen requiriendo OTP y las
restricciones PostgreSQL. No se confía en User-Agent ni en un número de versión
para permitir registros sin verificación. No hay excepción legacy activable.

## Contrato preparado

- `GET /api/auth/capabilities`: contratos admitidos y verificación obligatoria;
  público, sin datos de cuenta ni consulta SQL, Cache-Control no-store.
- `POST /api/auth/otp/register`: cabecera `X-Hidro-Auth-Contract: otp-outbox-v1` y
  cuerpo `solicitud_id`, `correo`, `numero_suministro`, `password`. El UUID v4 lo
  genera el cliente con getRandomValues antes de enviar. 202 conserva los campos
  de la outbox y devuelve ese identificador. Nunca 201 de cuenta sin verificar.
- `POST /api/auth/otp/resend-verification`: contrato y `registro_id`; sujeto a los
  límites de 60 s, tres reservas por hora y cinco intentos de código acumulados.
- Los alias `/api/auth/register` y `/api/auth/resend-verification` siguen protegidos
  por el mismo contrato (y UUID para alta). Sin contrato: 426,
  `codigo: CLIENT_UPDATE_REQUIRED`, mensaje de actualización y login disponible.
- Confirmación y consulta mantienen sus rutas de avance 14. Consulta devuelve
  pendiente/plazos; también `estado: verificado` para recuperar un 201 perdido,
  `estado: cerrado` con motivo sustituido/vencido/sin_intentos y 404 si no existe.
  No devuelve destinatario, contraseña, hash, código, JWT ni datos de negocio.
- CORS permite la cabecera de contrato desde los orígenes ya autorizados, incluido
  `https://localhost`; no amplía el allowlist. Login y lectura de capacidades no
  envían esa cabecera, para seguir funcionando contra el CORS antiguo.

## Recuperación e integridad

El cliente guarda **antes del POST** solo UUID, suministro y plazos/estado en
sessionStorage. Nunca contraseña, correo, OTP o JWT del registro. Si no puede
persistir el identificador, no inicia el POST. No es un reemplazo de almacenamiento
seguro nativo ni garantiza supervivencia a desinstalación, borrado de datos o muerte
del proceso WebView; esos límites se validan en teléfono antes de publicar.

Si se pierde la respuesta consulta el UUID, no repite automáticamente una escritura.
Si no llegó al servidor, «Volver al registro» permite reintroducir las credenciales
y reintentar explícitamente con el mismo UUID. Si sí llegó, la consulta reanuda la
solicitud confirmada. Una respuesta de confirmación perdida se reconoce como
verificada y vuelve al login sin crear JWT automáticamente.

El backend serializa el UUID en el espacio advisory 7403 y después las identidades
ordenadas 7401. La PK existente y los locks impiden dos filas/eventos por ese UUID.
Un reintento requiere mismo correo/suministro y contraseña comprobada contra el
hash original; conserva hash de contraseña/OTP, intento, vigencia y reserva de cuota.
Datos distintos producen conflicto; no sobrescribe la solicitud. No necesita una
migración nueva: usa la PK UUID y el esquema 003–006 existente. La idempotencia no
se promete indefinidamente después de la retención o de borrar datos del dispositivo.

Un reenvío no se repite automáticamente si hubo timeout: se consulta el estado y
cooldown antes de habilitar otro. El código anterior se borra de la entrada al pedir
reenvío. Las solicitudes sustituidas/agotas/vencidas muestran el motivo y desactivan
confirmación/reenvío. «Usar otros datos» descarta solo el estado local; no borra filas
SQL ni elude cuotas. La outbox, su cifrado, leases y límites de envío no cambian.

## Interfaz y sesión

Se mantiene el formulario y diseño originales; se añaden comprobar estado y volver
al registro sin rehacer navegación ni estilos. Se muestran cola, procesando,
aceptado, fallido, caducado, ambiguo, cancelado, código vencido e intentos agotados.
El código no se puede confirmar hasta tener una vigencia conocida; aparece cuenta
regresiva. La hora del servidor sigue siendo la autoridad del vencimiento, aunque
una hora incorrecta del teléfono puede afectar la presentación del contador.

Timeout de autenticación de 15 s (también al leer cuerpo), cancelación al cerrar
sesión y liberación de controladores al consumir respuesta. Errores de red/OTP no
cierran una sesión vigente ni disparan reintentos automáticos. Reaparecer la página
y el evento online vuelven a consultar la solicitud sin limpiar cuenta o sesión.

Se conserva la política previa de JWT en memoria/sessionStorage, sin restauración
automática de JWT local al cargar todo el runtime. Recargar/recrear el WebView puede
pedir login; una actualización instalada no garantiza mantener una sesión activa.
Eso no elimina cuentas ni exige que usuarios previos verifiquen otra vez su correo.
Un 401 real sigue cerrando la sesión y limpiando datos/socket como antes.

## Revisión Android y candidato

Propuesta: **1.1.0 / versionCode 3**, superior a la release distribuida, manteniendo
applicationId `pe.edu.hidromejora.app` y certificado permanente. Se reserva como
candidato de desarrollo, sin tag, release, APK compilada o distribución en este avance.
La propuesta ya está reflejada en Gradle (segundo incremento). Tres pruebas
estáticas/de empaquetado contrastan versiones, identidad, certificado público,
Capacitor y runtime; no verifican firma ni instalación de un artefacto compilado.

Capacitor mantiene webDir de runtime cliente, sin server.url remoto ni mecanismo
OTA. HTTPS de API/Socket.IO de release se fija en el script de release; esquema
WebView https://localhost, orígenes CORS explícitos y configuración pública sin
secretos. El HTTP local se limita a la configuración de desarrollo. XML debug
permite localhost/127.0.0.1/10.0.2.2; no se añade a release. El runtime de prueba se generó en directorios temporales; no se sincronizaron
los assets nativos. La futura compilación debe usar el script release completo
que genera/sincroniza Frontend: un assemble directo puede empaquetar assets viejos.
No cambia SDK, plugin,
applicationId, fingerprint, permisos o Native Bridge en este avance.

Permisos existentes: Internet y ubicación puntual coarse/fine, sin ubicación en
segundo plano ni almacenamiento general. Fotos dependen del selector WebView y PDF
de Storage Access Framework. allowBackup=true permanece como configuración previa:
revisar política de respaldo de WebView/estado temporal antes de una publicación.
No se ha acreditado almacenamiento cifrado de estado local ni pinning TLS.

Referencias: [versionado Android](https://developer.android.com/studio/publish/versioning),
[actualizaciones y firma](https://developer.android.com/google/play/app-updates),
[seguridad de red](https://developer.android.com/privacy-and-security/security-config).
La firma y el versionCode permiten actualizar sobre la aplicación existente sin
cambiar identidad; instalar es una acción explícita del usuario, no del backend.

## Pruebas y límites

Pruebas contra PostgreSQL 18 nuevo en el contenedor local de fixtures
`hidro-compat-test-20261021`, puerto loopback 32768. No se lee el .env de producción;
cada ejecución crea una base nueva. Todos los proveedores son simulados.

- Contrato + regresión backend/outbox/H02: Node 20.19.2 y Node 22.23.3, TAP 66,
  65 OK y una omisión condicional H02; incluye tres contenedores de subpruebas.
- Transición en navegador y sesión: 18 pruebas, incluidas carga real del HTML
  v1.0.0, rechazo 426, login anterior, backend antiguo, cambio tras preflight,
  cinco altas concurrentes con mismo UUID, pérdida de respuestas, caída de red,
  reintento sin POST previo, OTP incorrecto/vencido y estados de outbox.
- Perfiles Chromium con touch/UA/viewport: Pixel 5 a 360×780, Galaxy S9+ a 320×658,
  Pixel 7 a 412×839, iPad Mini a 768×1024 y escritorio 1366×900. Sin overflow ni
  controles fuera del ancho. Emulación de navegador, **no un Android nativo**.
- Harness cliente/admin: 25 comprobaciones con matriz visual, login, registro,
  OTP/reenvío, recibos, pagos, incidencias, permisos, navegación, PDF y sockets.
- Configuración 13, documentos 4, firma 7 y Perfil 3 pruebas. Firma se prueba con
  fixtures; no se lee el keystore privado ni se firma una APK.

Comandos reproducibles (Playwright/Chromium de validación local):

```sh
HIDRO_EMAIL_TEST_DB_PORT=32768 npm run test:email:contract
HIDRO_EMAIL_TEST_DB_PORT=32768 PLAYWRIGHT_BROWSERS_PATH=artifacts/vercel-validation/browsers npm run test:android:transition
```

Reportes locales ignorados en `artifacts/h15-verification/`; no se publican buzones,
JWT, capturas de datos ni logs privados. Las versiones antiguas requieren historia
Git local de v1.0.0 para los fixtures; ninguna prueba descarga/actualiza una APK.

Pendiente: emulador Android nativo API 23/35, instalación firmada sobre v1.0.0,
firma de artefacto, WebView real y ciclo de vida del proceso, teclado/OTP autofill,
Atrás, permisos negados/permanentes, cámara/galería, ubicación, PDF/visor, rotación,
sin red/cambio Wi-Fi/datos, accesibilidad con TalkBack y DNS/TLS productivos.
`adb` no mostró destinos conectados; no se ejecutó instrumentación ni prueba física.

## Plan coordinado de actualización y recuperación

1. **Revisión/preparación:** acordar ventana de altas y responsables; resolver los
   restantes bloqueantes de auditoría, inventariar versiones distribuidas y revisar
   merge posterior frente a main actual (contiene avances ajenos, no integrados aquí).
2. **Requiere autorización:** respaldar y comprobar restauración; aplicar únicamente
   migraciones pendientes 003–006 en orden y con preflight de 005, sin duplicarlas.
   Este avance no añade migraciones, no modifica Neon ni reconcilia históricos.
3. **Requiere autorización:** configurar API, secreto HMAC, clave outbox exclusiva,
   dominio/remitente y rol del trabajador según correo-outbox.md; conservar secreto
   JWT y cuentas existentes. Preparar monitoreo y un destinatario canario autorizado.
4. **Requiere autorización:** desplegar API nueva con rutas OTP y guardia 426 en la
   ruta antigua. Mantener login y negocio. En una flota mixta todos los escritores
   de registro deben usar el guardia; retirar/enrutar las altas del backend antiguo.
   No prometer continuidad del registro v1.0.0: no puede completar OTP. Comunicar
   actualización necesaria sin bloquear login ni pedir una verificación masiva.
5. **Requiere autorización:** habilitar trabajador independiente, supervisión y
   canario real; acreditar aceptación y recepción por separado. No abrir altas
   públicas hasta que API, esquema y trabajador estén listos. Capacidades no es
   un healthcheck de entrega y sin worker hay acumulación de cola.
6. **Preparación y autorización separadas:** compilar el candidato con la misma
   firma, comprobar versión, HTTPS y runtime sin secretos. Instalar sobre v1.0.0
   en destino de pruebas y luego teléfono; no desinstalar/borrar datos para fingir
   compatibilidad. Solo después autorizar distribución gradual por canal oficial.
7. **Requiere autorización:** publicar/distribuir APK y mensaje de actualización.
   Una APK nueva distribuida antes de la API sigue permitiendo login y rechaza el
   registro incompatible. Backend primero es preferible tras canario; ambos órdenes
   conservan cuentas. Medir 426, errores, cola/edad/leases, aceptación, confirmación,
   login, incidencias y pagos, sin etiquetas con datos personales.
8. **Recuperación autorizada:** pausar nuevas altas y preservar login/negocio. No
   restaurar el registro antiguo sin OTP ni borrar la outbox. Detener worker con
   SIGTERM y recuperar leases con la misma clave según avance 14. Mantener esquema
   aditivo y solicitudes confirmadas. Corregir hacia adelante antes de reabrir.
   Android impide normalmente bajar versionCode: una APK correctiva debe usar un
   código superior, la misma firma e identidad. No forzar downgrade ni desinstalar
   usuarios como procedimiento de recuperación.

Nada de los pasos operativos anteriores se ejecutó. No se hizo merge, despliegue,
correo real, cambio de credenciales, datos reales ni publicación de APK.

## Archivos del avance

- Registro/API: `Backend/email-registration.js`, `Backend/server.js`.
- Cliente: `Frontend/index.html`, `Frontend/assets/js/client-session.js`.
- Android: `android/app/build.gradle` (solo versionCode/versionName).
- Pruebas: `Backend/test/email-contract.cjs`, `email-api.cjs`, `email-live.cjs`,
  `email-outbox-api.cjs`; `scripts/test/android-transition.cjs`,
  `client-session.test.cjs`, `android-upgrade.test.cjs`, `admin-e2e.cjs`,
  `client-checks.cjs`. La prueba SIGKILL espera el registro sintético completo
  antes de matar al proceso: existir el archivo no garantiza que terminó write().
- Scripts: `package.json`, comandos de contrato, transición y candidato.
- Documentación: `CHANGELOG.md`, `docs/ANDROID.md`, `ANDROID-RELEASE.md`,
  `android-transicion.md`, `API.md`, `auditoria-produccion.md`, `verificacion-correo.md`,
  `correo-outbox.md`. Sin nueva migración ni modificación de pagos/recibos.
