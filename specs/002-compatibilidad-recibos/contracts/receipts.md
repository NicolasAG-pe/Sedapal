# Contrato de recibos — DB-01

## API conservada

PATCH /api/admin/recibos/:id: conservar cuerpo y validación existentes (periodo, fecha_emision, fecha_vencimiento, monto, consumo_m3); el suministro se resuelve desde el recibo bloqueado. No admitir cambiar pertenencia mediante el cuerpo.

PATCH /api/admin/recibos/:id/anular: conservar contrato actual. Éxito 200 con envoltura existente estado/recibo. Conservar 400 por entrada inválida, 401 sin autenticación, 403 sin rol, 404 por inexistente, 409 por bloqueo/conflicto y manejo público existente de errores internos/timeout. No devolver SQL ni credenciales. La corrección no altera rutas ni formatos.

## Decisión de bloqueo

Se bloquea si existe pago legacy O operación en los cuatro estados bloqueantes O piloto habilitado vigente (solo si existe su tabla) O estado del recibo Pagado. El orden puede conservarse; todos los casos deben estar cubiertos. Tablas pagos/operaciones y demás base requerida no son opcionales.

La comprobación y consulta opcional deben usar el mismo client que mantiene los locks. Conservar BEGIN, bloqueos, revalidación, timeouts, COMMIT/ROLLBACK y release. No recuperarse de relación inexistente continuando una transacción abortada. Errores de acceso no equivalen a ausencia legítima.

## Pruebas implementadas y reutilizadas

- DB-T01: Backend/test/receipt-profile-compat.cjs (nuevo propuesto), edición y anulación exitosas en P-PROD-MIN sin piloto; reproducir fallo antes del cambio.
- DB-T02: mismo archivo, matriz legacy/Pagado/operaciones bloqueantes/no bloqueantes, sin violar constraints de fixtures.
- DB-T03: mismo archivo, P-LAB con piloto habilitado vigente, vencido y deshabilitado; usar reloj/fechas controlables sin esperas largas.
- DB-T04: mismo archivo, tabla obligatoria ausente y acceso fallido; comprobar fallo cerrado y rollback. Usar fixture nuevo independiente para cada alteración, nunca datos existentes.
- DB-T05: Backend/test/receipt-concurrency.cjs, regresiones existentes de locks, rollback, permisos e históricos; ampliar solo si hace falta verificar el camino nuevo.
- DB-T06: Backend/test/payment-production-compat.cjs y quality-migrations.cjs, regresión de compatibilidad/guardas; no modificar expectativas para ocultar fallos.
- DB-T07: pruebas HTTP con harness aislado adaptado, ambos PATCH en perfil sin piloto, incluyendo 401/403/404 y ausencia de filtración de SQL.

IDs no son resultados. Implementar primero DB-T01 para caracterización; no es suficiente simular todas las consultas para acreditar compatibilidad PostgreSQL.

Resultados DB-T01..DB-T07 aprobados en [validation.md](../validation.md). DB-T04 distingue ausencia opcional, dependencias obligatorias y permisos; errores SQL no capturados para permitir operaciones.
