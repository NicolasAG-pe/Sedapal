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
