# FCM oficial 1.2.0 — validación física y publicación

## Resultado comprobado el 29 de octubre de 2026

Firebase HTTP v1 aceptó **una única notificación** enviada desde el worker de Hidro-Mejora en Render Free: HTTP200, resultado `aceptado`, un intento registrado y ninguna otra entrega pendiente. No hubo reintentos ni envíos desde el equipo local.

El **POCO M4 Pro físico, Android13/API33**, recibió la notificación con la aplicación en segundo plano. Android registró exactamente una entrada del paquete oficial, con el evento esperado, canal `hm_updates`, título `Hidro-Mejora` y texto `Tu incidencia tiene una actualización.`. La bandeja estaba vacía para esta aplicación antes del envío. No se simuló una notificación local ni un callback de recepción.

El propietario tocó la notificación real y confirmó: **«Abrió la sección Incidencias»**. La notificación desapareció de la bandeja. MIUI bloquea la inyección de toques por USB; la apertura física es una comprobación manual del propietario, no una automatización fingida. No se cambiaron los ajustes de seguridad de MIUI.

Antes del envío se comprobó desde la aplicación instalada:

- Sesión válida: REST200, rol cliente y suministro coincidente con el dashboard.
- Recibos e incidencias: REST200 y contrato de datos del suministro correcto.
- Configuración Firebase nativa real, permiso Android concedido y canal existente.
- Consentimiento mediante el control de la aplicación y registro auténtico del SDK.
- Token cifrado GCM en PostgreSQL, asociado únicamente a esta instalación y ausente del almacenamiento web.
- Resolución autorizada del evento: REST200 y sección `incidencias`; la misma consulta sin sesión devuelve401.

El observador privado terminó antes del envío. Se abrió la aplicación normalmente y después el launcher, comprobando que Hidro-Mejora estaba en segundo plano, para no alterar con instrumentación la decisión foreground/background del SDK. Las evidencias privadas contienen el registro Android de la notificación y los resultados controlados del worker, sin publicarse en GitHub.

## APK y conservación de datos

La candidata anterior se había compilado sin Google Services y con `HM_PUSH_ANDROID_ENABLED` apagado; Render mantenía cerrados el registro y las entregas. La integración reutiliza Capacitor7, el plugin existente y el adaptador FCM de los PR17–19.

La APK nueva conserva **versionName1.2.0, versionCode6, `pe.edu.hidromejora.app` y el certificado permanente original**. El reemplazo normal `adb install -r` sobre la candidata código6 fue aceptado por el POCO. UID y primera instalación se conservaron; no se desinstaló ni se limpió la aplicación oficial. Sesión, dashboard e historial siguieron disponibles. No se sobrescribió la APK anterior ni se modificó la firma.

SHA-256 de la APK final:

```text
e2072839b0005e0d4c8835a30a7b693aab6679cfa4e45bdd7e42ea26c5a243a5
```

El constructor `npm run android:fcm:release -- --config /ruta/privada/google-services.json` utiliza otro worktree, la API HTTPS productiva y la firma privada externa. La copia de Google Services se limita a la compilación y se retira después; el original privado permanece. Git ignora el archivo. El JSON, las credenciales del servidor y el observador de pruebas no forman parte de los artefactos públicos.

Los cambios posteriores a la compilación afectan únicamente al backend y la documentación. Las fuentes cliente/Android permanecen idénticas; se reutiliza la APK verificada, sin reconstruirla ni reutilizar el hash de la candidata anterior.

## Identidad y ejecución en Render

Se reutiliza `hm-fcm-pilot-120`, autorizada por el propietario. Se comprobó que su único rol contiene exclusivamente `cloudmessaging.messages.create`. Se creó **una sola clave USER_MANAGED**, guardada fuera del repositorio en archivo0600/directorio0700 y como secreto privado de Render. OAuth funciona; el operador dispone de permisos para deshabilitar, eliminar y sustituir la clave. No se cambiaron roles, APIs, cuentas administrativas ni facturación en este avance.

`PUSH_SERVICE_ACCOUNT_JSON` se convierte al iniciar el contenedor en una copia efímera0600, en directorio0700, entregada solo al worker. La API y el worker de correo no reciben esta credencial. El proceso push recibe únicamente sus variables y NODE_ENV. JWT, Gmail y las credenciales de PostgreSQL conservan sus valores.

El supervisor compartido espera readiness de los workers antes de abrir la API y coordina el cierre de sus propios hijos. Se conserva el servicio Render Free, sin servicios ni planes adicionales.

La validación usó `PUSH_VALIDATION_SINGLE_ATTEMPT=1` y un `PUSH_VALIDATION_DELIVERY_ID` concreto. El proceso quedó inactivo después; el contador/lease de PostgreSQL impide repetir ese envío tras un reinicio. No se drenaron otras entregas ni se ejecutó retención global durante la validación.

Configuración objetivo del despliegue final, que debe cotejarse después de la integración: `PUSH_ENABLED=1`, `PUSH_WORKER_ENABLED=1`, `PUSH_WORKER_SHARED_CONTAINER=1`, `PUSH_REAL_DELIVERY_ALLOWED=1`, `PUSH_PROVIDER=fcm`; retirar el destino de validación y dejar `PUSH_VALIDATION_SINGLE_ATTEMPT=0`. Comprobar antes que no existen mensajes anteriores pendientes. `PUSH_REMINDERS_ENABLED=0` se conserva: no se activan recordatorios automáticos ni barridos masivos.

Revocación: cerrar entregas/worker y desplegar esa configuración; deshabilitar o eliminar exclusivamente la clave dedicada mediante IAM y verificar su estado. Rotación futura autorizada: crear sustituta de la misma cuenta/rol, custodiarla como secreto, desplegar y comprobar OAuth, y retirar la anterior. Los tokens OAuth ya emitidos pueden durar hasta su vencimiento; cerrar el worker contiene inmediatamente los envíos. Se verificaron permisos/procedimiento, sin revocar ni rotar la única clave operativa.

## Pruebas y alcance

**51 pruebas dirigidas distintas aprobadas**, con PostgreSQL sintético y proveedores simulados: consentimiento, cifrado, preferencias, aislamiento entre cuentas/suministros, revocación/logout, concurrencia, token inválido, estado ambiguo, idempotencia, credenciales, supervisor y modo de envío único. El proceso CLI dirigido se reinició sin reenviar y dejó intactas las otras entregas sintéticas. No se repitieron las auditorías generales.

Compilación oficial: JUnitAndroid4/4, lint sin errores y 16 advertencias existentes, fuentes instrumentales compiladas, recursos/flag Firebase y certificado permanente verificados. Una comprobación privada adicional en el teléfono validó sesión/datos/registro y REST del evento. Sus primeros intentos detectaron limitaciones de arranque del harness y una suposición equivocada sobre el contrato de listas; se corrigió el observador sin modificar ni debilitar la aplicación.

El aislamiento con otra cuenta y la revocación se sustentan en las regresiones sintéticas; no se cerró la sesión del propietario ni se inventó una segunda prueba física entre cuentas. El envío físico comprobado es uno, en segundo plano. No se afirma otra entrega con proceso terminado o después de forzar detención. El toque y la consulta REST autorizada se verificaron como se describe arriba; no se dispone de una traza HTTP de plataforma del toque manual.

Se conservan Kubernetes del PR21 y la exclusión del PR22. No hay migraciones nuevas, cambios en Neon ni despliegue del panel Admin en este incremento. Cobros reales, Yape, recuperación no autorizada e inscripción2FA permanecen cerrados. Los factores ya activos continúan exigidos por el contrato `hidro-auth-2fa-v2`; una recuperación no puede volver a un backend incompatible.

## Límites y puerta de publicación

Render Free puede suspenderse tras15minutos sin tráfico entrante. El worker compartido procesa eventos cuando el servicio está activo; no garantiza vencimientos a una hora exacta mientras duerme. Los recordatorios automáticos siguen desactivados y no se anuncian como disponibles. La entrega requiere permiso, consentimiento, autorización vigente del dispositivo y conectividad; Android, Doze, detención forzada y restricciones del fabricante pueden afectarla.

Referencias: [Render Free](https://render.com/docs/free), [prioridad FCM Android](https://firebase.google.com/docs/cloud-messaging/android-message-priority).

La recepción y apertura física ya están comprobadas. La publicación queda condicionada a integrar el PR24 mediante los permisos existentes, desplegar su commit final exacto con la configuración cotejada, verificar health/autenticación/Socket.IO y compatibilidad del Admin, y comprobar la descarga pública, hash y firma de la APK. No se atribuyen aprobaciones de colaboradores inexistentes. El informe operativo privado y las notas de Release deben registrar el commit y resultado reales de esos pasos posteriores.
