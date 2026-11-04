# Matriz de trazabilidad — PLAN-01

Base de código: d3d27d068a53dff8e536d690e615f858722157bb. Fecha: 2026-11-04.
Estado común: especificado; pruebas/cambios futuros NO ejecutados. No hay commit de corrección ni claves Sonar atribuidas. Tareas PKG-TASK-nnn/DB-TASK-nnn y pruebas PKG-Tnn/DB-Tnn son namespaces diferentes; las pruebas PKG-Txx/DB-Txx son IDs globales propuestos.

| Hallazgo / evidencia | Requisitos | Aceptación | Pruebas propuestas | Tareas | Modificación futura prevista |
|---|---|---|---|---|---|
| PKG-01a / E, archivo fuera de contexto | FR-PKG-001; NFR-PKG-001 | AC-PKG-01 | PKG-T01/PKG-T02 | PKG-TASK-002..PKG-TASK-005 | Frontend/Dockerfile.dockerignore; test nuevo |
| PKG-01b / E, dos módulos omitidos | FR-PKG-002 | AC-PKG-02/03 | PKG-T02/PKG-T05 | PKG-TASK-003..PKG-TASK-006 | Frontend/Dockerfile; scripts/test/client-packaging.test.cjs |
| PKG-01c / E, verificador incompleto | FR-PKG-003 | AC-PKG-04 | PKG-T03 | PKG-TASK-007/PKG-TASK-008 | scripts/verify-client-runtime.js; test nuevo |
| Regresión separación/destinos | FR-PKG-004; NFR-PKG-002/003 | AC-PKG-05 | PKG-T03/PKG-T04 | PKG-TASK-003/PKG-TASK-007..PKG-TASK-009 | build-web solo validado; test nuevo |
| DB-01 / E, dependencia opcional incondicional | FR-DB-001/005; NFR-DB-002 | AC-DB-01 | DB-T01/DB-T07 | DB-TASK-002..DB-TASK-006 | Backend/receipt-transactions.js; Backend/test/receipt-profile-compat.cjs |
| Bloqueos legacy/estado/operaciones | FR-DB-002/004 | AC-DB-02/03 | DB-T02/DB-T07 | DB-TASK-003/DB-TASK-004/DB-TASK-006 | Servicio localizado y test nuevo |
| Protección de piloto laboratorio | FR-DB-003; NFR-DB-001 | AC-DB-04 | DB-T03 | DB-TASK-005/DB-TASK-006 | Servicio localizado; migraciones intactas |
| Fallo cerrado y aislamiento | FR-DB-005; NFR-DB-002/003 | AC-DB-05 | DB-T04 | DB-TASK-001/DB-TASK-005/DB-TASK-006 | Test nuevo; no datos existentes |
| Regresión transaccional y acceso | FR-DB-004; NFR-DB-004 | AC-DB-06 | DB-T05/DB-T07 | DB-TASK-004/DB-TASK-007/DB-TASK-009 | receipt-concurrency.cjs solo ampliar si hace falta |
| Compatibilidad productiva existente | NFR-DB-001/003 | AC-DB-07 | DB-T06 | DB-TASK-008/DB-TASK-009 | payment-production-compat.cjs y quality-migrations.cjs reutilizados |

Especificaciones: [PKG-01](001-empaquetado-cliente/spec.md), [DB-01](002-compatibilidad-recibos/spec.md). Cada SC exige sus AC completos, diff dentro del alcance y resultado documentado. Los NFR se revisan además por diff, aislamiento y ausencia de secretos; no se acreditan solo por pruebas positivas.

## Hallazgos separados del alcance inmediato

| ID de referencia | Estado | Tratamiento futuro |
|---|---|---|
| DB-02 / paridad init | E: perfiles distintos; defecto funcional no establecido | Especificar instalación/capacidades antes de cambiar init.sql |
| DB-03 / migraciones sin pagos | E: tabla en base; no prueba defecto | Documentar prerrequisito de base; no construir perfil ficticio solo con migraciones |
| HEALTH-01 | E: health limitado a conexión | Nueva especificación de readiness si se aprueba |
| TEST-01 / CI-01 | Inventario y automatización pendientes | Clasificar ejecutables/fixtures, luego jobs aislados; no agregar todos los archivos |
| DOC-01 / DEBT-* | Deuda contextual | Actualizar documentos afectados; sin refactor/archivo de activos aquí |
| SEC-01 del informe | Campo tiene_pago del listado solo consulta pagos | Revisar semántica y UX por separado; no elevar a vulnerabilidad sin evidencia |

## SonarQube — sin atribución actual

| Referencia | Dato recibido | Estado y siguiente evidencia |
|---|---|---|
| SON-01 | 85 seguridad | Histórico no confirmado: export de reglas/issues/hotspots, filtros, SHA y versión |
| SON-02 | 141 abiertos; 56 fiabilidad; 18 mantenibilidad | No asumir categorías sumables; recuperar alcance y clasificación |
| TEST-02 | Cobertura 0,0 % | Medición/importación desconocidas; recuperar informe y configuración |
| SON-03 | Duplicación 1,3 % | Histórico sin SHA; recuperar análisis atribuible |

Ninguna referencia SON es una clave de issue real. No vincular PKG/DB con una regla Sonar hasta contar con evidencia. En ejecución futura añadir por caso: SHA previo y corregido, comando, entorno, fecha, resultado, ruta de informe saneado, commit/PR cuando estén autorizados y clave Sonar únicamente si existe correspondencia verificada. No versionar exportaciones crudas sensibles.
