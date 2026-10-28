# Piloto FCM 1.2.0 — operación local

Preparación dependiente del PR #18. Reutiliza el plugin Capacitor 7, consentimiento
en Cuenta, almacenamiento Keystore, API de dispositivos, cola y adaptador HTTP v1
del PR #17. El JSON Android y las credenciales no forman parte de Git.

El primer envío único ya fue autorizado y comprobado en el AVD Android 15; véase
[`pruebas/firebase-fcm-envio-unico-120.md`](pruebas/firebase-fcm-envio-unico-120.md).
El procedimiento siguiente no autoriza repetirlo: cualquier mensaje nuevo requiere
una autorización nueva del propietario.

## Compilación y configuración privada

Mantener una copia de `google-services.json` fuera del repositorio, archivo 600 y
directorio 700. El archivo autorizado se conserva privadamente en
`~/.config/hidromejora/firebase-fcm-pilot/`; no mostrar sus valores ni adjuntarlo.

En un worktree independiente, con Node 22, Java 21, dependencias y SDK disponibles:

```sh
node scripts/build-android-fcm-lab.cjs --help
node scripts/build-android-fcm-lab.cjs \
  --config /ruta/privada/google-services.json --api http://10.0.2.2:45679
```

El comando valida proyecto, paquete, número de proyecto/app y archivo privado;
rechaza APIs externas y no reemplaza configuración existente. Copia el JSON solo
durante la compilación del worktree y lo retira en `finally`. Activa
`HM_PUSH_ANDROID_ENABLED=1` únicamente en los procesos hijos. Genera APK debug,
APK de instrumentación, JUnit y lint en un directorio nuevo privado de `artifacts`.
No instala, publica ni envía mensajes. La compilación offline requiere el caché
Gradle ya preparado. Una compilación normal sigue cerrada sin JSON/flag.

El paquete conserva su identidad registrada, sin sufijos inventados ni otra app
Firebase. Por ello la APK de laboratorio solo se instala en un AVD exclusivo;
no usar `adb install -r` sobre teléfonos con la aplicación oficial.

## Identidad temporal de servidor

Cuenta dedicada `hm-fcm-pilot-120`, separada de la cuenta administrativa automática.
Rol personalizado `hmFcmPilotSender` con **solo** `cloudmessaging.messages.create`
en el proyecto autorizado. Rol `hmFcmPilotTokenMinter` con **solo**
`iam.serviceAccounts.getAccessToken`, concedido al operador actual **solo sobre esa
cuenta**, con condición temporal hasta `2026-11-03T03:39:32.179Z` (siete días desde
su preparación). Ambos permisos admiten roles
personalizados; verificados en IAM. No se conceden Owner, Editor ni Token Creator
a la cuenta de envío.

Se habilitaron `iam.googleapis.com` (IAM) e `iamcredentials.googleapis.com`
(IAM Credentials) para esta identidad. `fcm.googleapis.com` ya estaba habilitada y
no se cambió. La facturación permanece
desactivada; no se creó cómputo, hosting ni otros servicios facturables. No hay claves
USER_MANAGED y no se acuñó ningún token OAuth del remitente durante la preparación.

Después de autorizar el primer envío, obtener un OAuth token de 15 minutos mediante
`generateAccessToken` de la cuenta dedicada y scope exclusivo
`https://www.googleapis.com/auth/firebase.messaging`. La sesión del operador se usa
para obtenerlo; nunca se entrega esa credencial administrativa al worker. Guardar
el resultado en un archivo externo 600, directorio 700, sin imprimirlo:

```json
{
  "type": "fcm_temporary_access_token",
  "project_id": "<PROYECTO_AUTORIZADO>",
  "client_email": "<CUENTA_DEDICADA>",
  "scope": "https://www.googleapis.com/auth/firebase.messaging",
  "expire_time": "<CADUCIDAD_RFC3339>",
  "access_token": "<TOKEN_TEMPORAL_PRIVADO>"
}
```

Configurar en el proceso autorizado `PUSH_AUTH_MODE=access_token_file`,
`PUSH_ACCESS_TOKEN_FILE`, `PUSH_FIREBASE_PROJECT_ID` y
`PUSH_SENDER_SERVICE_ACCOUNT`; dejar `PUSH_SERVICE_ACCOUNT_FILE` vacío. El adaptador
valida archivo externo/propietario/permisos, identidad, scope declarado y caducidad
de hasta una hora, con al menos un minuto restante. Lo relee antes de cada envío,
sin caché permanente. La identidad/scope declarados en el archivo no son una prueba
criptográfica: el operador debe obtener el token de la cuenta y scope verificados
en IAM. No pegar un token personal o administrativo en ese archivo.

Fuentes: [FCM HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api),
[generateAccessToken](https://docs.cloud.google.com/iam/docs/reference/credentials/rest/v1/projects.serviceAccounts/generateAccessToken),
[roles personalizados](https://docs.cloud.google.com/iam/docs/creating-custom-roles).

## Pruebas sin entrega real

Mantener `PUSH_REAL_DELIVERY_ALLOWED=0`, `PUSH_WORKER_ENABLED=0` y
`PUSH_REMINDERS_ENABLED=0`. El backend usa proveedor mock para permitir el alta y
validar dispositivos mientras el SDK Android obtiene su registro real de Firebase.
Esto prueba registro; no aceptación/recepción de mensajes remotos.

Crear un PostgreSQL nuevo y exclusivo con fixtures sintéticos. Cada suite crea
bases nuevas, conserva las anteriores y no lee `.env` productivos. Reutilizar las
pruebas push/esquema e incidencias del repositorio. No aplicar SQL en Neon.

```sh
node --test Backend/test/push-credentials.cjs scripts/test/firebase-lab.cjs
# Puerto del contenedor nuevo y rutas locales de herramientas, nunca productivos:
HIDRO_EMAIL_TEST_DB_PORT=<PUERTO_LOCAL> node --test \
  Backend/test/push.cjs Backend/test/push-schema.cjs Backend/test/incident-tracking.cjs
```

El harness `scripts/test/android-session-native.cjs --fcm-registration` reutiliza la
APK ya compilada indicada por `HIDRO_FCM_LAB_BUILD` (directorio `app` dentro de un
`artifacts/fcm-build-*`). Requiere un AVD nuevo `hm_fcm_pilot_api33`, `api34` o
`api35`, serial explícito `HIDRO_NATIVE_SERIAL`, API local fija 45679 y el puerto
PostgreSQL de laboratorio. Rechaza teléfonos físicos y APK de otra ubicación,
comprueba el hash de la compilación e impone los tres flags de entrega en cero.
Verifica permiso denegado/concedido por el diálogo Android real, registro del SDK,
cifrado, ausencia de tokens en logcat, reapertura, revocación y cambio de cuenta.

## Puerta de autorización del primer mensaje

No ejecutar ahora. El propietario debe aprobar explícitamente el dispositivo,
backend, mensaje y obtención/uso del token temporal antes de `messages:send`.

Propuesta concreta: AVD exclusivo Android 15 del piloto, backend Node 22 del worktree
en loopback 45679 y PostgreSQL exclusivo con una base sintética nueva. Usar la APK
debug comprobada; iniciar sesión de laboratorio y activar avisos voluntariamente.
Dejar la app en HOME, sin force-stop.

Antes de enviar, comprobar que solo existe un dispositivo activo del usuario
sintético, ninguna entrega histórica pendiente/reintento/procesando/ambigua y
ningún worker continuo. Crear una incidencia sintética y una única actualización
administrativa mediante los endpoints existentes. Comprobar exactamente una nueva
entrega pendiente del evento/dispositivo elegido. Si no se cumple, detenerse.

Mensaje existente del adaptador: título **Hidro-Mejora**, texto **Tu incidencia tiene
una actualización.** Solo `hm_event` UUID opaca como dato; sin datos personales,
suministro, URL, foto ni contenido del historial. No cambiar el payload de producción
para el piloto.

Con la autorización recibida, habilitar entrega/worker únicamente en el proceso
manual y ejecutar el worker existente **una vez** (`--once`). Nunca `--run` ni
`--reminders`. Registrar aceptación HTTP v1, luego recepción visible en bandeja y
apertura por toque con reconsulta REST autorizada. Aceptación HTTP no demuestra
recepción. Probar el mismo evento con otra cuenta/sesión cerrada: no debe acceder a
datos ajenos. Si el resultado es ambiguo/transitorio, **no repetir automáticamente**;
un segundo intento requiere una nueva decisión del propietario.

Después retirar/revocar el dispositivo, volver los flags a cero, cerrar el backend
y detener solo los recursos locales creados por este piloto, conservando sus datos.
Las pruebas de más versiones, Doze y teléfono físico se reportan separadamente.
