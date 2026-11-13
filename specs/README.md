# SDD + RPI — estado actual

Nuevo avance: [MS-01](008-arquitectura-microservicios/spec.md), auditoría y propuesta
para migración a microservicios sobre `1be9c28`. Primera extracción Notifications
implementada; migración y validación integral pendientes;
[tareas](008-arquitectura-microservicios/tasks.md).

Referencia actualizada el 2026-11-11: `main` en `4f15173`. Las especificaciones siguientes conservan los estados y evidencias de sus avances originales, cuya base histórica es `d3d27d0`. La integración posterior incluye los PR #26, #28 y #30; [CI](../docs/CI.md) registra un run remoto exitoso del commit integrado en el PR #30.

| Avance | Estado / evidencia |
|---|---|
| PLAN-01 | Cerrado documentalmente, commit f7f21e6 |
| [PKG-01](001-empaquetado-cliente/spec.md) | Completado localmente, [validación](001-empaquetado-cliente/validation.md) |
| [DB-01](002-compatibilidad-recibos/spec.md) | Completado localmente, [validación](002-compatibilidad-recibos/validation.md) |
| [TEST-01](003-pruebas-automatizadas/spec.md) | Completado localmente, [inventario](003-pruebas-automatizadas/test-inventory.md) y [validación](003-pruebas-automatizadas/validation.md) |
| [DD-01](007-diccionario-datos/spec.md) | Completo documental estático, cuatro perfiles + Excel/DER; pg_catalog pendiente, [validación](007-diccionario-datos/validation.md) |
| [CAT-01](006-contrato-catalogo/spec.md) | Implementado, 9/9 contrato local; consolidación Node22/PG18 pendiente, [validación](006-contrato-catalogo/validation.md) |
| [CI-01](004-integracion-continua/spec.md) | Registro original: 5/6 tareas; ejecución remota posterior en [CI](../docs/CI.md). La [auditoría original](004-integracion-continua/prepublication.md) es histórica |
| [DOC-01](005-documentacion-tecnica/spec.md) | Documentación actualizada, [validación](005-documentacion-tecnica/validation.md) |

- [Constitución única](../.specify/memory/constitution.md)
- [Baseline histórica](baseline.md): evidencia vinculada a d3d27d0, no resultados posteriores atribuidos a ese SHA.
- [Trazabilidad](traceability.md)
- [Integración prevista de Spec Kit](spec-kit-integration.md): convenciones adoptadas manualmente, sin CLI instalada.
- [Guía SDD + RPI](../docs/SDD-RPI.md)

Cada avance mantiene spec/research/plan/tasks/validation; contratos, quickstart y modelo de datos según necesidad. Los números identifican carpetas, los IDs PKG/DB/TEST/CI/DOC identifican hallazgos/avances. TASK y T son namespaces separados de tareas y verificaciones. No generar ramas ni implementación con herramientas sin autorización.

La tabla describe el cierre registrado por cada avance; la evidencia posterior se identifica por su SHA y no modifica retrospectivamente los informes.

Antecedente histórico sobre `402990c`: la consolidación quedó bloqueada para publicación en esa sesión. CAT-TASK-06 y DD-TASK-06 bloqueados por entorno; CI-TASK-006 remoto pendiente. PR26: Docker idéntico y conflicto editorial demostrado en CHANGELOG. [Informe de cierre y procedimiento restante](../docs/pruebas/cierre-sdd-120.md). Ese informe no incorpora las integraciones ni el run remoto posteriores; consultar [CI actual](../docs/CI.md).
