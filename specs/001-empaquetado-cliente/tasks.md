# Tasks — PKG-01

Input: spec.md, research.md, plan.md, contracts/runtime.md.
Estado: implementación autorizada; validación local completada. Evidencia en validation.md.

## Prerrequisitos

- [x] PKG-TASK-001 Confirmar autorización, Git y disponibilidad de herramientas; revisar specs/baseline.md y no cargar .env.
- [x] PKG-TASK-002 Inventariar recursos locales/transitivos de Frontend/index.html y scripts/build-web.js en contracts/runtime.md antes de afirmar completitud.

## US1 — Artefacto completo

- [x] PKG-TASK-003 [US1] Crear scripts/test/client-packaging.test.cjs: PKG-T02/PKG-T04; validar salida real temporal y registrar fallo por scripts omitidos.
- [x] PKG-TASK-004 [US1] Ejecutar PKG-T01 con Frontend/Dockerfile y contexto real, registrando éxito o fallo observado sin tocar instalaciones existentes. El fallo de build supuesto inicialmente no se reprodujo.
- [x] PKG-TASK-005 [US1] Corregir únicamente listas de Frontend/Dockerfile y Frontend/Dockerfile.dockerignore; ejecutar PKG-T01/PKG-T02/PKG-T04 y registrar evidencia en quickstart.md.
- [x] PKG-TASK-006 [US1] Ejecutar PKG-T05 para carga y flujos afectados con servidor/navegador temporales y datos sintéticos; documentar resultados en quickstart.md.

## US2 — Omisiones detectables

- [x] PKG-TASK-007 [US2] Añadir PKG-T03 en scripts/test/client-packaging.test.cjs: controles positivo/negativos para los tres módulos y separación Admin; comprobar fallo pertinente antes de cambiar el verificador.
- [x] PKG-TASK-008 [US2] Corregir scripts/verify-client-runtime.js y verificar PKG-T03 más regresiones pertinentes existentes, sin relajar controles previos.

## Cierre

- [x] PKG-TASK-009 Revisar AC-PKG-01..05 y actualizar specs/traceability.md, quickstart.md y CHANGELOG.md con resultados reales cuando corresponda al avance autorizado.
- [x] PKG-TASK-010 Inspeccionar diff/contenido preparado por secretos y registrar el cierre en commit local. Push/Draft PR expresamente fuera de la autorización vigente, no requeridos para el cierre local.

Dependencias: PKG-TASK-001 → PKG-TASK-002 → PKG-TASK-003/PKG-TASK-004 → PKG-TASK-005 → PKG-TASK-006; PKG-TASK-007 precede PKG-TASK-008; PKG-TASK-009 requiere ambas historias. Ejecución secuencial prevista; no se solicita delegación. No mezclar corrección DB-01 en el mismo avance.

PKG-TASK-006 verificada con Firefox y Nginx temporales; PKG-TASK-009 con AC completos; PKG-TASK-010 limitado al cierre local por instrucción del propietario. No se afirma publicación. Resultados, fallos de entorno resueltos y límites en validation.md.
