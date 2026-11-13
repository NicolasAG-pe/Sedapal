# Research MS-01

Evidencia principal: [auditoría](../../docs/microservices/01-auditoria.md) y
[matriz](../../docs/microservices/03-matriz-endpoints.md). Se examinó código,
no solo la documentación histórica. 75 rutas contrastadas con registro runtime.

Hallazgos: OTP activa vencimiento desde worker; incidencias escriben notificación
en la misma transacción; autorización se revalida bajo locks; triggers atraviesan
dominios; suministros participa en serialización de recibos; resumen y usuarios
administrativos requieren composición. Workers separados no implican propiedad
independiente de datos. PDF es responsabilidad del cliente.

Alternativas: transporte de notificaciones separado primero; conservar Auth
como propietario de estados de seguridad; mantener recibos/pagos juntos;
Realtime independiente. Outbox PostgreSQL antes de añadir un broker.

Incertidumbres: protocolo concurrente entre Auth y dominios, migración de
triggers, equivalencia de consistencia de avisos, capacidades/costos efectivos
de hosting y automatizaciones externas. No se leyeron secretos ni bases remotas.
