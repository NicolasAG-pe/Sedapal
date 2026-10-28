# Recuperación de contraseña — laboratorio 1.2.0

Base visual: `4a198b7e189d2a7081596f0bb6b96d16073856db`. Rama `feature/recuperacion-clave-120`, PR dependiente de la rama visual. No publicar 1.2.0 ni activar recuperación productiva.

## Contrato y límites

- `GET /api/auth/password-recovery/capabilities`: disponibilidad pública, sin información de cuentas.
- `POST .../request`: correo y UUID `solicitud_id` del cliente. Siempre 202 y el mismo mensaje para cuenta habilitada/verificada, desconocida, no verificada, deshabilitada o Admin sin segundo factor. Reintentar una respuesta perdida con la misma UUID. La API no consulta usuarios durante esta petición: el worker resuelve elegibilidad después.
- `POST .../verify`: UUID, código de correo de ocho dígitos y, cuando exista, autenticador/código de recuperación 2FA. Devuelve un permiso aleatorio de 256 bits; nunca un JWT.
- `POST .../complete`: UUID, permiso, `password_nueva`, `password_confirmacion`. Reutiliza scrypt del backend. Vuelve al login normal, manteniendo 2FA; no crea una sesión.
- Código CSPRNG, HMAC con propósito/UUID, cinco intentos, cinco minutos desde su vinculación para envío, cola inicial como máximo 15 minutos. Permiso HMAC, un solo uso, dos minutos como máximo y nunca posterior a la caducidad del código.
- Tres solicitudes por identidad/hora, enfriamiento de 60 segundos; almacenamiento HMAC del correo. IP: 10 solicitudes/15 minutos, 30 verificaciones/15 minutos y 10 cambios/15 minutos. El límite por cuenta devuelve la respuesta genérica, no un indicador de existencia. La respuesta HTTP no afirma entrega del correo.
- `Cache-Control: no-store`; ningún secreto en URL. El permiso no accede a perfiles, recibos, Socket.IO o Admin. Contraseñas, códigos y permiso solo en memoria de la interfaz; limpiar campos al abandonar/completar. No Web Storage ni Preferences para recuperación.

El diseño sigue [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html). Se evita la consulta de existencia en la petición pública, sin prometer tiempos de red perfectamente idénticos ni eliminar por completo los canales laterales operativos de infraestructura.

## Base y revocación

Migración aditiva **011_recuperacion_clave.sql**, tras 007 (en el laboratorio se parte de init.sql actualizado con 007–010). Aplicación explícita, transaccional e idempotente. No se modifica init.sql ni se ejecuta ninguna migración en el arranque de la API.

Tablas separadas: `recuperaciones_clave`, `recuperacion_clave_limites`, `recuperacion_clave_outbox`. Ninguna reutiliza registros ni UUID de alta OTP. No modifica las filas históricas al instalarse. Añade fecha de cambio de versión de seguridad a `usuario_2fa` y triggers de credenciales.

Todo cambio de hash de contraseña o correo incrementa `usuario_2fa.version`, incluso si la cuenta nunca activó 2FA; invalida desafíos 2FA y solicitudes/permisos de recuperación anteriores. Cambiar correo elimina su verificación previa. Un trabajo aún sin usuario vinculado no revive después de cambiar contraseña, correo, rol, estado o 2FA: se comprueba también su fecha respecto del cambio de seguridad.

Los guards actuales comprueban la versión de seguridad en PostgreSQL en cada petición y handshake Socket.IO; JWT antiguos sin versión se consideran versión cero. La duración sigue siendo ocho horas. Tras COMMIT se emite `sesion:invalidada` y se desconectan las salas de usuario y de revocación. Un cambio de contraseña autenticado toma locks y vuelve a comprobar la versión: una petición vieja no puede sobrescribir un reset concurrente. El rollback de una transacción no revoca sesiones ni altera credenciales.

## Correo y configuración cerrada

`PASSWORD_RECOVERY_ENABLED=0` y `PASSWORD_RECOVERY_WORKER_ENABLED=0` por defecto. No se modificó el supervisor de producción. Worker separado: `Backend/workers/password-recovery.cjs`, con `--once` o `--run`. Requiere destino privado `PASSWORD_RECOVERY_DATABASE_URL` y nombre exacto `PASSWORD_RECOVERY_EXPECTED_DATABASE`; TLS externo verificado mediante la configuración existente.

Variables privadas adicionales: `PASSWORD_RECOVERY_SECRET` (al menos 32 bytes), `PASSWORD_RECOVERY_OUTBOX_KEY` (32 bytes base64 canónico), opcional `PASSWORD_RECOVERY_ALLOWED_EMAIL`. Claves independientes de AUTH, OTP, TOTP y outbox de registro, también si se codifican de otra manera. No cambiar las claves existentes. Ver nombres, sin valores, en Backend/.env.example.

Reutiliza los adaptadores Gmail/Resend existentes y sus validaciones, límites y credenciales privadas; la API no carga tokens OAuth. Envelope AES-256-GCM con IV nuevo y AAD exclusivo de recuperación/solicitud/trabajo; una modificación, cambio de contexto o clave rechaza el descifrado. Estados de entrega no se exponen públicamente. Payload borrado al aceptar/cancelar/caducar/fallar. Un aviso sin códigos se encola después del cambio correcto. Los metadatos HMAC/fechas permanecen para límites y auditoría; definir retención autorizada antes de producción.

Resend reintenta el mismo trabajo y cuerpo con la misma clave idempotente. Gmail sin idempotencia: resultado ambiguo o lease abandonado termina en `ambiguo`, sin reenvío automático. Un fallo inequívoco transitorio permite hasta tres intentos. No se mantiene una transacción SQL abierta durante el envío. Una revocación posterior a la comprobación final puede coincidir con un envío ya en vuelo; el código queda inutilizado de todos modos por la versión/estado, sin garantizar retirar un correo aceptado por el proveedor.

## Identidad, Admin y pérdida de factores

Cuenta sin verificación histórica no accede al reset automático: primero requiere un procedimiento independiente de verificación de identidad. Nunca marcarla verificada por conocer suministro o correo.

Usuario con 2FA y todo Admin con 2FA: demostrar correo y factor existente. Puede consumirse un código de recuperación 2FA de un uso; no se confunde con el código de correo. La recuperación no desactiva 2FA, no regenera sus códigos y no altera sus secretos.

Admin sin 2FA o persona sin autenticador ni códigos: **no hay bypass ni endpoint de emergencia**. Revisión independiente: solicitud por canal previamente conocido, evidencia de identidad adecuada y titularidad contrastada con registros autorizados, doble revisión administrativa, registro de motivo/evidencias sin secretos, comunicación al titular por canal verificado y ventana de espera ante discrepancias. Correo, número de suministro, fotos públicas o datos del recibo solos no bastan. Cualquier intervención sobre cuenta/factor requiere autorización separada, trazabilidad y revocación; este avance no la automatiza.

## Pruebas y evidencia

Primer incremento backend: 15/15 casos de recuperación; 2/2 preservación/idempotencia de 011 y aislamiento de claves/worker cerrado. Regresión ampliada: 97 aprobadas, ninguna fallida, una variante histórica omitida por configuración y ejecutada aparte. Node 22.23.4, PostgreSQL 18 nuevo en `hm-recuperacion-120-pg` (puerto local 32842), proveedor simulado; no se leen credenciales productivas.

Logs privados ignorados: `artifacts/recuperacion-clave-120/`. Pantallas Chromium: `web/`, cinco resoluciones 360×800, 390×844, 768×1024, 1366×768 y 1920×1080. Se verifican cliente y Admin con 2FA, respuesta HTTP perdida, idempotencia, código erróneo/correcto, contraseña y regreso al login sin auto-sesión. Primera ejecución falló por una consulta SQL inválida del fixture; la segunda por contar solo payloads pendientes en lugar de solicitudes. Corregidas ambas aserciones, sin relajar controles.

### Incremento de interfaz y validación final

Cliente y Admin comparten `Shared/password-recovery-ui.js`: pasos de correo, código/factor y contraseña/confirmación, etiquetas accesibles, foco, error visible, bloqueo de botones y cancelación. El resultado positivo utiliza el color verde de la identidad existente y `role=status`; los errores conservan `role=alert`. No se cambió la plantilla PDF, la lógica de pagos ni la identidad acuática. `build-web.js` incluye explícitamente este módulo público en Android, manteniendo fuera el código administrativo.

La recuperación espera una restauración nativa pendiente antes de mostrar su formulario y se elimina una exposición intermedia innecesaria del login. El harness espera las animaciones finitas de entrada antes del primer toque: la traza comprobó que los toques de las primeras ejecuciones no llegaban al DOM durante la composición inicial del AVD. No se ocultó ese fallo con un clic JavaScript. Un fallo posterior `adb ENOBUFS` correspondía al búfer de logcat (1 MB), ampliado a 32 MB; el flujo ya había cambiado la contraseña correctamente. Quedan los logs de intentos fallidos para reproducir el diagnóstico.

| Grupo | Resultado real |
| --- | --- |
| Recuperación backend, PostgreSQL 18 | 15/15; código inválido/vencido/reutilizado, concesión, carreras, UUID/reenvíos, activo/verificado, roles, MFA, JWT legacy, sockets, cambio de correo/contraseña y worker Gmail/Resend simulado. |
| Migración y configuración de claves/worker | 2/2: 011 dos veces preserva usuarios, suministros, recibos, pagos, bytes de fotografía y secuencias; rollback sin efectos; claves en codificaciones equivalentes rechazadas. |
| Regresión backend/PDF/HidroBot/sesiones | 97 aprobadas, 0 fallidas, 1 variante histórica omitida por la configuración normal. Ejecución adicional legacy: 12 aprobadas y 1 variante inversa omitida; ambas alternativas de esquema cubiertas entre ejecuciones. |
| Chromium, transición Android y estado seguro | 32/32. Incluye recuperación cliente/Admin con segundo factor, pérdida de respuesta y sin almacenamiento web del permiso; diez pantallas de correo en cinco resoluciones, capturas de contraseña/resultado. |
| Revisión final UI y transición, tras mensaje de éxito | 19/19; cliente/Admin regresan al login y el resultado de recuperación se presenta como éxito. |
| Configuración/build runtime | 11/11. Se actualizó la expectativa exacta del archivo público añadido; no se amplió la lista de secretos/archivos administrativos permitidos. |
| Pagos realtime E2E | 1/1, cinco comprobaciones de pantallas cliente/Admin, carreras REST, reconexión, contadores y recibo pendiente. Socket.IO real, base nueva y datos sintéticos. |
| Android Keystore instrumentado | 1/1: no exportación, GCM/IV nuevo, alteración rechazada y borrado. |
| Android WebView nativa | 6 comprobaciones de recuperación más Keystore: login cifrado inicial; reset remoto desconecta y retira la credencial; force-stop no la restaura; código incorrecto/correcto y reset desde UI sin login automático; contraseña anterior rechazada y nueva sesión restaurada; logout/reapertura y logcat sin los JWT/contraseñas del flujo. |
| Gradle Java 21 | assembleDebug, assembleDebugAndroidTest, testDebugUnitTest y lintDebug exitosos. 4 pruebas JUnit (3 DocumentPayload, 1 existente de ejemplo); lint sin errores, 16 advertencias de recursos, iconos y manifest (consultables en XML). Advertencia de SDK XML v3/v4 de herramientas, sin error de compilación. |

No sumar estas cifras como pruebas únicas: algunas suites incluyen los mismos casos. No quedan pruebas críticas fallidas en la ejecución final; intentos previos se conservan por transparencia. Admin se comprobó en Chromium; Android corresponde al cliente compartido, no a una APK de administración.

Evidencia local ignorada: `artifacts/recuperacion-clave-120/web/` (cliente/Admin), `web-regression.log`, `ui-final.log`, `regression.log`, `schema.log`, `legacy-receipt.log`, `config-final.log`, `payments-e2e.log` y logs nativos. Última ejecución Android aprobada: `artifacts/android-session-native-S1ij7L/`; log `artifacts/recuperacion-clave-120/native-delivery.log`. Contiene pantallas capturadas con adb, build.log, instrumentation.txt, XML de JUnit/lint y result.json. Ninguna evidencia privada se sube a Git.

APK oficiales 1.1.1 y 1.1.2 sin cambios, confirmadas por SHA-256. Solo debug local para el AVD dedicado; no release ni publicación. Faltan teléfono físico, entrega de correo real/renovación OAuth en servidor, prueba multiinstancia y tecnología asistiva; no se declaran aprobadas.

## Comandos reproducibles sin credenciales reales

Crear un PostgreSQL 18 **nuevo**, con usuario/base ficticios del helper `Backend/test/email-schema.cjs`, publicado solo en loopback. No reutilizar volúmenes ni bases existentes. El fixture crea bases nuevas y no las borra. Ejemplo enteramente sintético:

```sh
lab_name="hm-reset-lab-$(date +%s)"
docker run -d --name "$lab_name" --label hidro.task=recuperacion-clave-120 \
  -e POSTGRES_USER=hm_fixture -e POSTGRES_PASSWORD=fixture-only-not-production \
  -e POSTGRES_DB=hm_email_test -p 127.0.0.1::5432 postgres:18
export HIDRO_EMAIL_TEST_DB_PORT="$(docker port "$lab_name" 5432/tcp | awk -F: '{print $NF}')"
docker exec "$lab_name" pg_isready -U hm_fixture -d hm_email_test
```

Esperar readiness antes de ejecutar; parar al terminar con `docker stop "$lab_name"` sin borrar sus datos. Usar Node 22 instalado localmente:

```sh
export PLAYWRIGHT_BROWSERS_PATH="$PWD/artifacts/vercel-validation/browsers"
artifacts/pagos-pdf-120/tools/node --test Backend/test/password-recovery.cjs Backend/test/password-recovery-schema.cjs
artifacts/pagos-pdf-120/tools/node --test scripts/test/password-recovery-flow.cjs
artifacts/pagos-pdf-120/tools/node scripts/test/android-session-native.cjs --password-recovery
```

Último comando solo opera `hm_110_debug_api35`/emulator-5582 y genera un debug local aislado. No instalar en teléfono ni sobrescribir APK oficiales. Revisar `--help` del worker antes de una ejecución futura con configuración privada; no arrancarlo con variables de producción durante pruebas.

## Bloqueos antes de activar fuera del laboratorio

- Autorización independiente, respaldo/restauración, diagnóstico y aplicación de 011 tras dependencias; nunca ejecución automática sobre Neon.
- Configuración privada, revisión del worker, límites reales de correo, retención y pruebas controladas de entrega; aquí no se envió ningún mensaje real.
- Bloquear despliegue/rollback a un backend antiguo que ignore `mfa_version`: el esquema solo no puede obligar a un binario antiguo a comprobar JWT. No usar ese rollback automático.
- Revocación distribuida de sockets si se aumenta a múltiples instancias: el emisor probado es de una sola API; antes de escalar requiere un adaptador compartido y pruebas interinstancia.
- Validación física Android y accesibilidad con tecnología asistiva. Las capturas Chromium no constituyen evidencia nativa.

## Publicación de desarrollo y conservación

Draft PR #16: https://github.com/NicolasAG-pe/Sedapal/pull/16, base `feature/identidad-acuatica-pdf-120`. Primer incremento backend `69403f45ea7338f28c90c419c70dc4c3b924e94a`, publicado y SHA remoto confirmado. El segundo incremento incorpora interfaz, harness y evidencia documental. Ambos archivos vercel.json excluyen esta rama, conservando las exclusiones anteriores. GitHub sin workflows/hooks activos; Render en main con autodespliegue y previews apagados, consultado solo en lectura. Verificación Vercel posterior al push sin despliegues para la rama.

APKs preservadas: 1.1.1 SHA-256 `541b4c9d70a52396266358d786032db47c85e99aa2ae4d7ae1bcf5eb28c3bb4b`; 1.1.2 `a6b81541a210e79ffb6ec8a38c79b8b1260758ab45c246b81fca45ee4439ed93`. Sin cambios Java/Keystore, firmas, plantillas PDF ni migraciones productivas. La base de laboratorio se conserva al detener su contenedor; no eliminar datos para repetir pruebas.
