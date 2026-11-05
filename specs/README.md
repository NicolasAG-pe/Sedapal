# SDD + RPI — estado actual

Actualizado2026-11-05. Rama chore/adopcion-sdd-rpi, base histórica d3d27d0. Solo commits locales; no push/PR/despliegues autorizados en esta sesión.

| Avance | Estado / evidencia |
|---|---|
| PLAN-01 | Cerrado documentalmente, commit f7f21e6 |
| [PKG-01](001-empaquetado-cliente/spec.md) | Completado localmente, [validación](001-empaquetado-cliente/validation.md) |
| [DB-01](002-compatibilidad-recibos/spec.md) | Completado localmente, [validación](002-compatibilidad-recibos/validation.md) |
| [TEST-01](003-pruebas-automatizadas/spec.md) | Completado localmente, [inventario](003-pruebas-automatizadas/test-inventory.md) y [validación](003-pruebas-automatizadas/validation.md) |
| [CI-01](004-integracion-continua/spec.md) |5/6 tareas, remoto pendiente; [auditoría de publicación](004-integracion-continua/prepublication.md) incompleta |
| [DOC-01](005-documentacion-tecnica/spec.md) | Documentación actualizada, [validación](005-documentacion-tecnica/validation.md) |

- [Constitución única](../.specify/memory/constitution.md)
- [Baseline histórica](baseline.md): evidencia vinculada a d3d27d0, no resultados posteriores atribuidos a ese SHA.
- [Trazabilidad](traceability.md)
- [Integración prevista de Spec Kit](spec-kit-integration.md): convenciones adoptadas manualmente, sin CLI instalada.
- [Guía SDD + RPI](../docs/SDD-RPI.md)

Cada avance mantiene spec/research/plan/tasks/validation; contratos, quickstart y modelo de datos según necesidad. Los números identifican carpetas, los IDs PKG/DB/TEST/CI/DOC identifican hallazgos/avances. TASK y T son namespaces separados de tareas y verificaciones. No generar ramas ni implementación con herramientas sin autorización.

El estado de la tabla prevalece sobre descripciones históricas de sesiones anteriores, que se conservan en sus informes. El análisis de calidad pertenece a otro compañero y queda fuera de este avance.
