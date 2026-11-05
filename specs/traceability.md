# Matriz de trazabilidad — PLAN-01

Base de código: d3d27d068a53dff8e536d690e615f858722157bb. Fecha: 2026-11-04.
Estado actual2026-11-05: PKG-01, DB-01 y TEST-01 completados localmente; CI-01 implementado5/6, remoto pendiente; DOC-01 actualizado con validación documental. Las secciones de ejecución parcial son historia de cada avance, no el estado actual. Sin claves de análisis atribuidas. TASK identifica tareas; T identifica verificaciones. Tabla inicial conservada como planificación de PLAN-01.

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
| TEST-01 / CI-01 | Inventario y suites completados; CI remoto pendiente | Ver cierres y auditoría de publicación |
| DOC-01 / DEBT-* | Guías actualizadas por DOC-01; refactor fuera de alcance | Ver trazabilidad DOC-01; no archivar activos |
| SEC-01 del informe | Campo tiene_pago del listado solo consulta pagos | Revisar semántica y UX por separado; no elevar a vulnerabilidad sin evidencia |

## SonarQube — sin atribución actual

| Referencia | Dato recibido | Estado y siguiente evidencia |
|---|---|---|
| SON-01 | 85 seguridad | Histórico no confirmado: export de reglas/issues/hotspots, filtros, SHA y versión |
| SON-02 | 141 abiertos; 56 fiabilidad; 18 mantenibilidad | No asumir categorías sumables; recuperar alcance y clasificación |
| TEST-02 | Cobertura 0,0 % | Medición/importación desconocidas; recuperar informe y configuración |
| SON-03 | Duplicación 1,3 % | Histórico sin SHA; recuperar análisis atribuible |

Ninguna referencia SON es una clave de issue real. No vincular PKG/DB con una regla Sonar hasta contar con evidencia. En ejecución futura añadir por caso: SHA previo y corregido, comando, entorno, fecha, resultado, ruta de informe saneado, commit/PR cuando estén autorizados y clave Sonar únicamente si existe correspondencia verificada. No versionar exportaciones crudas sensibles.

## Ejecución PKG-01

[Informe y comandos](001-empaquetado-cliente/validation.md). PKG-T02/PKG-T03/PKG-T04 aprobadas con 9 casos nuevos; 8 regresiones existentes aprobadas. PKG-T01 ejecutada antes/después: ambos builds terminan; el defecto confirmado es el artefacto incompleto previo, no un fallo de build reproducido. AC-PKG-01/04/05 comprobados en el alcance local; AC-PKG-02 parcial (archivos/contenido sí, HTTP/MIME pendiente); AC-PKG-03 y PKG-T05 pendientes por prohibición de servicios. SC-PKG-001 no satisfecho; no cerrar PKG-01. Cambios reales: Dockerfile, su ignore, verificador y test nuevo; sin cambios a build-web ni infraestructura. El commit local de avance se identifica por ser el siguiente commit de PKG-01 después de f7f21e6; hash exacto comprobado en el cierre de sesión, sin autorreferencia dentro del commit.

## Cierre local PKG-01

Sobre 53a9d33: Node 22.23.4, 17/17 pruebas; PKG-T05, 10 comprobaciones HTTP/MIME y Firefox aprobadas. AC-PKG-01..05 y SC satisfechos en alcance local. Todos los PKG-TASK completados con publicación excluida expresamente; ver validation.md para fallos de entorno resueltos y límites de fixtures. DB-01 ahora autorizado condicionalmente, aún sin ejecución al registrar este cierre.

## Cierre local DB-01

PKG-01 cerrado previamente en 4931f2f; DB-01 implementado y validado después, con autorización condicional cumplida. Requisitos FR-DB-001..005 y NFR-DB-001..004: nuevo Backend/test/receipt-profile-compat.cjs + suites existentes; todos AC-DB-01..07 aprobados. Único cambio funcional: tres líneas en tienePago; sin cambios SQL/infraestructura. Suite principal: 54 casos, 53 aprobados/0 fallidos/1 condicional; el caso alternativo se ejecutó aparte con 1 aprobado. Diez DB-TASK verificados en cierre local sin publicación. [Evidencia, entorno y límites](002-compatibilidad-recibos/validation.md). No hay issue Sonar atribuido todavía.

## TEST-01

| Requisito / aceptación | Cambio | Verificación | Estado |
|---|---|---|---|
| FR-TEST-001 / AC-TEST-02 | test-catalog + test-inventory.json/md | TEST-T01, npm run test:inventory, conservación100 archivos anteriores | Aprobado |
| FR-TEST-002 / AC-TEST-01/03/05 | package.json, runner, guard | 128 suite segura; 62 integración y1 omisión condicional acreditada antes; selección/guards de comandos | Aprobado en alcance |
| FR-TEST-003 / AC-TEST-04 | test-runner.test.cjs | TEST-T02..05: entorno, destino externo, fallo real y salida no cero | Aprobado |
| FR-TEST-004 / AC-TEST-06 | cobertura/reportes V8 y JUnit nativos | baseline47,72% líneas/82,66% ramas/62,92% funciones, solo fuentes cargadas de suite segura | Medido |

NFR-TEST-001/002: diff sin producto/migraciones/dependencias nuevas, código read-only y recursos sintéticos; guard es defensa adicional, no sandbox. [Inventario](003-pruebas-automatizadas/test-inventory.md), [evidencia y límites](003-pruebas-automatizadas/validation.md). CI aún no ejecutado remotamente.

## CI-01

| Criterio | Cambio / comprobación | Estado |
|---|---|---|
| AC-CI-01 / FR-CI-003 | ci.yml con Node22/npm ci Backend, acciones por SHA; YAML parser real y comparación151 versiones lock | Aprobado localmente |
| AC-CI-02 / FR-CI-002 | jobs safe→integration; comandos acreditados por TEST-01, PKG-01/DB-01 incluidos | Aprobado diseño/scripts; service remoto pendiente |
| AC-CI-03/04 | contents:read, checkout sin credenciales, eventos no privilegiados, fixtures PG18/tmpfs y reportes acotados | Revisión local/checker aprobados |
| AC-CI-05 / NFR-CI-001/002 | colaboración sin cambios en ramas ajenas, sin cambios funcionales/deploy; validation.md distingue ejecución local/remota | Aprobado localmente |

Cinco tareas CI locales verificadas; CI-TASK-006 (run real GitHub) pendiente hasta autorización de publicación y revisión de automatizaciones externas. [Diseño](004-integracion-continua/spec.md), [evidencia](004-integracion-continua/validation.md). No hay ejecución remota ni green de GitHub acreditado.

## DOC-01 y auditoría previa

| Requisito / aceptación | Documentos / cambio | Verificación | Estado |
|---|---|---|---|
| FR-DOC-001/002; AC-DOC-01 | README, docs/ARCHITECTURE, Android, API y SECURITY | DOC-T01 fuentes/alcance histórico | Documentado |
| FR-DOC-003; AC-DOC-02 | docs/LOCAL-DEVELOPMENT, DATABASE | DOC-T02 Compose/init/migraciones/fixtures | Documentado; sin SQL ejecutado |
| FR-DOC-004; AC-DOC-03 | docs/TESTING, CI | DOC-T03 catálogo y checker; resultados previos enlazados | Local; run remoto pendiente |
| FR-DOC-005; AC-DOC-04/05 | docs/SDD-RPI, specs/README, prepublication, constitución única | DOC-T04/05 enlaces, diff y simulación | Ver validación DOC-01 |

[Especificación](005-documentacion-tecnica/spec.md), [tareas](005-documentacion-tecnica/tasks.md), [validación](005-documentacion-tecnica/validation.md). [Auditoría CI](004-integracion-continua/prepublication.md): Vercel sin exclusión de esta rama, detalles de raíces/hooks incompletos; Render/settings Apps no comprobados. No habilita publicación ni cierra CI-TASK-006. No se cambió configuración de proveedores ni el trabajo de otro compañero.
