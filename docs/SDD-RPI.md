# SDD integrado con RPI

La única constitución normativa es [.specify/memory/constitution.md](../.specify/memory/constitution.md). [AGENTS.md](../AGENTS.md) y la autorización explícita del propietario delimitan cada avance. La documentación de referencia corresponde a `main` en `4f15173` (2026-11-11).

[specs/](../specs/README.md) contiene carpetas numeradas por avance: spec.md define requisitos/aceptación; research.md evidencia, incertidumbres y decisiones; plan.md solución y Constitution Check; tasks.md tareas verificables; validation.md resultados reales. contracts/, quickstart.md y data-model.md se añaden cuando corresponden. No crear una segunda constitución ni repetir documentos existentes.

RPI por avance: Research específico reutiliza evidencia y contrasta las fuentes afectadas; Plan define alcance, contratos, riesgos y pruebas; Implement requiere autorización y cambios pequeños; Validate registra resultados y pendientes, revisa diff/secretos, actualiza trazabilidad/CHANGELOG y hace commit cuando procede. Cada avance completo requiere commit, push y Draft PR hacia `main`, tras comprobar automatizaciones. Merge y despliegues requieren autorización explícita, según AGENTS.md.

La [baseline](../specs/baseline.md) conserva referencia d3d27d0; no convertir resultados posteriores en pruebas de ese SHA. [Trazabilidad](../specs/traceability.md) enlaza hallazgos, requisitos, aceptación, pruebas y cambios. E = lectura estática; P = prueba ejecutada; H = hipótesis; N = destino no comprobado. Marcar tareas solo con evidencia; los prefijos TASK designan tareas y T designa verificaciones.

Se utilizan convenciones documentales de GitHub Spec Kit, redactadas manualmente. No se instaló su CLI ni se afirma que sus comandos estén integrados con OpenCode/Codex. [Integración prevista](../specs/spec-kit-integration.md). Mantener la rama autorizada en lugar de crear ramas automáticamente.

Las carpetas de especificaciones conservan la evidencia y las tareas de sus avances originales. Para el código integrado y la ejecución remota posterior, consultar [el índice de especificaciones](../specs/README.md) y [CI](CI.md); no atribuir un resultado posterior a un SHA histórico.
