# Android: sesión segura, recuperación OTP y ubicación — avance 17

Rama `feature/verificacion-correo`, Draft PR #1. Candidata 1.1.0 / código 3,
paquete `pe.edu.hidromejora.app`. Se conservan firma permanente, estructura,
diseño, permisos y duración del JWT; ninguna distribución o despliegue autorizado.
Este informe se completa por incrementos verificables durante el avance.

## Problemas reproducidos antes de cambiar las fuentes

En el AVD Android 15 del avance 16, compilando primero `cebcef5` contra una API
temporal/PostgreSQL nuevo y Resend simulado, se comprobó:

- Login correcto, JWT copiado sin cifrar a sessionStorage; después de force-stop
  y reapertura no había sesión activa. El arranque inicializaba memoria vacía y
  eliminaba la copia sin validarla. No existía un plugin de persistencia segura.
- Alta pendiente con UUID guardado en sessionStorage; después del mismo ciclo
  desaparecía el UUID del WebView, pero la solicitud seguía pendiente en SQL.
- El timeout de ubicación del avance 16 queda como antecedente nativo; se vuelve
  a diagnosticar en el incremento específico, sin declarar resuelta su causa por
  la sola presencia de permisos.

Evidencia original local: `artifacts/android-session-17/baseline-result.json`.
Se crearon únicamente cuentas y bases sintéticas; no se alteraron bases históricas,
Neon ni servicios Docker existentes.

## Incremento 1: persistencia y restauración de sesión

Se evaluaron los plugins instalados: App y el plugin propio de documentos no
ofrecen almacenamiento cifrado. Se reutiliza la integración Java/Capacitor
existente para registrar `HidroSecureState`, sin añadir dependencias ni un gestor
de autenticación nuevo.

### Almacenamiento

`EncryptedStateStore` usa AES-256-GCM, IV aleatorio de 96 bits por escritura,
etiqueta de 128 bits y AAD ligada al paquete, tipo de estado y versión. La clave
se genera y utiliza en **Android Keystore**, no se exporta a JavaScript ni se
incluye en la APK. El respaldo por hardware depende del dispositivo; el AVD no
acredita TEE/StrongBox físico. No es la clave de firma release ni la sustituye.

Solo el JWT se cifra en `getNoBackupFilesDir()/hm-secure-v1/session.bin` mediante
AtomicFile. No se guardan contraseña, refresh token, rol confiable ni datos de
perfil. El archivo queda fuera del backup automático; la clave pertenece a esa
instalación. Pérdida/inaccesibilidad de la clave o ciphertext alterado no habilitan
una sesión; se solicita autenticación o se muestra indisponibilidad segura.

Las operaciones nativas y las del adaptador JS están serializadas. El cierre
escribe primero una marca durable de rechazo y después retira el ciphertext;
un nuevo login retira la marca solo después de guardar correctamente su JWT.
Una respuesta de guardado/restauración tardía no puede autorizar la generación
de otra identidad ni resucitar la sesión después de un logout confirmado.

Se retiran las copias de JWT de sessionStorage. Cliente web y panel Admin mantienen
JWT **solo en memoria**, sin ofrecer persistencia insegura como alternativa. Se
eliminan claves de sesión heredadas al iniciar; no se importa un JWT antiguo sin
validación ni se promete borrado forense de bases internas antiguas de WebView.

Capacitor usa `loggingBehavior: none` también en debug: su bridge transporta el
JWT en memoria y el logging de argumentos/respuestas podría revelarlo. El plugin
devuelve errores genéricos, sin causas criptográficas, argumentos o credenciales.

### Ciclo de vida y contrato

1. Login conserva el contrato y las contraseñas existentes. Android espera la
   confirmación del guardado cifrado antes de entrar; si falla, no inicia sesión
   ni utiliza Web Storage como fallback.
2. Al arrancar, una pantalla breve de comprobación mantiene ocultos formularios
   y datos privados. Se lee la credencial cifrada y se valida una sola vez contra
   `GET /api/auth/session`, antes de iniciar dashboard o Socket.IO.
3. La ruta verifica firma/caducidad JWT y reconstruye cuenta activa, rol y suministro
   desde PostgreSQL. Solo admite cliente activo; devuelve los datos actuales y
   `Cache-Control: no-store`. **No emite JWT nuevo ni renueva sus ocho horas**.
4. JWT inválido/expirado o cuenta deshabilitada/otro rol: 401/403, retirada de la
   credencial y login. Sin internet/5xx o backend sin esa ruta: datos ocultos y
   opción de reintentar o retirar la credencial para usar otra cuenta. No se
   confunde una indisponibilidad temporal con revocación.
5. Login y restauración usan una única entrada al dashboard y el mismo control
   de generación, cancelación de peticiones y Socket.IO. No se restaura el DOM
   privado de una cuenta anterior.
6. Logout limpia inmediatamente memoria, datos y conexiones; solo confirma el
   cierre después de retirar el estado nativo. Si falla, permanece protegido y
   ofrece reintentar el cierre. La garantía corresponde al cierre confirmado;
   no puede prometerse que una operación aún no recibida por Android termine si
   el proceso es interrumpido antes de su confirmación.

No se implementan refresh tokens ni revocación central. Logout retira la copia
local; un JWT previamente extraído puede seguir siendo válido hasta sus ocho
horas. Cambio de contraseña no revoca tokens ya emitidos. Deshabilitar una cuenta
sí se comprueba en cada petición y durante restauración. Revocación por sesión,
rotación de refresh tokens o expiración activa de sockets son cambios separados,
no capacidades que este avance atribuya al backend actual.

La ruta nueva es aditiva: la APK 1.0.0 conserva su login y las cuentas anteriores
no necesitan modificar contraseña, suministro o verificación histórica. Para
restauración automática, el backend debe incluir `/api/auth/session`; frente a
una API anterior, la aplicación no muestra datos sin comprobar y permite optar
por login. No hay migración SQL nueva para esta función.

### Verificación del incremento

- Reproducción nativa previa archivada.
- Casos JS de validación diferida, single-flight, 401/403, red/5xx, logout durante
  lectura/validación/guardado, error de almacenamiento y cambio de identidad.
- API/PostgreSQL: cuenta histórica sin fecha de verificación, JWT expirado,
  alterado, cuenta deshabilitada, rol cambiado, lectura sin escrituras y TTL 8 h.
- Instrumentación Android opt-in: clave no exportable, archivos sin JWT en claro,
  IV distinto para dos escrituras iguales, rechazo de ciphertext alterado y
  retirada confirmada. Solo AVD dedicado con fixtures.
- Harness permanente `scripts/test/android-session-native.cjs`: genera runtime
  nuevo, compila APK debug e instrumentación, y comprueba WebView/Keystore reales.
  No es Chromium con un User-Agent móvil. Su informe local registra únicamente
  resultados y metadatos sintéticos, sin JWT o contraseñas.

Ejecución nativa final del incremento: **12 comprobaciones aprobadas**, una
prueba instrumental de Keystore aprobada y cero errores del harness. Primer login,
reapertura normal, force-stop, muerte del proceso, expirado/alterado/deshabilitado,
logout, cambio de cuenta, arranque sin red/reconexión y logcat sin credenciales.
Cada restauración válida genera un GET y una conexión Socket.IO. Evidencia local:
`artifacts/android-session-native-H6o24s/result.json` y sus capturas/logs.

Los intentos previos fallidos del harness se conservaron: se corrigieron conteo de
OPTIONS, simulación de muerte del proceso y espera de conectividad real del AVD.
No se contaron como aprobados.

Resultados adicionales: 10 pruebas de sesión JS/API aprobadas; 18 de transición y
sesión previa; 15 de configuración/documentos/Perfil. E2E Chromium cliente/Admin:
25 comprobaciones sin errores JS ni recursos fallidos. Java debug: cuatro pruebas
y lint sin errores. Chromium no se contabiliza como ejecución nativa.

La terminación del proceso se simula con SIGKILL del PID del propio UID tras HOME
cuando ActivityManager conserva el proceso. No es una reproducción de LMKD/OOM
real del sistema. El harness registra esa distinción.

## Incrementos siguientes

La recuperación OTP durable y el diagnóstico de ubicación aún no se implementan
en el primer incremento. Se mantendrán separados de la credencial autenticada.
La outbox y sus límites no se modifican. Antes de distribuir se requieren además
validación de firma/actualización con el artefacto final, teléfono de pruebas,
permisos, cámara, ubicación y requisitos operativos productivos pendientes.

Referencias primarias:
[Android Keystore](https://developer.android.com/privacy-and-security/keystore),
[KeyGenParameterSpec](https://developer.android.com/reference/android/security/keystore/KeyGenParameterSpec),
[noBackupFilesDir](https://developer.android.com/reference/android/content/Context#getNoBackupFilesDir()),
[configuración Capacitor 7](https://capacitorjs.com/docs/v7/config).

## Incremento 2: recuperación durable del registro OTP

`HMRegistrationState` separa el registro pendiente de la sesión autenticada. En
Android persiste **solo `{id, suministro}`**, cifrado en otro archivo y con otra
clave/AAD (`registration`), fuera de backup. El plugin aplica una lista cerrada de
campos; no acepta correo, contraseña, OTP, JWT, plazos ni estados como autoridad.
Web conserva su estado OTP no secreto en sessionStorage, limitado a la pestaña.

El guardado se confirma antes del POST inicial. Si se pierde la respuesta o muere
el proceso, se lee el mismo UUID y se consulta `/api/auth/verification-status`;
no se repite el POST automáticamente. Antes de esa consulta quedan deshabilitados
verificación/reenvío. SQL decide existencia, vigencia de solicitud, cinco minutos
del código, espera de reenvío, intentos y estado del correo. Si el POST nunca llegó,
se permite reintroducir los mismos datos con el UUID conservado; no se almacenan
credenciales para repetirlo artificialmente. Sin red se mantiene el identificador
para consultar otra vez, sin afirmar que el correo se envió.

Los estados en cola, procesando, aceptado, fallido, cancelado y caducado mantienen
el contrato de la outbox existente. Confirmado/cerrado en backend retira el estado
durable; se conserva el motivo en pantalla hasta que el usuario continúe. «Usar
otros datos» espera la retirada antes de abrir otro formulario. Login/logout también
retiran el estado temporal. La versión del registro descarta respuestas tardías de
solicitudes abandonadas. Un fallo de lectura nativa bloquea nuevos registros hasta
reintentar/retirar el estado, evitando generar otro UUID por un error de disco.

No hay migración SQL, cambio de Transactional Outbox, cuota, OTP, contraseña,
suministro ni creación de cuentas anteriores. Los dos estados tienen operaciones
de borrado independientes, probadas con Android Keystore real.

### Ubicación: diagnóstico previsto antes del tercer incremento

Se revisarán permisos/proveedores y se repetirá el timeout de WebView con una
posición GPS simulada del AVD. Si el proveedor Android entrega posición pero la
API web falla, la solución acotada propuesta es un plugin propio LocationManager,
sin dependencias, con permisos existentes y el mismo límite de ocho segundos.
No se aceptará una caché antigua ni coordenadas inventadas. Se mantendrá el
formulario operativo ante denegación o falta de proveedor. Su implementación solo
se considerará corrección comprobada después de obtener una posición del proveedor
real de Android en el AVD; un teléfono físico seguirá siendo requisito independiente.

## Reanudación del 22 de octubre de 2026

Se conserva `cbb0ad0cc6d6ffbd6b8c5d4522d6a38cab11a544` publicado y todo el diff
OTP pendiente. No se reinició la implementación, hizo pull, cambió de rama ni
ocultaron cambios locales. La revisión remota de `main` encontró Kubernetes y
chatbot (commits `d998920` y `9f9a2c3`, main observado `049ca5f`): solo lectura.
El Draft PR #1 presenta conflictos con main; su resolución/integración queda
pendiente de autorización y coordinación, sin merge ni rebase en este avance.

### Errores de la interrupción y aislamiento de causas

- `otp-checks.log`: cinco timeouts del navegador durante carga/interacción; no
  errores de lógica OTP acreditados por esos timeouts. La configuración de una
  ejecución previa también carecía de `PLAYWRIGHT_BROWSERS_PATH`; se usa ahora
  el Chromium instalado, sin descargar ni cambiar dependencias.
- `native-session-after-otp.log`: llegó hasta JWT vencido; después hubo timeout y
  Android dejó de exponer el servicio Wi-Fi. `emulator.log` registra fallos de
  contexto gráfico/ColorBuffer. La sesión anterior observó unos 11 GB residentes
  del emulador y swap agotada. Esto indica un entorno degradado; no permite
  atribuir por sí solo el timeout a la lógica de sesión/OTP.
- `e2e-otp.log`: dashboard cliente excedió el plazo, sin errores JavaScript; tres
  errores 400 de transporte Socket.IO en el reporte de esa ejecución. No se
  cuentan sus comprobaciones parciales como una regresión completa aprobada.
- Se conservan todos esos logs. La repetición sin AVD y con navegador pesado
  único aprobó **18/18 OTP/transición** y **25 comprobaciones E2E cliente/Admin**,
  con cero errores JavaScript y cero recursos fallidos. No fue necesario aumentar
  plazos ni cambiar código de producción para hacer pasar esos escenarios.

Entorno retomado: Debian 13, Node 20.19.2, Java Temurin 21.0.12.1+1 y Gradle
8.11.1 mediante `scripts/android-gradle.sh` (Java global ausente no significa JDK
inexistente). AVD original independiente, sin borrar datos, reiniciado con
SwiftShader y Vulkan desactivado, 2 GB/dos CPU. Se ejecutan suites pesadas en
serie; no se modifican los servicios Docker existentes. PostgreSQL 18 de fixtures
nuevo `hidro-session17-test-20261022`, solo loopback, volumen propio persistente y
base aleatoria por ejecución. Resend se simula; no se leen variables productivas.

Regresión Node de esta reanudación: **111 pruebas, 110 aprobadas y una omisión
condicional H02**, cero fallos. Incluye correo/OTP/outbox, SQL, concurrencia de
recibos/pagos, sesión, estado OTP, configuración, firma, candidato y documentos.
La omisión es la reproducción histórica condicionada, no una aprobación nativa.
Evidencia nueva bajo `artifacts/android-session-17/resume-20261022/`; los reportes
privados y APK permanecen excluidos de Git.

La primera repetición OTP nativa del día encontró además una **carrera del
harness**, reproducible con equipo desahogado: el tercer evento seguía `pendiente`,
con cero intentos, después de que `ctx.drain()` devolviera un ciclo vacío. El
trabajador usa advisory locks y `SKIP LOCKED`; una consulta concurrente de estado
puede aplazar correctamente la toma del evento. La prueba ahora repite ciclos
acotados hasta comprobar `aceptado`/`fallido` en SQL, como el sondeo real del
trabajador. No se alteraron locks, cuotas, estados ni reintentos productivos.
También se muta el primer carácter de firma JWT en la prueba de token alterado,
evitando ambigüedad de bits de relleno Base64URL del último carácter.

Otro punto del harness OTP pulsaba por JavaScript «Comprobar estado» incluso
cuando el botón estaba deshabilitado por una consulta anterior: el clic se perdía
y la prueba esperaba una pantalla que nunca había solicitado. Se usa ahora el
clic de Playwright con espera de botón habilitado, igual que en Chromium, sin
cambiar los bloqueos de la aplicación. El harness guarda los fallos antes de su
limpieza para conservar diagnóstico aunque una conexión de depuración se bloquee.

Para reducir carga gráfica del AVD se utiliza 540×1170/220 dpi en la reanudación;
conserva el tamaño lógico de 1080×2340/440 dpi. Es configuración exclusiva del
emulador de pruebas, sin cambio de estilos, manifiesto ni artefacto release.

### Resultado OTP nativo retomado

Ejecución final `artifacts/android-session-native-3QivMo/result.json`: **7
comprobaciones aprobadas**, una de ellas instrumentación Keystore real y seis
escenarios OTP, cero errores. Runtime recompilado/sincronizado con API local:
1.1.0/código 3, `pe.edu.hidromejora.app`. Recuperación del UUID tras force-stop,
respuesta de registro perdida, replay concurrente con un evento, estados de cola/
procesamiento/aceptación, código incorrecto/vencido, proveedor fallido, reenvío,
reinicio, confirmación con respuesta perdida, un usuario/suministro y limpieza de
estado tras confirmación/caducidad/abandono. El descarte de respuesta se simula
en fetch de la WebView después del commit; no equivale a una desconexión física
de radio en ese escenario. PostgreSQL, transacciones y WebView sí son reales.

El estado nativo leído solo contiene UUID/suministro; Web Storage no contiene la
solicitud Android. La prueba instrumental comprueba independencia de los dos
archivos/claves al borrar cada estado y conservar el otro. La APK debug local
está excluida de Git; no actualiza una release con certificado distinto.

Regresión nativa posterior al OTP: `artifacts/android-session-native-MjoKvM/result.json`,
**12 comprobaciones aprobadas**, cero errores; incluye el mismo ciclo completo de
sesión del incremento 1 con ambos estados nativos habilitados. Un GET y un socket
por restauración válida, rechazo de tokens alterados/vencidos y cuenta inactiva,
logout persistente, identidad separada, arranque sin internet/reconexión y logcat
sin JWT/contraseña. La muerte del proceso sigue simulada por señal al UID propio,
no por LMKD real. Esquema/API/retención/CLI de correo también se repitieron con
bases nuevas y proveedor simulado, sin modificar servicios o bases históricas.

## Incremento 3: ubicación Android y errores seguros

El diagnóstico retomado reproduce el timeout en WebView Android 15/124 con
contexto seguro, ubicación encendida y permisos fine/coarse concedidos. Se inyectó
la misma posición GPS sintética por `adb emu geo fix`: precisión predeterminada
(`BALANCED`) agotó 8.010 ms; alta precisión activó GPS y recibió posición en 3.965 ms,
con exactitud declarada de 5 m. `dumpsys location` confirma solicitudes y entrega
reales del proveedor; no se sustituyó navigator.geolocation ni se inventaron
coordenadas en JavaScript. El proveedor de red del AVD no tenía posición.

El orden inverso dio alta precisión en 3.596 ms y luego BALANCED en 8 ms con el
proveedor ya preparado. Por tanto, el fallo depende también del arranque/caché y
disponibilidad de proveedores: no se afirma que BALANCED falle siempre ni que
cualquier teléfono obtenga GPS en ocho segundos. Evidencias locales:
`location-diagnostic.json`, `location-diagnostic-reverse.json` y dumps de proveedores
bajo el directorio de reanudación.

La corrección conserva `navigator.geolocation` y solicita alta precisión solo en
Android, `maximumAge: 0` y el **mismo timeout de 8.000 ms**. Petición puntual a demanda,
sin plugin nuevo, dependencias, permisos adicionales o seguimiento en segundo plano.
La propuesta anterior de LocationManager no se implementa: esta evidencia permite
una corrección menor conservando la integración existente. La ubicación aproximada
concedida por el usuario sigue bajo control del sistema; requiere prueba física.

Se reprodujo además un fallo de aplicación mediante Chromium/API/SQL: éxito de
ubicación, segundo intento no disponible, formulario enviado con las coordenadas
anteriores (`-12.0500000` cuando se esperaba NULL). Ahora una petición nueva retira
esa posición; error/denegación/timeout permiten continuar sin coordenadas y muestran
mensajes específicos. Cerrar/enviar/reiniciar el formulario invalida callbacks
pendientes; tampoco hay solicitudes duplicadas mientras se busca ubicación.
La nueva regresión pasó después del cambio: **26 comprobaciones E2E**, cero errores
JS/recursos fallidos, incluida incidencia SQL con latitud/longitud NULL tras fallo.
Los primeros intentos del nuevo harness (incluido un error sintáctico corregido
antes de la reproducción efectiva) se conservan y no se cuentan como aprobados.

La automatización del diálogo de ubicación se ajustó a las dos variantes Android
`permission_deny_button` y `permission_deny_and_dont_ask_again_button`; el primer
intento esperaba solo la primera y falló con la segunda visible. Para una prueba
repetible se restablecen únicamente los flags de permisos de este paquete en el
AVD dedicado antes de solicitar/denegar. No se cambian permisos del manifiesto.
En fallos el harness detiene solo la aplicación de ese AVD para que su reconexión
no mantenga abierto el servidor HTTP temporal; conserva APK, datos y bases.

La regresión PDF nativa detectó una espera insuficiente del nuevo harness: SAF
crea primero un archivo de cero bytes y el plugin escribe después, fuera del hilo
visual. La prueba lo copiaba antes de esa escritura y fallaba; la limpieza detenía
entonces la aplicación. Se corrige esperando tamaño útil, visor PDF activo y
marcador final `%%EOF`, sin modificar el plugin de documentos ni declarar aprobado
un archivo vacío. Los artefactos fallidos permanecen locales para diagnóstico.

SAF numera archivos repetidos con espacios/paréntesis. El harness pasa ahora los
argumentos de `adb shell` con quoting explícito para poder comprobar esos nombres;
la prueba anterior falló al consultar `... (1).pdf`, sin acreditar un fallo del
plugin. No se borran ni reemplazan los PDF previos de los fixtures. Se exige que
el visor de PDF esté en primer plano, además de comprobar el archivo completo.

### Resultado nativo final de ubicación y regresión funcional

`artifacts/android-session-native-VCxUZb/result.json`: **8 comprobaciones aprobadas,
cero errores**, APK debug 1.1.0/3 sincronizada desde las fuentes actuales, API/base
nuevas y Resend simulado. Incluye Keystore, Photo Picker real/PNG persistido,
posición GPS real del proveedor del AVD en formulario/SQL, proveedor apagado tras
éxito con coordenadas NULL, denegación por diálogo Android con formulario operativo,
restauración de sesión tras cambio de permisos, Perfil, Atrás, rotación y un socket.
Recibo/pago confirmados una vez en SQL, cortes y lectura de notificaciones nativos.

PDF de 10.050 bytes guardado con SAF, cabecera/final válidos y una página A4 según
Poppler; el visor Android fue activado. La primera captura era un fotograma previo
a su dibujo, por lo que no se tomó como evidencia visual suficiente. El visor Docs
conservaba una tarea de los intentos interrumpidos: cerrar únicamente ese proceso
y abrir el archivo completo desde Descargas permitió comprobar visualmente el
recibo. Captura local confirmada `resume-20261022/pdf-viewer-reopened.png`.
No se concedieron accesos generales al almacenamiento; una apertura directa por
shell sin grant fue rechazada correctamente y se usó la selección normal de Files.
El harness automatiza archivo/actividad; la inspección visual se hizo separadamente.

La limpieza detiene la aplicación del AVD tanto en éxito como en fallo antes de
cerrar la API temporal, conservando estado cifrado, documentos y bases sintéticas.
La prueba final terminó con código 0; las ejecuciones parciales anteriores quedan
identificadas como fallidas y no se mezclan con estos ocho resultados.

## Compilación firmada final del avance 17

Fuentes de aplicación `5f73bcffe8e89bcab4da5893f08ecd9fc10620a4`. La modificación
posterior es únicamente la espera de arranque en la prueba instrumental de
actualización y esta documentación; no cambia el runtime de la candidata.
Se usaron `scripts/sync-android.cjs` y el wrapper oficial `scripts/android-gradle.sh`
con firma permanente cargada por `android-release-signing.cjs` solo en memoria.
La salida Gradle es nueva y exclusiva: no se retiró la protección del script
release contra sobrescrituras ni se reemplazó la APK local del avance 16.

| Artefacto local, no distribuido | Resultado |
| --- | --- |
| `artifacts/android/builds/avance17-release-qHA9GS/app/outputs/apk/release/app-release.apk` | `pe.edu.hidromejora.app`, 1.1.0 / código 3, 3.402.071 bytes; release no depurable. |
| SHA-256 | `d8632a4ae4a39e3d7a501bd05ed72e63717e32e63269389ba71a9a29d0fd8f71` |
| Certificado SHA-256 | `ea195e488d3746cfc846a3dbe69f188fb242e6eda7f5391d05b3ba203ad0b972`, idéntico a la APK oficial 1.0.0 y a la instrumentación firmada. |

`assembleRelease`, cuatro pruebas Java release y lint aprobados; 16 avisos y cero
errores de lint. Instrumentación compilada y firmada con la identidad existente,
sin cambiar el keystore. `apksigner verify` aprobó APK oficial, candidata y test.
Los checksums de ambas APK anteriores (1.0.0 oficial y 1.1.0 del avance 16) se
comprobaron de nuevo y permanecen intactos. El digest de 1.0.0 coincide con el
asset oficial consultado en GitHub el 22 de octubre.

Auditoría del APK: HTML byte a byte igual a Frontend actual; 20 recursos de texto
revisados, configuración HTTPS productiva y bridge sin logging; sin código Admin,
`.env`, keystore ni patrones de claves privadas/Resend/JWT empaquetados. Es una
inspección acotada de artefacto, no una certificación formal de ausencia de toda
vulnerabilidad. No se contactó el backend productivo para escrituras: esta release
se instala sin conectividad, y las pruebas funcionales usan la debug/API aislada.
Evidencia: `release-result.json`, `release-audit.json`, `apk-assets-audit.json` y
logs privados de la compilación, bajo el directorio de reanudación.

## Actualización firmada final 1.0.0 → 1.1.0

AVD nuevo `hm_110_upgrade17b_api35`, Android 15, `emulator-5584`, 1080×2340/440 dpi,
Wi-Fi/datos apagados y modo avión activado **antes de instalar la aplicación**.
APK oficial con digest confirmado → instrumentación firmada/seed → `install -r`
de la candidata final → instrumentación/verify → prueba Keystore release.
**Tres ejecuciones instrumentales aprobadas y proceso de validación con código 0**.

- Oficial 1.0.0 / código 2 y candidata 1.1.0 / código 3: mismo paquete y certificado.
- UID `10209` antes/después; primera instalación `2026-10-22 11:14:23` conservada.
- Preferencia real del tutorial y marcador sintético de localStorage conservados;
  WebView nativa, origen `https://localhost`, plugin de documentos y login correctos.
- Keystore en release: clave no exportable, GCM/ciphertext alterado rechazado,
  borrado confirmado y estados sesión/registro independientes. Ningún JWT real
  o cuenta productiva se introdujo en este AVD.
- No se desinstaló entre ambas instalaciones ni se eliminó información/volúmenes.

La prueba instrumental espera ahora que el formulario termine el arranque
asíncrono, además de DOM listo. El primer driver local interpretó `pm path` con
código 1 (paquete ausente) como error; después buscó un campo `userId` que no
aparecía en ese dumpsys. Se corrigió usando `pm list packages -U` y se repitió
completa en **otro AVD nuevo**, conservando el anterior, sin downgrade o desinstalar.
Los intentos parciales no se cuentan como actualización completamente verificada.
Evidencia final: `upgrade-result.json`, `upgrade-seed.txt`, `upgrade-verify.txt`,
`release-secure-state.txt` y dumps de paquete anteriores/posteriores en reanudación.

Esto acredita actualización e integridad local en AVD, no login contra producción.
Después de actualizar desde 1.0.0 será necesario iniciar sesión una vez: esa APK
no tenía credencial durable cifrada que migrar. No se guarda una contraseña ni se
confía en la copia antigua de Web Storage para evitar ese primer login. Las cuentas
históricas con contraseña/suministro existentes siguen admitidas en la API aislada.

## Cierre y requisitos pendientes

| Verificación realmente ejecutada | Resultado final |
| --- | --- |
| Sesión Android WebView/Keystore | 12 comprobaciones aprobadas. |
| OTP Android WebView/SQL/outbox simulada | 7 comprobaciones aprobadas. |
| Ubicación y regresión funcional Android | 8 comprobaciones aprobadas; inspección PDF adicional confirmada. |
| Actualización release y Keystore release | Tres ejecuciones instrumentales aprobadas, sin desinstalar. |
| Node backend/SQL/configuración/seguridad/documentos | 110 aprobadas, una omisión condicional H02; cero fallos. |
| OTP/transición Chromium y estado durable unitario | 18 aprobadas. |
| E2E Chromium cliente/Admin después de ubicación | 26 comprobaciones, cero errores JS/recursos fallidos. |
| Comprobación final focalizada Node | 31 aprobadas. |
| Java release y lint | Cuatro aprobadas; cero errores lint, 16 avisos. |

No se suman estas filas como casos únicos: algunas comprobaciones se repiten entre
suites. Chromium y los descartes de respuestas simulados no se presentan como
pruebas físicas de radio ni como renderizado Android. Todas las últimas ejecuciones
citadas aprobaron; las anteriores fallidas se conservaron y sus causas/correcciones
están descritas, sin ocultarlas o convertirlas en aprobaciones.

Antes de distribuir: teléfono Android de pruebas, GPS en condiciones reales,
ubicación aproximada/denegación permanente, cámara/visores, otros Android/WebView,
accesibilidad y muerte real por LMKD. Completar coordinación del backend con
`/api/auth/session`, migraciones/outbox, remitente/trabajador/monitoreo y canario
previamente autorizados. La revocación central/refresh tokens siguen sin existir;
no se extendió el JWT de ocho horas. Los conflictos del Draft PR con main requieren
coordinación/autorización posterior; no se fusionó Kubernetes ni chatbot.

No se hizo despliegue, migración productiva, correo real, Release, distribución de
APK o cambio de keystore. `feature/verificacion-correo` mantiene las dos guardas
Vercel desactivadas. Los nuevos commits se verifican en GitHub; no hay despliegues
GitHub/Vercel asociados. No se seleccionó ni cambió configuración Render.

Para repetir, utilizar exclusivamente PostgreSQL de fixtures nuevo (puerto
loopback) y el AVD `hm_110_debug_api35` en `emulator-5582`; los harness nativos
rechazan dispositivos/AVD distintos y generan recursos nuevos antes de compilar.
Playwright debe estar en la ruta local del avance 16 o `HIDRO_PLAYWRIGHT_MODULE`.
Ejecutar suites pesadas en serie y detener el AVD antes del E2E Chromium.

```bash
export HIDRO_EMAIL_TEST_DB_PORT=32768 # Solo contenedor/base de fixtures aislados.
export PLAYWRIGHT_BROWSERS_PATH=artifacts/vercel-validation/browsers
npm run test:android:session
npm run test:android:otp
npm run test:android:native
npm run test:android:otp:native
npm run test:android:location:native
```

La candidata firmada permanece en la salida local indicada; no reutilizar assets
debug de otro backend para compilar release. Los AVD, bases, PDF y reportes
sintéticos quedan conservados localmente; no se versionan.
