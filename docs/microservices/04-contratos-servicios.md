# Contratos internos propuestos

## Contratos implementados en MS-02 y MS-03

El [transporte de correo](../../Backend/services/notifications/README.md) ya
se ejecuta en un proceso independiente. Su endpoint interno autenticado recibe
una entrega tras el COMMIT de la outbox, sin mover la activación OTP fuera de
Auth. Se mantienen la coordinación por lease, cancelación y decisión de reintento
en el propietario original.

[Auth](../../Backend/services/auth/README.md) también es un proceso
independiente y expone la introspección de la tabla: `POST
/internal/v1/auth/introspect` con el mismo esquema HMAC que el transporte, un
intento por petición, respuesta fail-closed sin caché permisiva y sin
`clave_hash`, OTP ni secretos. El cliente `createIntrospector` devuelve `null`
sin confirmación y cada consumidor decide su propio cierre. Los contratos
siguientes de esta página siguen pendientes.

## Contratos restantes

Estado: diseño pendiente de implementación y validación. Las 75 rutas públicas,
JSON, códigos HTTP, cabeceras, bytes de imágenes y JWT existentes se conservan.
No normalizar errores con formatos actualmente diferentes.

| Contrato | Entrada / salida | Garantías requeridas |
|---|---|---|
| Auth: introspección (implementada en MS-03) | Bearer original → identidad, suministro, rol, versión MFA | Estado actual; no caché permisiva; sin clave_hash ni secretos |
| Auth: identidad/ubicación | IDs acotados y actor → campos públicos autorizados | Acceso por rol/suministro; prohibido SQL arbitrario |
| Auth: reclamar entrega | Identidad de worker → job opaco, lease, plazo | Mismos locks/activación OTP y límites que código actual |
| Auth: resultado de entrega | job_id, lease, outcome permitido | Idempotencia; rechazo de lease vencido; ambigüedad Gmail preservada |
| Dominio: estadísticas | Actor admin → sección de resumen existente | No consultas de tablas ajenas; mantener Number/strings según API |
| Productor: eventos | Cursor consumidor → lotes ordenados por productor | Evento persistido con operación; no ACK antes de persistir inbox |
| Notifications: notificación | UUID productor, destinatario, tipo, contenido mínimo | Deduplicación; permisos del productor; no destinatarios suministrados por cliente |
| Realtime: invalidación | UUID evento, audiencia validada, payload permitido | Salas elegidas por servidor; separación admin/suministro; revocación |

Sobre de evento propuesto: `id`, `version`, `producer`, `type`, `aggregate_id`,
`aggregate_version`, `occurred_at`, `audience`, `payload`. IDs opacos; sin JWT,
contraseñas ni OTP. El transporte de correo cifrado usa un contrato separado,
retención limitada y nunca el bus público de invalidaciones.

Autenticación interna: credenciales distintas por pareja/servicio o mTLS;
audiencia y alcance comprobados, rotación y comparación segura. Red privada
no sustituye autorización. Gateway elimina cabeceras de identidad internas
aportadas por clientes; servicios reconstruyen al actor desde Auth.

Timeouts acotados, límite de cuerpo, propagación de cancelación, request_id
saneado y circuitos de fallo independientes. No reintentar POST/PATCH sin
clave y semántica idempotente del dominio. Un timeout después de COMMIT exige
consulta de estado usando solicitud_id, no repetir ciegamente.

## Contratos todavía sin solución verificada

1. Incidencia + notificación inmediata en el mismo COMMIT: el outbox conserva
   intención, pero no garantiza visibilidad inmediata del aviso tras HTTP 200.
2. Revocación + escritura bajo lock de cuenta: introspección remota previa
   deja una ventana que el código actual cierra en seguimiento de incidencias.
3. Suministro bloqueado por Billing: una réplica eventual de identidad no es
   equivalente a FOR NO KEY UPDATE del padre original.
4. Triggers 011/012: deben conservar revocación/encolado sin conceder escritura
   libre sobre datos de otros dominios.

Posible adaptación transitoria: funciones SQL estrechas, versionadas, con
privilegios revisados y search_path fijo, invocadas dentro de la transacción.
No constituyen todavía independencia total de almacenes. Antes de adoptarlas,
probar permisos negativos, concurrencia y rollback, y documentar cómo retirarlas.
