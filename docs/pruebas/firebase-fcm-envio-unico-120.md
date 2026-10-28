# Única prueba FCM real autorizada — Android 15

Prueba realizada el 27 de octubre de 2026 (America/Lima), con autorización explícita
del propietario para **un solo envío**, exclusivamente en el emulador del laboratorio.
Código ejecutado: PR #19, commit `b74a6795e9a3d1c5db135587106a9d9ab3dd0ac6`.
No hubo cambios del código de la aplicación ni recompilación durante la prueba.

## Resultado

| Comprobación | Resultado observado |
| --- | --- |
| Intentos HTTP v1 | Exactamente 1; bloqueo persistente escrito antes de la solicitud |
| Aceptación de Firebase | HTTP 200 y respuesta de aceptación reconocida por el adaptador original |
| Recepción Android real | Una notificación en NotificationManager con el tag del evento y texto exacto |
| Bandeja Android | Notificación visible, capturada antes del toque |
| Apertura | Toque nativo en la notificación real abre Incidencias y carga la tarjeta del evento |
| REST tras el toque | GET autenticado del evento: 200, sección `incidencias` |
| Historial del propietario | GET de la ruta correcta: 200; seguimiento visible en la WebView |
| Otra cuenta válida | Sesión 200, evento 404 e historial ajeno 404 |
| Sin sesión | Historial: 401 |
| Cierre | Entrega/worker/recordatorios desactivados, cero dispositivos activos, cero entregas pendientes y token OAuth retirado |

Mensaje enviado, sin campos personales ni URLs:

- Título: **Hidro-Mejora**
- Mensaje: **Tu incidencia tiene una actualización.**
- Único dato de aplicación: UUID opaca del evento, no publicada en este informe.

La aceptación HTTP y la recepción se verificaron por separado. No se inyectaron
callbacks, intents con extras push ni notificaciones locales para aparentar una
recepción. El toque se hizo sobre la bandeja real del sistema, no mediante un
evento JavaScript simulado.

## Condiciones y controles

Backend Node local enlazado a `127.0.0.1:45679`; PostgreSQL exclusivo en un contenedor
nuevo y una base sintética nueva para esta ejecución. No se reutilizó una cola
anterior ni se accedió a datos productivos. Se verificó antes del envío: un único
dispositivo activo del usuario de laboratorio, cero entregas anteriores, una sola
entrega nueva pendiente y cero intentos previos. El aviso procede de una única
actualización administrativa de una incidencia sintética mediante las rutas existentes.

AVD exclusivo `hm_fcm_pilot_api35`, Android 15/API35, con la APK debug cuyo hash
coincide con la candidata del PR #19. Aplicación en HOME/segundo plano, sin
force-stop durante la recepción. No se conectó ni instaló nada en un teléfono físico.

Se utilizó la cuenta dedicada `hm-fcm-pilot-120` y su rol de un solo permiso
`cloudmessaging.messages.create`. IAM Credentials emitió un OAuth de **900 segundos**,
scope exclusivo `firebase.messaging`, sin generar claves privadas permanentes.
La credencial estuvo en un archivo externo privado 600; no se imprimió y se retiró
al terminar. No se habilitaron más APIs ni se cambiaron roles durante este envío.

El adaptador HTTP v1 y el worker son los del PR #19. Solo se invocó
`processOne()` una vez, sin bucle, cron ni reintento. Un archivo persistente exclusivo
se creó y sincronizó a disco antes de permitir la solicitud a Firebase. La cola
final conserva una sola entrega `aceptado`, `intentos=1`. Una comprobación posterior
de autorización realizó **cero llamadas FCM**.

## Corrección del verificador, sin reenvío

Después de comprobar recepción, toque, sección Incidencias y REST autorizado, una
consulta auxiliar del harness usó por error `/api/incidencias/:id/seguimiento`.
Esa ruta no existe; faltaba `/me`. La primera ejecución quedó registrada como
fallida en esa comprobación auxiliar y su evidencia original se conserva.

Se corrigió la verificación usando `/api/me/incidencias/:id/seguimiento` sobre la
misma base y el mismo evento ya enviado. Se volvió a iniciar solo el backend local,
con entrega y worker desactivados, y se autenticaron sesiones nuevas de laboratorio.
El propietario recibió 200, la otra cuenta autenticada 404 y la petición anónima 401;
la WebView mostró el historial con «Estado actual: En revisión». El evento autorizado
devolvió 200 y el ajeno 404. No se reenviaron mensajes ni se reactivó un dispositivo.

La apertura desde el toque real está documentada en la captura original anterior a
ese error auxiliar y en las aserciones del flujo que se completaron antes del fallo.
La captura posterior del historial corresponde a la comprobación complementaria,
no se presenta como una segunda entrega remota. No fue necesario modificar el APK
ni el backend del producto para resolver el error del verificador.

## Evidencias privadas y cierre

Directorio local ignorado `artifacts/fcm-real-single/`, con acceso restringido:

- `final-result.json`: resultado final consolidado y controles de cierre.
- `result.json` y `run.log`: ejecución original, incluida la comprobación auxiliar fallida.
- `authorization-correction.json` y su log: consulta corregida, estados HTTP y cero llamadas FCM adicionales.
- `01-notification-drawer.png`: aviso remoto visible en la bandeja real.
- `02-opened-incidencias.png`: pantalla abierta por el toque real.
- `03-authorized-history.png`: seguimiento en la consulta complementaria autorizada.
- `send-once.lock`: intento consumido; no borrar para repetir la prueba.
- `evidence-sha256.json`: integridad de los archivos privados.

Se limpiaron la sesión y la asociación del dispositivo, se retiró el ciphertext
del token de PostgreSQL y se solicitó unregister del SDK. Backend y recursos
locales propios detenidos conservando datos. APK oficiales 1.1.1 y 1.1.2 mantienen
sus hashes previos. No se publican capturas, credenciales, tokens, App ID, Sender ID
ni identificadores completos del mensaje o dispositivo.

Sin merges, nuevas versiones oficiales, migraciones productivas, facturación ni
despliegues/cambios en Render, Vercel, Neon o Kubernetes. Las operaciones remotas
se limitaron al registro FCM del emulador autorizado, la obtención de su credencial
temporal de envío y el único mensaje autorizado al dispositivo de laboratorio.

Este resultado solo acredita el escenario Android 15 en segundo plano probado.
Android 13/14, teléfono físico, Doze, proceso cerrado y otros envíos quedan fuera
de esta prueba. **Cualquier mensaje adicional requiere una nueva autorización.**
