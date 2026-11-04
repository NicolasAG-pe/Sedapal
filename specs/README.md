# PLAN-01 — SDD y RPI

Fecha: 2026-11-04. Estado: cierre documental aprobado; IMPLEMENT autorizado exclusivamente para PKG-01, sin push ni servicios nuevos.

- [Constitución única](../.specify/memory/constitution.md)
- [Baseline técnica](baseline.md)
- [Integración futura de Spec Kit](spec-kit-integration.md)
- [Trazabilidad](traceability.md)
- [PKG-01](001-empaquetado-cliente/spec.md)
- [DB-01](002-compatibilidad-recibos/spec.md)

## Organización

Cada carpeta numerada contiene spec.md (qué y aceptación), research.md (evidencia y decisiones), plan.md (cómo y puertas), tasks.md (trabajo futuro sin ejecutar), contracts/ (interfaces e invariantes) y quickstart.md (validación futura). DB-01 añade data-model.md porque involucra entidades persistidas; PKG-01 no cambia modelo de datos.

Se adaptan las secciones de las plantillas oficiales de Spec Kit, redactadas manualmente, sin instalar su CLI ni generar integraciones. Los números identifican especificaciones y no sustituyen los IDs PKG-01/DB-01. Se conserva la rama chore/adopcion-sdd-rpi como excepción explícita al nombre habitual de rama por especificación. No se afirma compatibilidad de ejecución automática hasta integrar y validar la herramienta.

## Orden y alcance

PLAN-01 → revisión del propietario → IMPLEMENT de PKG-01 → DB-01 → inventario de pruebas → CI → Sonar atribuible → documentación afectada. Recuperar metadatos históricos de Sonar puede hacerse antes con autorización, sin bloquear las correcciones.

CI futura: separar unitarias/contratos sin servicios, integración PostgreSQL aislada, navegador y Android según alcance. Nada de envíos live, dispositivos, credenciales reales ni despliegues automáticos. Primero inventariar comandos y dependencias existentes; no adoptar node --test sobre todos los archivos. Cobertura y herramientas se decidirán con medición y aprobación posterior.

## Cierre de esta fase

Revisar enlaces, consistencia de IDs, ausencia de tareas IMPLEMENT marcadas, diff documental, git status y git diff --stat. Los archivos nuevos sin preparar no aparecen en diff --stat: complementar con inventario explícito. No instalar, ejecutar pruebas, actualizar runtime ni publicar. CHANGELOG registra el cierre documental. Commit local autorizado; push y PR prohibidos en esta sesión.

Identificadores: PKG-TASK-nnn y DB-TASK-nnn designan tareas; PKG-Tnn y DB-Tnn designan pruebas. Cierre aprobado por el propietario el 2026-11-04.

PKG-01: corrección aplicada y pruebas locales aprobadas; validación parcial, ver [informe](001-empaquetado-cliente/validation.md). No iniciar DB-01 ni publicar.
