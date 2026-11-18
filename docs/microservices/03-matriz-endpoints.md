# Matriz de endpoints — base 1be9c28

MS-05 comprueba las 75 combinaciones de método y ruta contra el runtime de los
procesos separados. Las referencias SQL de la matriz incluyen dependencias
lógicas, que en el laboratorio pasan por funciones y proyecciones cuando el
dominio propietario es otro. Consulta la [matriz de procesos, datos y eventos](10-laboratorio-servicios.md).


75 rutas registradas y contrastadas con Express en Node 22.23.4. Estado: auditoría
actual, **no distribución implementada**. Los dominios son propietarios propuestos.

Toda fila JWT/Admin incorpora además SELECT sobre usuarios, suministros y
usuario_2fa por `requiereAuth`. Admin añade comprobación de rol actual. «Propio»
se obtiene de la sesión, nunca del body. Las tablas enumeradas incluyen el
alcance del módulo y efectos condicionales, no afirman que cada petición ejecute
todas las consultas. Capabilities y flags pueden impedir llegar a SQL.

La columna de eventos identifica invalidaciones que hacen reconsultar REST.
El perfil 015 las persiste desde los triggers. Los triggers de 011/012/013 y
las consultas transitivas originales se explican en [01](01-auditoria.md).

| Método | Ruta | Dominio | Tablas / alcance SQL | Operación | Permiso | Evento | Fuente |
|---|---|---|---|---|---|---|---|
| GET | `/api/admin/atencion` | Operations | solicitudes_atencion, suministros | Leer | Admin | — | [operations/routes.cjs:836](../../Backend/services/operations/routes.cjs#L836) |
| GET | `/api/admin/cortes` | Operations | cortes_servicio | Leer | Admin | — | [operations/routes.cjs:469](../../Backend/services/operations/routes.cjs#L469) |
| GET | `/api/admin/incidencias` | Operations | incidencias, suministros | Leer | Admin | — | [operations/routes.cjs:663](../../Backend/services/operations/routes.cjs#L663) |
| GET | `/api/admin/incidencias/:id/foto` | Operations | incidencias, suministros | Leer | Admin | — | [operations/routes.cjs:698](../../Backend/services/operations/routes.cjs#L698) |
| GET | `/api/admin/incidencias/:id/seguimiento` | Operations | incidencias, suministros, incidencia_eventos, usuarios, usuario_2fa | Lectura REPEATABLE READ | Admin | — | [incident-tracking.js:253](../../Backend/incident-tracking.js#L253) |
| GET | `/api/admin/operaciones-pago` | Billing | operaciones_pago, recibos, suministros, operaciones_pago_historial; control_piloto_yape opcional | Leer | Admin | — | [billing/routes.cjs:81](../../Backend/services/billing/routes.cjs#L81) |
| GET | `/api/admin/operaciones-pago/:id` | Billing | operaciones_pago, recibos, suministros, operaciones_pago_historial; control_piloto_yape opcional | Leer | Admin | — | [billing/routes.cjs](../../Backend/services/billing/routes.cjs) |
| GET | `/api/admin/operaciones-pago/:id/comprobante` | Billing | operaciones_pago, recibos, suministros, operaciones_pago_historial; control_piloto_yape opcional | Leer | Admin | — | [billing/routes.cjs](../../Backend/services/billing/routes.cjs) |
| GET | `/api/admin/pagos` | Billing | pagos, recibos, suministros | Leer | Admin | — | [billing/routes.cjs:260](../../Backend/services/billing/routes.cjs#L260) |
| GET | `/api/admin/recibos` | Billing | recibos, suministros, pagos | Leer | Admin | — | [billing/routes.cjs:197](../../Backend/services/billing/routes.cjs#L197) |
| GET | `/api/admin/resumen` | Composición | usuarios, recibos, pagos, incidencias, cortes_servicio, solicitudes_atencion | Seis consultas en paralelo | Admin | — | [auth/reporting.cjs:107](../../Backend/services/auth/reporting.cjs#L107) |
| GET | `/api/admin/usuarios` | Composición | usuarios, suministros, recibos, pagos, incidencias | Leer cuenta y actividad | Admin | — | [auth/reporting.cjs:5](../../Backend/services/auth/reporting.cjs#L5) |
| GET | `/api/admin/usuarios/:id` | Composición | usuarios, suministros, recibos, pagos, incidencias | Leer cuenta y actividad | Admin | — | [auth/reporting.cjs:46](../../Backend/services/auth/reporting.cjs#L46) |
| GET | `/api/atencion` | Operations | solicitudes_atencion, suministros | Leer | JWT; suministro propio | — | [operations/routes.cjs:783](../../Backend/services/operations/routes.cjs#L783) |
| GET | `/api/auth/2fa` | Auth | usuarios, suministros, usuario_2fa, usuario_2fa_recuperacion, desafios_2fa | Leer | JWT; ambos roles | — | [auth/server.cjs:252](../../Backend/services/auth/server.cjs#L252) |
| GET | `/api/auth/capabilities` | Auth | — | Consultar capacidad | Público | — | [email-registration.js:213](../../Backend/email-registration.js#L213) |
| GET | `/api/auth/password-recovery/capabilities` | Auth | — | Consultar capacidad | Público | — | [password-recovery.js:363](../../Backend/password-recovery.js#L363) |
| GET | `/api/auth/session` | Auth | usuarios, suministros, usuario_2fa | Leer | JWT; ambos roles | — | [auth/server.cjs:218](../../Backend/services/auth/server.cjs#L218) |
| GET | `/api/cortes` | Operations | cortes_servicio | Leer | Público | — | [operations/routes.cjs:275](../../Backend/services/operations/routes.cjs#L275) |
| GET | `/api/cortes/:suministro` | Operations | cortes_servicio, suministros | Leer | JWT; propio o admin | — | [operations/routes.cjs:318](../../Backend/services/operations/routes.cjs#L318) |
| GET | `/api/health` | Gateway | — (SELECT NOW) | Comprobar conexión | Público | — | [gateway/server.cjs:57](../../Backend/services/gateway/server.cjs#L57) |
| GET | `/api/incidencias/:id/foto` | Operations | incidencias, suministros | Leer | JWT; suministro propio | — | [operations/routes.cjs:55](../../Backend/services/operations/routes.cjs#L55) |
| GET | `/api/incidencias/:suministro` | Operations | incidencias, suministros | Leer | JWT; propio o admin | — | [operations/routes.cjs:5](../../Backend/services/operations/routes.cjs#L5) |
| GET | `/api/me/cortes` | Operations | cortes_servicio, suministros | Leer | JWT; suministro propio | — | [operations/routes.cjs:965](../../Backend/services/operations/routes.cjs#L965) |
| GET | `/api/me/incidencias` | Operations | incidencias, suministros | Leer | JWT; suministro propio | — | [operations/routes.cjs:948](../../Backend/services/operations/routes.cjs#L948) |
| GET | `/api/me/incidencias/:id/seguimiento` | Operations | incidencias, suministros, incidencia_eventos, usuarios, usuario_2fa | Lectura REPEATABLE READ | JWT; suministro propio | — | [incident-tracking.js:245](../../Backend/incident-tracking.js#L245) |
| GET | `/api/me/operaciones-pago` | Billing | operaciones_pago, recibos, suministros, operaciones_pago_historial; control_piloto_yape opcional | Leer | JWT; suministro propio | — | [billing/routes.cjs:74](../../Backend/services/billing/routes.cjs#L74) |
| GET | `/api/me/operaciones-pago/:id` | Billing | operaciones_pago, recibos, suministros, operaciones_pago_historial; control_piloto_yape opcional | Leer | JWT; suministro propio | — | [billing/routes.cjs](../../Backend/services/billing/routes.cjs) |
| GET | `/api/me/operaciones-pago/:id/comprobante` | Billing | operaciones_pago, recibos, suministros, operaciones_pago_historial; control_piloto_yape opcional | Leer | JWT; suministro propio | — | [billing/routes.cjs](../../Backend/services/billing/routes.cjs) |
| GET | `/api/me/pagos` | Billing | pagos, recibos, suministros | Leer | JWT; suministro propio | — | [billing/routes.cjs:329](../../Backend/services/billing/routes.cjs#L329) |
| GET | `/api/me/perfil` | Auth | usuarios, suministros | Leer perfil | JWT; suministro propio | — | [auth/server.cjs:297](../../Backend/services/auth/server.cjs#L297) |
| GET | `/api/me/recibos` | Billing | recibos, suministros | Leer | JWT; suministro propio | — | [billing/routes.cjs:312](../../Backend/services/billing/routes.cjs#L312) |
| GET | `/api/notificaciones` | Notifications | notificaciones, notificaciones_lecturas | Leer avisos | JWT; suministro propio | — | [notifications/routes.cjs:10](../../Backend/services/notifications/routes.cjs#L10) |
| GET | `/api/pagos/:suministro` | Billing | pagos, recibos, suministros | Leer | JWT; propio o admin | — | [billing/routes.cjs:98](../../Backend/services/billing/routes.cjs#L98) |
| GET | `/api/pagos/config` | Billing | operaciones_pago, recibos, suministros, operaciones_pago_historial; control_piloto_yape opcional | Leer | JWT; suministro propio | — | [billing/routes.cjs:63](../../Backend/services/billing/routes.cjs#L63) |
| GET | `/api/pagos/yape/qr` | Billing | operaciones_pago, recibos, suministros, operaciones_pago_historial; control_piloto_yape opcional | Leer | JWT; suministro propio | — | [billing/routes.cjs:65](../../Backend/services/billing/routes.cjs#L65) |
| GET | `/api/perfil/:suministro` | Auth | usuarios, suministros | Leer perfil | JWT; propio o admin | — | [auth/server.cjs:312](../../Backend/services/auth/server.cjs#L312) |
| GET | `/api/push/capabilities` | Notifications | — | Leer | Público | — | [push.js:226](../../Backend/push.js#L226) |
| GET | `/api/push/events/:id` | Notifications | push_dispositivos, push_entregas, notificaciones; usuarios, suministros, usuario_2fa (elegibilidad) | Leer | JWT; rol usuario y propiedad | — | [push.js:268](../../Backend/push.js#L268) |
| GET | `/api/recibos/:suministro` | Billing | recibos, suministros | Leer | JWT; propio o admin | — | [billing/routes.cjs:8](../../Backend/services/billing/routes.cjs#L8) |
| PATCH | `/api/admin/atencion/:id` | Operations | solicitudes_atencion, suministros; notificaciones (intento adicional) | Actualizar | Admin | atencion:actualizada; notificacion:nueva condicional | [operations/routes.cjs:883](../../Backend/services/operations/routes.cjs#L883) |
| PATCH | `/api/admin/cortes/:id` | Operations | cortes_servicio; notificaciones/push_entregas según alcance y perfil | Actualizar | Admin | corte:actualizado | [operations/routes.cjs:594](../../Backend/services/operations/routes.cjs#L594) |
| PATCH | `/api/admin/cortes/:id/cancelar` | Operations | cortes_servicio; notificaciones/push_entregas según alcance y perfil | Actualizar | Admin | corte:actualizado | [operations/routes.cjs:549](../../Backend/services/operations/routes.cjs#L549) |
| PATCH | `/api/admin/incidencias/:id/estado` | Operations | incidencias, suministros, usuarios, usuario_2fa, incidencia_eventos, incidencia_cambios, notificaciones; push_entregas si 012 | Transacción estado/historial/aviso/deduplicación | Admin | incidencia:actualizada, notificacion:nueva | [operations/routes.cjs:751](../../Backend/services/operations/routes.cjs#L751) |
| PATCH | `/api/admin/recibos/:id` | Billing | recibos, suministros, pagos, operaciones_pago, control_piloto_yape opcional | Transacción; suministro → recibo | Admin | recibo:actualizado | [billing/routes.cjs:244](../../Backend/services/billing/routes.cjs#L244) |
| PATCH | `/api/admin/recibos/:id/anular` | Billing | recibos, suministros, pagos, operaciones_pago, control_piloto_yape opcional | Transacción; suministro → recibo | Admin | recibo:actualizado | [billing/routes.cjs:252](../../Backend/services/billing/routes.cjs#L252) |
| PATCH | `/api/admin/suministros/:id/ubicacion` | Auth | suministros | Actualizar ubicación | Admin | perfil:actualizado | [auth/server.cjs:367](../../Backend/services/auth/server.cjs#L367) |
| PATCH | `/api/admin/usuarios/:id/estado` | Auth | usuarios, suministros | Actualizar activo; impedir autodesactivación | Admin | sesion:invalidada y desconexión | [auth/server.cjs:335](../../Backend/services/auth/server.cjs#L335) |
| PATCH | `/api/notificaciones/:id/leida` | Notifications | notificaciones, notificaciones_lecturas | Validar visibilidad e insertar lectura idempotente | JWT; suministro propio | — | [notifications/routes.cjs:46](../../Backend/services/notifications/routes.cjs#L46) |
| POST | `/api/admin/cortes` | Operations | cortes_servicio; notificaciones/push_entregas según alcance y perfil | Crear | Admin | corte:actualizado, notificacion:nueva si General | [operations/routes.cjs:469](../../Backend/services/operations/routes.cjs#L469) |
| POST | `/api/admin/operaciones-pago/:id/revisar` | Billing | operaciones_pago, recibos, suministros, operaciones_pago_historial; control_piloto_yape opcional | Transacción idempotente / bloqueo de recibo | Admin | pago:registrado, pago:nuevo | [billing/routes.cjs:90](../../Backend/services/billing/routes.cjs#L90) |
| POST | `/api/admin/recibos` | Billing | recibos, suministros, pagos, operaciones_pago, control_piloto_yape opcional; notificaciones (intento adicional) | Transacción; suministro → recibo | Admin | recibo:nuevo, notificacion:nueva | [billing/routes.cjs:197](../../Backend/services/billing/routes.cjs#L197) |
| POST | `/api/atencion` | Operations | solicitudes_atencion, suministros | Crear | JWT; suministro propio | atencion:nueva | [operations/routes.cjs:783](../../Backend/services/operations/routes.cjs#L783) |
| POST | `/api/auth/2fa/confirm` | Auth | usuarios, suministros, usuario_2fa, usuario_2fa_recuperacion, desafios_2fa | Crear | JWT; ambos roles | Desconexión de sesiones | [auth/server.cjs](../../Backend/services/auth/server.cjs) |
| POST | `/api/auth/2fa/disable` | Auth | usuarios, suministros, usuario_2fa, usuario_2fa_recuperacion, desafios_2fa | Crear | JWT; ambos roles | Desconexión de sesiones | [auth/server.cjs](../../Backend/services/auth/server.cjs) |
| POST | `/api/auth/2fa/login` | Auth | usuarios, suministros, usuario_2fa, usuario_2fa_recuperacion, desafios_2fa | Crear | Público; validación/limitador de flujo | — | [auth/server.cjs](../../Backend/services/auth/server.cjs) |
| POST | `/api/auth/2fa/recovery` | Auth | usuarios, suministros, usuario_2fa, usuario_2fa_recuperacion, desafios_2fa | Crear | JWT; ambos roles | Desconexión de sesiones | [auth/server.cjs](../../Backend/services/auth/server.cjs) |
| POST | `/api/auth/2fa/setup` | Auth | usuarios, suministros, usuario_2fa, usuario_2fa_recuperacion, desafios_2fa | Crear | JWT; ambos roles | — | [auth/server.cjs](../../Backend/services/auth/server.cjs) |
| POST | `/api/auth/change-password` | Auth | usuarios, suministros, usuario_2fa | Crear | JWT; ambos roles | sesion:invalidada / desconexión | [auth/server.cjs:263](../../Backend/services/auth/server.cjs#L263) |
| POST | `/api/auth/login` | Auth | usuarios, suministros, usuario_2fa | Crear | Público; validación/limitador de flujo | — | [auth/server.cjs:175](../../Backend/services/auth/server.cjs#L175) |
| POST | `/api/auth/otp/register` | Auth | usuarios, suministros, usuario_2fa, registros_correo_pendientes, registros_correo_envios, correo_outbox | Crear | Público; validación/limitador de flujo | — | [email-registration.js:222](../../Backend/email-registration.js#L222) |
| POST | `/api/auth/otp/resend-verification` | Auth | usuarios, suministros, usuario_2fa, registros_correo_pendientes, registros_correo_envios, correo_outbox | Crear | Público; validación/limitador de flujo | — | [email-registration.js:222](../../Backend/email-registration.js#L222) |
| POST | `/api/auth/password-recovery/complete` | Auth | usuarios, suministros, usuario_2fa, recuperacion_clave_limites, recuperaciones_clave, recuperacion_clave_outbox, desafios_2fa | Crear | Público; validación/limitador de flujo | sesion:invalidada / desconexión | [password-recovery.js:373](../../Backend/password-recovery.js#L373) |
| POST | `/api/auth/password-recovery/request` | Auth | usuarios, suministros, usuario_2fa, recuperacion_clave_limites, recuperaciones_clave, recuperacion_clave_outbox, desafios_2fa | Crear | Público; validación/limitador de flujo | — | [password-recovery.js:373](../../Backend/password-recovery.js#L373) |
| POST | `/api/auth/password-recovery/verify` | Auth | usuarios, suministros, usuario_2fa, recuperacion_clave_limites, recuperaciones_clave, recuperacion_clave_outbox, desafios_2fa | Crear | Público; validación/limitador de flujo | — | [password-recovery.js:373](../../Backend/password-recovery.js#L373) |
| POST | `/api/auth/register` | Auth | usuarios, suministros, usuario_2fa, registros_correo_pendientes, registros_correo_envios, correo_outbox | Crear | Público; validación/limitador de flujo | — | [email-registration.js:222](../../Backend/email-registration.js#L222) |
| POST | `/api/auth/resend-verification` | Auth | usuarios, suministros, usuario_2fa, registros_correo_pendientes, registros_correo_envios, correo_outbox | Crear | Público; validación/limitador de flujo | — | [email-registration.js:222](../../Backend/email-registration.js#L222) |
| POST | `/api/auth/verification-status` | Auth | usuarios, suministros, usuario_2fa, registros_correo_pendientes, registros_correo_envios, correo_outbox | Crear | Público; validación/limitador de flujo | — | [email-registration.js:222](../../Backend/email-registration.js#L222) |
| POST | `/api/auth/verify-email` | Auth | usuarios, suministros, usuario_2fa, registros_correo_pendientes, registros_correo_envios, correo_outbox | Crear | Público; validación/limitador de flujo | — | [email-registration.js:222](../../Backend/email-registration.js#L222) |
| POST | `/api/incidencias` | Operations | incidencias, suministros; incidencia_eventos (trigger) | Crear | JWT; suministro propio | incidencia:nueva | [operations/routes.cjs:163](../../Backend/services/operations/routes.cjs#L163) |
| POST | `/api/me/operaciones-pago` | Billing | operaciones_pago, recibos, suministros, operaciones_pago_historial; control_piloto_yape opcional | Transacción idempotente / bloqueo de recibo | JWT; suministro propio | pago:registrado, pago:nuevo | [billing/routes.cjs:74](../../Backend/services/billing/routes.cjs#L74) |
| POST | `/api/me/operaciones-pago/:id/cancelar` | Billing | operaciones_pago, recibos, suministros, operaciones_pago_historial; control_piloto_yape opcional | Transacción idempotente / bloqueo de recibo | JWT; suministro propio | pago:registrado, pago:nuevo | [billing/routes.cjs:88](../../Backend/services/billing/routes.cjs#L88) |
| POST | `/api/pagos` | Billing | operaciones_pago, recibos, suministros, operaciones_pago_historial; control_piloto_yape opcional | Transacción idempotente / bloqueo de recibo | JWT; suministro propio | pago:registrado, pago:nuevo | [billing/routes.cjs:67](../../Backend/services/billing/routes.cjs#L67) |
| POST | `/api/push/devices` | Notifications | push_dispositivos, push_entregas, notificaciones; usuarios, suministros, usuario_2fa (elegibilidad) | Crear | JWT; rol usuario y propiedad | — | [push.js:243](../../Backend/push.js#L243) |
| POST | `/api/push/revoke` | Notifications | push_dispositivos, push_entregas | Crear | Capacidad de revocación (id/prueba), sin JWT | — | [push.js:260](../../Backend/push.js#L260) |

Socket.IO usa GET/POST `/socket.io/` y upgrade WebSocket fuera del router REST.
HEAD implícito sigue GET; OPTIONS se atiende mediante CORS. No hay rutas PUT
ni DELETE explícitas en esta revisión. Mantener rutas específicas de pagos
(config/qr) antes del alias `:suministro`.
