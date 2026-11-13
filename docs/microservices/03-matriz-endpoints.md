# Matriz de endpoints — base 1be9c28

75 rutas registradas y contrastadas con Express en Node 22.23.4. Estado: auditoría
actual, **no distribución implementada**. Los dominios son propietarios propuestos.

Toda fila JWT/Admin incorpora además SELECT sobre usuarios, suministros y
usuario_2fa por `requiereAuth`. Admin añade comprobación de rol actual. «Propio»
se obtiene de la sesión, nunca del body. Las tablas enumeradas incluyen el
alcance del módulo y efectos condicionales, no afirman que cada petición ejecute
todas las consultas. Capabilities y flags pueden impedir llegar a SQL.

Las columnas de eventos describen intentos postpersistencia; no garantizan
entrega. Los triggers de 011/012/013 y las consultas transitivas se explican en
[01](01-auditoria.md). GET no implica ausencia de efectos auxiliares del módulo.

| Método | Ruta | Dominio | Tablas / alcance SQL | Operación | Permiso | Evento | Fuente |
|---|---|---|---|---|---|---|---|
| GET | `/api/admin/atencion` | Operations | solicitudes_atencion, suministros | Leer | Admin | — | [server.js:2179](../../Backend/server.js#L2179) |
| GET | `/api/admin/cortes` | Operations | cortes_servicio | Leer | Admin | — | [server.js:1393](../../Backend/server.js#L1393) |
| GET | `/api/admin/incidencias` | Operations | incidencias, suministros | Leer | Admin | — | [server.js:1593](../../Backend/server.js#L1593) |
| GET | `/api/admin/incidencias/:id/foto` | Operations | incidencias, suministros | Leer | Admin | — | [server.js:1628](../../Backend/server.js#L1628) |
| GET | `/api/admin/incidencias/:id/seguimiento` | Operations | incidencias, suministros, incidencia_eventos, usuarios, usuario_2fa | Lectura REPEATABLE READ | Admin | — | [incident-tracking.js:253](../../Backend/incident-tracking.js#L253) |
| GET | `/api/admin/operaciones-pago` | Billing | operaciones_pago, recibos, suministros, operaciones_pago_historial; control_piloto_yape opcional | Leer | Admin | — | [server.js:1105](../../Backend/server.js#L1105) |
| GET | `/api/admin/operaciones-pago/:id` | Billing | operaciones_pago, recibos, suministros, operaciones_pago_historial; control_piloto_yape opcional | Leer | Admin | — | [server.js:1107](../../Backend/server.js#L1107) |
| GET | `/api/admin/operaciones-pago/:id/comprobante` | Billing | operaciones_pago, recibos, suministros, operaciones_pago_historial; control_piloto_yape opcional | Leer | Admin | — | [server.js:1107](../../Backend/server.js#L1107) |
| GET | `/api/admin/pagos` | Billing | pagos, recibos, suministros | Leer | Admin | — | [server.js:2056](../../Backend/server.js#L2056) |
| GET | `/api/admin/recibos` | Billing | recibos, suministros, pagos | Leer | Admin | — | [server.js:1757](../../Backend/server.js#L1757) |
| GET | `/api/admin/resumen` | Composición | usuarios, recibos, pagos, incidencias, cortes_servicio, solicitudes_atencion | Seis consultas en paralelo | Admin | — | [server.js:2486](../../Backend/server.js#L2486) |
| GET | `/api/admin/usuarios` | Composición | usuarios, suministros, recibos, pagos, incidencias | Leer cuenta y actividad | Admin | — | [server.js:1873](../../Backend/server.js#L1873) |
| GET | `/api/admin/usuarios/:id` | Composición | usuarios, suministros, recibos, pagos, incidencias | Leer cuenta y actividad | Admin | — | [server.js:1914](../../Backend/server.js#L1914) |
| GET | `/api/atencion` | Operations | solicitudes_atencion, suministros | Leer | JWT; suministro propio | — | [server.js:2161](../../Backend/server.js#L2161) |
| GET | `/api/auth/2fa` | Auth | usuarios, suministros, usuario_2fa, usuario_2fa_recuperacion, desafios_2fa | Leer | JWT; ambos roles | — | [server.js:781](../../Backend/server.js#L781) |
| GET | `/api/auth/capabilities` | Auth | — | Consultar capacidad | Público | — | [email-registration.js:213](../../Backend/email-registration.js#L213) |
| GET | `/api/auth/password-recovery/capabilities` | Auth | — | Consultar capacidad | Público | — | [password-recovery.js:363](../../Backend/password-recovery.js#L363) |
| GET | `/api/auth/session` | Auth | usuarios, suministros, usuario_2fa | Leer | JWT; ambos roles | — | [server.js:716](../../Backend/server.js#L716) |
| GET | `/api/cortes` | Operations | cortes_servicio | Leer | Público | — | [server.js:1180](../../Backend/server.js#L1180) |
| GET | `/api/cortes/:suministro` | Operations | cortes_servicio, suministros | Leer | JWT; propio o admin | — | [server.js:1237](../../Backend/server.js#L1237) |
| GET | `/api/health` | Gateway | — (SELECT NOW) | Comprobar conexión | Público | — | [server.js:258](../../Backend/server.js#L258) |
| GET | `/api/incidencias/:id/foto` | Operations | incidencias, suministros | Leer | JWT; suministro propio | — | [server.js:402](../../Backend/server.js#L402) |
| GET | `/api/incidencias/:suministro` | Operations | incidencias, suministros | Leer | JWT; propio o admin | — | [server.js:345](../../Backend/server.js#L345) |
| GET | `/api/me/cortes` | Operations | cortes_servicio, suministros | Leer | JWT; suministro propio | — | [server.js:2445](../../Backend/server.js#L2445) |
| GET | `/api/me/incidencias` | Operations | incidencias, suministros | Leer | JWT; suministro propio | — | [server.js:2408](../../Backend/server.js#L2408) |
| GET | `/api/me/incidencias/:id/seguimiento` | Operations | incidencias, suministros, incidencia_eventos, usuarios, usuario_2fa | Lectura REPEATABLE READ | JWT; suministro propio | — | [incident-tracking.js:245](../../Backend/incident-tracking.js#L245) |
| GET | `/api/me/operaciones-pago` | Billing | operaciones_pago, recibos, suministros, operaciones_pago_historial; control_piloto_yape opcional | Leer | JWT; suministro propio | — | [server.js:1104](../../Backend/server.js#L1104) |
| GET | `/api/me/operaciones-pago/:id` | Billing | operaciones_pago, recibos, suministros, operaciones_pago_historial; control_piloto_yape opcional | Leer | JWT; suministro propio | — | [server.js:1107](../../Backend/server.js#L1107) |
| GET | `/api/me/operaciones-pago/:id/comprobante` | Billing | operaciones_pago, recibos, suministros, operaciones_pago_historial; control_piloto_yape opcional | Leer | JWT; suministro propio | — | [server.js:1107](../../Backend/server.js#L1107) |
| GET | `/api/me/pagos` | Billing | pagos, recibos, suministros | Leer | JWT; suministro propio | — | [server.js:2391](../../Backend/server.js#L2391) |
| GET | `/api/me/perfil` | Auth | usuarios, suministros | Leer perfil | JWT; suministro propio | — | [server.js:2425](../../Backend/server.js#L2425) |
| GET | `/api/me/recibos` | Billing | recibos, suministros | Leer | JWT; suministro propio | — | [server.js:2374](../../Backend/server.js#L2374) |
| GET | `/api/notificaciones` | Notifications | notificaciones, notificaciones_lecturas | Leer avisos | JWT; suministro propio | — | [server.js:2296](../../Backend/server.js#L2296) |
| GET | `/api/pagos/:suministro` | Billing | pagos, recibos, suministros | Leer | JWT; propio o admin | — | [server.js:1125](../../Backend/server.js#L1125) |
| GET | `/api/pagos/config` | Billing | operaciones_pago, recibos, suministros, operaciones_pago_historial; control_piloto_yape opcional | Leer | JWT; suministro propio | — | [server.js:1091](../../Backend/server.js#L1091) |
| GET | `/api/pagos/yape/qr` | Billing | operaciones_pago, recibos, suministros, operaciones_pago_historial; control_piloto_yape opcional | Leer | JWT; suministro propio | — | [server.js:1092](../../Backend/server.js#L1092) |
| GET | `/api/perfil/:suministro` | Auth | usuarios, suministros | Leer perfil | JWT; propio o admin | — | [server.js:793](../../Backend/server.js#L793) |
| GET | `/api/push/capabilities` | Notifications | — | Leer | Público | — | [push.js:226](../../Backend/push.js#L226) |
| GET | `/api/push/events/:id` | Notifications | push_dispositivos, push_entregas, notificaciones; usuarios, suministros, usuario_2fa (elegibilidad) | Leer | JWT; rol usuario y propiedad | — | [push.js:268](../../Backend/push.js#L268) |
| GET | `/api/recibos/:suministro` | Billing | recibos, suministros | Leer | JWT; propio o admin | — | [server.js:290](../../Backend/server.js#L290) |
| PATCH | `/api/admin/atencion/:id` | Operations | solicitudes_atencion, suministros; notificaciones (intento adicional) | Actualizar | Admin | atencion:actualizada; notificacion:nueva condicional | [server.js:2226](../../Backend/server.js#L2226) |
| PATCH | `/api/admin/cortes/:id` | Operations | cortes_servicio; notificaciones/push_entregas según alcance y perfil | Actualizar | Admin | corte:actualizado | [server.js:1518](../../Backend/server.js#L1518) |
| PATCH | `/api/admin/cortes/:id/cancelar` | Operations | cortes_servicio; notificaciones/push_entregas según alcance y perfil | Actualizar | Admin | corte:actualizado | [server.js:1473](../../Backend/server.js#L1473) |
| PATCH | `/api/admin/incidencias/:id/estado` | Operations | incidencias, suministros, usuarios, usuario_2fa, incidencia_eventos, incidencia_cambios, notificaciones; push_entregas si 012 | Transacción estado/historial/aviso/deduplicación | Admin | incidencia:actualizada, notificacion:nueva | [server.js:1679](../../Backend/server.js#L1679) |
| PATCH | `/api/admin/recibos/:id` | Billing | recibos, suministros, pagos, operaciones_pago, control_piloto_yape opcional | Transacción; suministro → recibo | Admin | recibo:actualizado | [server.js:1804](../../Backend/server.js#L1804) |
| PATCH | `/api/admin/recibos/:id/anular` | Billing | recibos, suministros, pagos, operaciones_pago, control_piloto_yape opcional | Transacción; suministro → recibo | Admin | recibo:actualizado | [server.js:1812](../../Backend/server.js#L1812) |
| PATCH | `/api/admin/suministros/:id/ubicacion` | Auth | suministros | Actualizar ubicación | Admin | perfil:actualizado | [server.js:2012](../../Backend/server.js#L2012) |
| PATCH | `/api/admin/usuarios/:id/estado` | Auth | usuarios, suministros | Actualizar activo; impedir autodesactivación | Admin | sesion:invalidada y desconexión | [server.js:1975](../../Backend/server.js#L1975) |
| PATCH | `/api/notificaciones/:id/leida` | Notifications | notificaciones, notificaciones_lecturas | Validar visibilidad e insertar lectura idempotente | JWT; suministro propio | — | [server.js:2332](../../Backend/server.js#L2332) |
| POST | `/api/admin/cortes` | Operations | cortes_servicio; notificaciones/push_entregas según alcance y perfil | Crear | Admin | corte:actualizado, notificacion:nueva si General | [server.js:1419](../../Backend/server.js#L1419) |
| POST | `/api/admin/operaciones-pago/:id/revisar` | Billing | operaciones_pago, recibos, suministros, operaciones_pago_historial; control_piloto_yape opcional | Transacción idempotente / bloqueo de recibo | Admin | pago:registrado, pago:nuevo | [server.js:1111](../../Backend/server.js#L1111) |
| POST | `/api/admin/recibos` | Billing | recibos, suministros, pagos, operaciones_pago, control_piloto_yape opcional; notificaciones (intento adicional) | Transacción; suministro → recibo | Admin | recibo:nuevo, notificacion:nueva | [server.js:1790](../../Backend/server.js#L1790) |
| POST | `/api/atencion` | Operations | solicitudes_atencion, suministros | Crear | JWT; suministro propio | atencion:nueva | [server.js:2126](../../Backend/server.js#L2126) |
| POST | `/api/auth/2fa/confirm` | Auth | usuarios, suministros, usuario_2fa, usuario_2fa_recuperacion, desafios_2fa | Crear | JWT; ambos roles | Desconexión de sesiones | [server.js:771](../../Backend/server.js#L771) |
| POST | `/api/auth/2fa/disable` | Auth | usuarios, suministros, usuario_2fa, usuario_2fa_recuperacion, desafios_2fa | Crear | JWT; ambos roles | Desconexión de sesiones | [server.js:771](../../Backend/server.js#L771) |
| POST | `/api/auth/2fa/login` | Auth | usuarios, suministros, usuario_2fa, usuario_2fa_recuperacion, desafios_2fa | Crear | Público; validación/limitador de flujo | — | [server.js:771](../../Backend/server.js#L771) |
| POST | `/api/auth/2fa/recovery` | Auth | usuarios, suministros, usuario_2fa, usuario_2fa_recuperacion, desafios_2fa | Crear | JWT; ambos roles | Desconexión de sesiones | [server.js:771](../../Backend/server.js#L771) |
| POST | `/api/auth/2fa/setup` | Auth | usuarios, suministros, usuario_2fa, usuario_2fa_recuperacion, desafios_2fa | Crear | JWT; ambos roles | — | [server.js:771](../../Backend/server.js#L771) |
| POST | `/api/auth/change-password` | Auth | usuarios, suministros, usuario_2fa | Crear | JWT; ambos roles | sesion:invalidada / desconexión | [server.js:845](../../Backend/server.js#L845) |
| POST | `/api/auth/login` | Auth | usuarios, suministros, usuario_2fa | Crear | Público; validación/limitador de flujo | — | [server.js:621](../../Backend/server.js#L621) |
| POST | `/api/auth/otp/register` | Auth | usuarios, suministros, usuario_2fa, registros_correo_pendientes, registros_correo_envios, correo_outbox | Crear | Público; validación/limitador de flujo | — | [email-registration.js:222](../../Backend/email-registration.js#L222) |
| POST | `/api/auth/otp/resend-verification` | Auth | usuarios, suministros, usuario_2fa, registros_correo_pendientes, registros_correo_envios, correo_outbox | Crear | Público; validación/limitador de flujo | — | [email-registration.js:222](../../Backend/email-registration.js#L222) |
| POST | `/api/auth/password-recovery/complete` | Auth | usuarios, suministros, usuario_2fa, recuperacion_clave_limites, recuperaciones_clave, recuperacion_clave_outbox, desafios_2fa | Crear | Público; validación/limitador de flujo | sesion:invalidada / desconexión | [password-recovery.js:373](../../Backend/password-recovery.js#L373) |
| POST | `/api/auth/password-recovery/request` | Auth | usuarios, suministros, usuario_2fa, recuperacion_clave_limites, recuperaciones_clave, recuperacion_clave_outbox, desafios_2fa | Crear | Público; validación/limitador de flujo | — | [password-recovery.js:373](../../Backend/password-recovery.js#L373) |
| POST | `/api/auth/password-recovery/verify` | Auth | usuarios, suministros, usuario_2fa, recuperacion_clave_limites, recuperaciones_clave, recuperacion_clave_outbox, desafios_2fa | Crear | Público; validación/limitador de flujo | — | [password-recovery.js:373](../../Backend/password-recovery.js#L373) |
| POST | `/api/auth/register` | Auth | usuarios, suministros, usuario_2fa, registros_correo_pendientes, registros_correo_envios, correo_outbox | Crear | Público; validación/limitador de flujo | — | [email-registration.js:222](../../Backend/email-registration.js#L222) |
| POST | `/api/auth/resend-verification` | Auth | usuarios, suministros, usuario_2fa, registros_correo_pendientes, registros_correo_envios, correo_outbox | Crear | Público; validación/limitador de flujo | — | [email-registration.js:222](../../Backend/email-registration.js#L222) |
| POST | `/api/auth/verification-status` | Auth | usuarios, suministros, usuario_2fa, registros_correo_pendientes, registros_correo_envios, correo_outbox | Crear | Público; validación/limitador de flujo | — | [email-registration.js:222](../../Backend/email-registration.js#L222) |
| POST | `/api/auth/verify-email` | Auth | usuarios, suministros, usuario_2fa, registros_correo_pendientes, registros_correo_envios, correo_outbox | Crear | Público; validación/limitador de flujo | — | [email-registration.js:222](../../Backend/email-registration.js#L222) |
| POST | `/api/incidencias` | Operations | incidencias, suministros; incidencia_eventos (trigger) | Crear | JWT; suministro propio | incidencia:nueva | [server.js:971](../../Backend/server.js#L971) |
| POST | `/api/me/operaciones-pago` | Billing | operaciones_pago, recibos, suministros, operaciones_pago_historial; control_piloto_yape opcional | Transacción idempotente / bloqueo de recibo | JWT; suministro propio | pago:registrado, pago:nuevo | [server.js:1100](../../Backend/server.js#L1100) |
| POST | `/api/me/operaciones-pago/:id/cancelar` | Billing | operaciones_pago, recibos, suministros, operaciones_pago_historial; control_piloto_yape opcional | Transacción idempotente / bloqueo de recibo | JWT; suministro propio | pago:registrado, pago:nuevo | [server.js:1110](../../Backend/server.js#L1110) |
| POST | `/api/pagos` | Billing | operaciones_pago, recibos, suministros, operaciones_pago_historial; control_piloto_yape opcional | Transacción idempotente / bloqueo de recibo | JWT; suministro propio | pago:registrado, pago:nuevo | [server.js:1094](../../Backend/server.js#L1094) |
| POST | `/api/push/devices` | Notifications | push_dispositivos, push_entregas, notificaciones; usuarios, suministros, usuario_2fa (elegibilidad) | Crear | JWT; rol usuario y propiedad | — | [push.js:243](../../Backend/push.js#L243) |
| POST | `/api/push/revoke` | Notifications | push_dispositivos, push_entregas | Crear | Capacidad de revocación (id/prueba), sin JWT | — | [push.js:260](../../Backend/push.js#L260) |

Socket.IO usa GET/POST `/socket.io/` y upgrade WebSocket fuera del router REST.
HEAD implícito sigue GET; OPTIONS se atiende mediante CORS. No hay rutas PUT
ni DELETE explícitas en esta revisión. Mantener rutas específicas de pagos
(config/qr) antes del alias `:suministro`.
