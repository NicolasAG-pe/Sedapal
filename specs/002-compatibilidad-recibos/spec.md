# Feature Specification: DB-01 — compatibilidad de recibos

Feature Branch: chore/adopcion-sdd-rpi. Created: 2026-11-04.
Status: Draft / PLAN-01; implementación no autorizada.
Input: conservar migraciones, transacciones y pruebas productivas; corregir dependencia opcional de piloto.
Base: [baseline](../baseline.md). Constitución: [única](../../.specify/memory/constitution.md).

## User Scenarios & Testing

### US1 — Administrar recibos en perfil sin piloto (P1)
Como administrador necesito editar/anular recibos elegibles sin depender de tablas exclusivas del laboratorio.
Prueba independiente: API/servicio real sobre base sintética nueva, esquema base admitido y 007/008/014, sin 009/010.

- AC-DB-01: Dado un recibo impago válido sin pagos ni operaciones bloqueantes en ese perfil, cuando se edite, se conservará el contrato 200 y los datos permitidos; cuando se anule otro recibo elegible, quedará Anulado con 200. Ninguno devolverá 500 por tabla piloto ausente.
- AC-DB-02: Dado pago legacy, estado Pagado u operación bloqueante, editar/anular devolverá 409 sin modificar filas, incluso con estado Pagado sin respaldo histórico.
- AC-DB-03: Dadas únicamente operaciones no bloqueantes, no se impedirá editar/anular por esas operaciones. Probar cada estado admisible en fixtures válidos; no violar constraints para fabricar un caso imposible.

### US2 — Conservar bloqueos de laboratorio (P1)
Como administrador necesito que un piloto habilitado y vigente siga protegiendo su recibo.
Prueba independiente: misma operación sobre base nueva de laboratorio, separada del perfil sin piloto.

- AC-DB-04: Piloto habilitado y no vencido produce 409; vencido/deshabilitado no bloquea por sí mismo; pagos y operaciones siguen prevaleciendo.
- AC-DB-05: Falta de tabla obligatoria, permisos insuficientes o fallo de conexión nunca se interpretan como recibo libre. Se conserva respuesta pública saneada y rollback.

### US3 — Conservar integridad bajo concurrencia (P2)
Como mantenedor necesito que la corrección no altere las garantías transaccionales existentes.
Prueba independiente: regresiones de locks, concurrencia, rollback y permisos sobre fixtures aislados.

- AC-DB-06: Las carreras pertinentes conservan serialización/invariantes, sin cambios parciales ni conexiones abandonadas; se mantienen 401/403 y 404 para los casos correspondientes.
- AC-DB-07: Las pruebas existentes de compatibilidad 014 conservan guardas, datos, historial y restricciones financieras; no se modifica SQL versionado.

### Edge Cases

Recibo Pagado sin fila pagos; piloto exactamente en frontera de vencimiento (condición estricta >); varias operaciones en estados diferentes; rechazo de acceso sin consultar datos ajenos; tabla piloto presente pero inaccesible; tabla obligatoria ausente. Ningún caso de error se convierte en autorización implícita.

## Requirements

### Functional Requirements

- FR-DB-001: Editar/anular funcionarán sin control_piloto_yape en el perfil que la excluye.
- FR-DB-002: Se bloqueará por pagos legacy, estado Pagado y operaciones declarada, pendiente_verificacion, verificada_manual o acreditada_proveedor.
- FR-DB-003: Con tabla piloto presente, se bloqueará si habilitado y vence_en > clock_timestamp().
- FR-DB-004: Conservar autorización, validaciones, errores públicos, locks, revalidación y rollback existentes.
- FR-DB-005: La ausencia de tabla opcional se distinguirá de errores de tablas obligatorias o de acceso.

### Non-Functional Requirements

- NFR-DB-001: Sin cambios en migraciones, init.sql, health, contratos públicos ni módulos ajenos.
- NFR-DB-002: Comprobación de capacidad en conexión transaccional, sin caché global que mezcle perfiles y sin capturar 42P01 para seguir dentro de una transacción abortada.
- NFR-DB-003: Pruebas exclusivamente con nuevas bases sintéticas aisladas; sin credenciales o datos productivos.
- NFR-DB-004: Preservar límites de espera existentes; no afirmar mejora de rendimiento sin medición.

## Key Entities

Recibo, pago legacy, operación de pago, control de piloto opcional y suministro. Ver data-model.md; no se crea ni altera entidad.

## Success Criteria

SC-DB-001: AC-DB-01..07 comprobados en sus entornos aplicables, con SHA, comandos y resultado.
SC-DB-002: Cero errores por ausencia de tabla piloto en operaciones elegibles del perfil sin piloto; todos los bloqueos de negocio conservados.
SC-DB-003: Ninguna migración o configuración de producción cambia; ninguna prueba accede a instalaciones reales.

## Assumptions and Boundaries

No hay DDL concurrente durante operaciones normales; las migraciones requieren su ventana aparte. El perfil mínimo de prueba no representa por sí solo todas las capacidades de producción. Readiness y alineación del campo tiene_pago del listado quedan fuera y requieren especificación separada.
