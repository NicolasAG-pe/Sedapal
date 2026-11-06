# Integración futura de GitHub Spec Kit

Estado: no instalado ni configurado; documentos creados manualmente el 2026-11-04. Única constitución: [.specify/memory/constitution.md](../.specify/memory/constitution.md).

## Convenciones consultadas

Fuentes oficiales consultadas el 2026-11-04; volver a verificar versión y opciones al instalar:

- [Repositorio y guía](https://github.com/github/spec-kit)
- [Comandos del CLI](https://github.github.io/spec-kit/reference/core.html)
- [Integración OpenCode](https://github.github.io/spec-kit/integrations/opencode.html)
- [Integración Codex](https://github.github.io/spec-kit/integrations/codex.html)
- [Plantilla spec](https://github.com/github/spec-kit/blob/main/templates/spec-template.md)
- [Plantilla plan](https://github.com/github/spec-kit/blob/main/templates/plan-template.md)
- [Plantilla tasks](https://github.com/github/spec-kit/blob/main/templates/tasks-template.md)

Se adoptan constitución central, carpetas numeradas, historias priorizadas, aceptación, requisitos, investigación, revisión constitucional y tareas con IDs. No se copian plantillas vacías ni se afirma haber ejecutado comandos Spec Kit.

## Procedimiento propuesto, NO ejecutar en PLAN-01

1. Obtener autorización específica para instalar/inicializar; comprobar Git y preservar estos documentos y las instrucciones de agentes. Elegir y registrar versión de Spec Kit; revisar requisitos e instalación en su fuente oficial. No usar instalación flotante sin registrar versión.
2. Inspeccionar ayuda de esa versión y los archivos que generaría en una copia temporal aislada; revisar cambios antes de trasladarlos. Evitar --force por defecto. No generar Git, cambiar rama ni reemplazar la constitución existente.
3. La documentación consultada propone `specify init --here --integration opencode` para inicialización y `specify integration install codex` para añadir el segundo agente. Son ejemplos futuros sujetos a validar opciones y escritura en el entorno; no son comandos ejecutados ni autorizados.
4. OpenCode usa comandos bajo .opencode/commands/; Codex usa skills bajo .agents/skills/. Son adaptadores de los mismos documentos, sin constituciones independientes. Revisar compatibilidad de instalación múltiple, archivos generados y eventos antes de habilitarlos. No registrar hooks/eventos automáticamente.
5. En versiones que exijan ramas numeradas, configurar la resolución de feature documentada por esa versión o seleccionar manualmente la carpeta; validar que plan/tasks no creen una rama nueva. No asumir que esta rama con dos specs se detecta automáticamente.
6. Comparar diff generado, comprobar que ambas integraciones leen la constitución central y una especificación elegida; revisar permisos de escritura porque .agents/ y .codex/ son de solo lectura en esta sesión. No modificar esas carpetas mediante alternativas para eludir permisos.
7. Mantener flujo Research → spec/plan/tasks → revisión del propietario. La integración no autoriza implementar, publicar, desplegar ni convertir tareas en issues remotos.

La sintaxis de agentes puede evolucionar. No reutilizar instrucciones antiguas --ai o prompts de Codex como si fueran universales; comprobar la versión seleccionada y sus guías oficiales. La instalación es una tarea separada y no es prerrequisito de estas dos correcciones.
