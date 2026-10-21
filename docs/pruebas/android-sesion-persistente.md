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
