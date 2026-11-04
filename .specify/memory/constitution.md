# Constitución de Hidro-Mejora

Versión: 1.0.1 | Redacción: 2026-11-04 | Aprobación del propietario: 2026-11-04 | Última modificación: 2026-11-04
Estado: PLAN-01 aprobado para cierre documental y commit local. IMPLEMENT autorizado exclusivamente para PKG-01; DB-01 sigue pendiente.

## Principios fundamentales

### I. Evolución compatible y mínima
Conservar repositorio, historial, arquitectura, clientes y funcionalidades. Cada avance resolverá una causa concreta. No introducir frameworks, reorganizaciones grandes, actualizaciones masivas ni cambios de esquema ajenos a su especificación.

### II. Evidencia antes de conclusiones
Toda baseline identifica SHA, rama, fecha y método. Diferenciar E (evidencia estática), P (prueba ejecutada con resultado), H (hipótesis) y N (destino no verificado). Documentación histórica y métricas Sonar no acreditan el estado actual. Una tarea planificada nunca cuenta como prueba aprobada.

### III. SDD integrado con RPI
Research registra hechos, alternativas e incertidumbre; Plan define historias, requisitos, contratos, aceptación y tareas; Implement requiere autorización explícita. Las especificaciones viven en specs/ y esta es la única constitución normativa. No crear otra constitución en specs/ ni duplicarla en instrucciones de agentes.

### IV. Contratos y verificación proporcionada
Cada corrección debe demostrar el defecto y verificar regresiones pertinentes. Reutilizar pruebas existentes; justificar cualquier modificación de sus expectativas. No ocultar fallos eliminando casos. Inventariar ejecutables, fixtures y prerrequisitos antes de agregarlos. Medir cobertura antes de establecer umbrales; no sustituye las pruebas de comportamiento.

### V. Integridad y separación de entornos
Conservar migraciones aplicadas y lógica transaccional. Laboratorio y producción son perfiles diferentes. Probar SQL únicamente en una base nueva y aislada con fixtures sintéticos. No tocar Neon, bases reales, contenedores o volúmenes existentes. La ausencia de una capacidad opcional no autoriza ignorar dependencias obligatorias ni fallos de permisos o conexión.

### VI. Privacidad y publicación controlada
No leer ni publicar secretos para producir evidencia. No incorporar .env privados, JWT, credenciales, keystores, respaldos, dumps ni datos personales. Las evidencias deben estar saneadas. Antes de publicar una rama, verificar automatizaciones conectadas y bloquear despliegues no autorizados; comprobar después que no se generaron despliegues.

## Flujo y puertas de salida

1. Revisar git status, rama y remoto; conservar cambios ajenos. Trabajar solo en esta copia.
2. Aprobar alcance y criterios antes de cambios funcionales. El cierre de PLAN-01 permite documentación y commit local independiente. PKG-01 permite pruebas y build aislado seguro; no iniciar servicios ni ejecutar SQL.
3. En IMPLEMENT autorizado: avance pequeño, revisión de diff, pruebas pertinentes, CHANGELOG, inspección de contenido preparado sin secretos, commit descriptivo y push inmediato; mantener Draft PR hacia main desde el primer avance publicable, según AGENTS.md y autorización vigente.
4. No mergear main, desplegar, cambiar Neon ni publicar APK sin autorización explícita. No usar Git destructivo ni borrar datos o volúmenes.
5. Informar cambios, pruebas comprobadas, hash, resultado de push, enlace y siguiente avance cuando esas operaciones estén autorizadas y realmente realizadas.

## Gobierno y cambios

AGENTS.md y las instrucciones explícitas del propietario rigen el trabajo. La autorización vigente permite dos commits locales independientes (PLAN-01 y PKG-01) y prohíbe push/PR; prevalece sobre el ciclo de publicación de AGENTS.md. No iniciar nuevos servicios. No cambiar a feature/verificacion-correo: estas especificaciones no implementan esa funcionalidad y la rama autorizada es chore/adopcion-sdd-rpi.

Las enmiendas deben explicar motivo, impacto, versión y especificaciones afectadas; requieren revisión del propietario. Versionado documental: mayor para retirar principios o cambiar gobierno, menor para añadir principios, parche para aclaraciones. Cada plan incluye Constitution Check antes y después del diseño. No invocar automatizaciones de Spec Kit que creen ramas, cambien agentes o ejecuten implementación durante el cierre documental de PLAN-01.

Enmienda 1.0.1: distingue redacción/aprobación y registra el alcance autorizado; no cambia los principios técnicos.
