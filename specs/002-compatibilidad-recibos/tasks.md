# Tasks — DB-01

Input: spec.md, plan.md, research.md, data-model.md, contracts/receipts.md.
Autorización condicional satisfecha por cierre PKG-01 en 4931f2f. Tareas verificadas en validation.md.

## Prerrequisitos

- [x] DB-TASK-001 Confirmar autorización y entorno aislado nuevo; revisar guardas en Backend/test/email-schema.cjs y prerrequisitos en Backend/test/email-api.cjs sin cargar .env.
- [x] DB-TASK-002 Definir fixtures de perfiles en Backend/test/receipt-profile-compat.cjs y comprobar que la separación de base anterior a 007 existe; no cambiar init.sql ni migraciones.

## US1 — Perfil sin piloto

- [x] DB-TASK-003 [US1] Crear DB-T01/DB-T02 en Backend/test/receipt-profile-compat.cjs y reproducir fallo previo con PostgreSQL real aislado.
- [x] DB-TASK-004 [US1] Añadir DB-T07 en ese archivo con harness HTTP aislado; adaptar helper existente solo si hace falta, documentando archivos e impacto antes de editar.

## US2 — Piloto y errores

- [x] DB-TASK-005 [US2] Añadir DB-T03/DB-T04 en Backend/test/receipt-profile-compat.cjs: vigencia, obligaciones, permisos y rollback con fixtures separados.
- [x] DB-TASK-006 [US1] [US2] Modificar solo tienePago en Backend/receipt-transactions.js para consultar capacidad opcional dentro de la transacción; conservar locks, errores y migraciones. Ejecutar DB-T01..DB-T04/DB-T07.

## US3 — Integridad conservada

- [x] DB-TASK-007 [US3] Ejecutar DB-T05 en Backend/test/receipt-concurrency.cjs; ampliar caso del camino nuevo únicamente si la cobertura existente no verifica su invariante.
- [x] DB-TASK-008 [US3] Ejecutar DB-T06 en Backend/test/payment-production-compat.cjs y Backend/test/quality-migrations.cjs; registrar todos los resultados y resolver fallos.

## Cierre

- [x] DB-TASK-009 Revisar AC-DB-01..07, ramas del cambio y ausencia de regresión de autorización; actualizar quickstart.md y specs/traceability.md con SHA/entorno/resultados.
- [x] DB-TASK-010 Actualizar CHANGELOG.md, revisar diff/contenido preparado y registrar commit local independiente. Push/Draft PR excluidos expresamente por el propietario.

Dependencias: DB-TASK-001 → DB-TASK-002 → DB-TASK-003/DB-TASK-004/DB-TASK-005 → DB-TASK-006 → DB-TASK-007/DB-TASK-008 → DB-TASK-009 → DB-TASK-010. No se ejecuta paralelismo ni se crean bases en PLAN-01. El éxito de servicio sin HTTP no completa DB-TASK-004 ni AC correspondientes.

Cierre local: DB-T01..DB-T07 aprobados en alcance documentado, sin publicación. No se modificaron helpers, pruebas anteriores ni SQL versionado.
