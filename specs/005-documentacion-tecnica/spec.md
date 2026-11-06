# DOC-01 — documentación técnica coherente

Fecha2026-11-05. Estado: autorizado exclusivamente documental, sin código/infraestructura. Usuario: desarrollador que necesita instalar un laboratorio, probar cambios y distinguir historia de comportamiento actual.

## Requisitos

- FR-DOC-001: identificar versión Android1.2.0/código6, metadata npm1.0.0 y fuentes; no confundir versión fuente, release y despliegue.
- FR-DOC-002: describir arquitectura, clientes/Admin/Android, artefactos y flags sin cambiar comportamiento.
- FR-DOC-003: explicar Docker con identidad nueva, configuración local y puertos libres; separar laboratorio, fixtures sin piloto y migraciones incrementales.
- FR-DOC-004: documentar comandos TEST-01, prerrequisitos, evidencia previa y límites; CI-01 local5/6, remoto pendiente.
- FR-DOC-005: mantener constitución única, RPI, trazabilidad y auditoría previa a publicación con controles locales/remotos diferenciados.
- NFR-DOC-001: solo Markdown, sin secretos/datos privados, instalaciones, servicios, SQL o cambios de configuración.
- NFR-DOC-002: enlaces locales válidos y documentación consistente con fuentes leídas; no repetir Research general ni análisis de otro compañero.

## Aceptación y verificaciones

| Criterio | Verificación |
|---|---|
| AC-DOC-01 versiones/arquitectura correctas | DOC-T01 lectura Gradle/manifiestos/Docker/build scripts contra guías |
| AC-DOC-02 perfiles y arranque seguro explícitos | DOC-T02 comparación init/migraciones/fixtures/Compose; sin receta productiva genérica |
| AC-DOC-03 pruebas/CI sin éxitos inventados | DOC-T03 catálogo/checker existentes; comandos y cifras contra validation.md previos |
| AC-DOC-04 enlaces/trazabilidad completos | DOC-T04 validación enlaces de archivos Markdown modificados, IDs y tareas |
| AC-DOC-05 publicación condicionada, diff seguro | DOC-T05 auditoría, simulación parche sin escritura, diff/staged Markdown, revisión secretos y commit local |

Fuera de alcance: correcciones funcionales, cambios Docker/SQL/workflows/lockfiles, DOC exhaustiva endpoint por endpoint, despliegues, push/PR y análisis de calidad de otro compañero. CI-TASK-006 y controles remotos no son condiciones de cierre DOC-01; deben quedar explícitamente pendientes.
