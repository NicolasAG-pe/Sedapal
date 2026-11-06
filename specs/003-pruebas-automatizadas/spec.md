# Feature Specification: TEST-01

Branch: chore/adopcion-sdd-rpi | Fecha: 2026-11-05 | Estado: completado localmente, ver validation.md.
Constitución: [única](../../.specify/memory/constitution.md).

## Historias y aceptación

US1 (P1): mantenedor ejecuta una entrada segura reproducible.
- AC-TEST-01: npm test ejecuta solo listas revisadas unit/contract, incluye PKG-01 y no activa BD/live/Android/despliegues. No hereda secretos ni destinos privados.
- AC-TEST-02: inventario cubre todos los archivos existentes, distingue helpers de ejecutables y muestra prerequisitos, riesgo, referencias, solapamientos y archivos sin entrada npm directa; no desaparece ningún archivo previo.
US2 (P1): mantenedor ejecuta integración explícita y conserva señales de fallo.
- AC-TEST-03: test:integration requiere opt-in aislado y PG18, incluye DB-01; validación en instancia nueva sintética, nunca producción.
- AC-TEST-04: comandos inválidos, prerrequisitos ausentes y pruebas fallidas producen salida no cero; el runner no acepta rutas arbitrarias desde CLI ni oculta errores.
US3 (P2): mantenedor consulta evidencia y cobertura.
- AC-TEST-05: test:unit, test:contract y test:e2e separan requisitos; E2E nunca entra en npm test. La ausencia de herramientas opcionales se registra, no se presenta como éxito.
- AC-TEST-06: cobertura nativa medida con Node22 y reportes opcionales, SHA/entorno/grupos/denominador explícitos; sin umbrales arbitrarios ni porcentaje global inventado.

## Requisitos y límites

FR-TEST-001: catálogo completo y verificable. FR-TEST-002: selección explícita. FR-TEST-003: propagación de exit codes. FR-TEST-004: reportes y cobertura atribuibles. NFR-TEST-001: cero cambios funcionales, migraciones, dependencias nuevas, producción o archivos de pruebas eliminados. NFR-TEST-002: fail closed y entorno sintético, bloqueo de red no local como defensa adicional (no un sandbox de seguridad completo).

Obligatorias para cierre: inventario, nuevas pruebas del runner, listas unit/contract y cinco regresiones de integración elegidas. Suites históricas, live, navegador integral, dispositivos y todas las integraciones suplementarias se inventarían pero no pasan a ser obligatorias por existir. PKG-T05 conserva evidencia previa; se valida el guard y selección del comando E2E sin repetir ese flujo sin cambios. TEST-01 organiza y valida este conjunto, no certifica toda prueba histórica.

Éxito: todos los AC comprobados, diff revisado, ningún fallo obligatorio pendiente. CI-01 permanece condicionado a este cierre.
