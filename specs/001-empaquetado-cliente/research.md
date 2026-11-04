# Research — PKG-01

Estado: E, lectura estática sobre d3d27d0; sin build ni prueba ejecutada.

## Evidencia

- compose.yaml usa context: . y Frontend/Dockerfile.
- Frontend/Dockerfile copia api.js, ui.js, styles.css, icons.js y two-factor-ui.js.
- Frontend/Dockerfile.dockerignore parte de ** y no reincorpora two-factor-ui.js, password-recovery-ui.js ni incident-timeline.js.
- Frontend/index.html referencia esos tres scripts consecutivamente.
- scripts/build-web.js copia siete módulos Shared, incluidos los tres.
- scripts/verify-client-runtime.js exige incident-timeline y two-factor, pero omite password-recovery.

## Decisión

Completar listas explícitas de Dockerfile y exclusiones, y cerrar el punto ciego del verificador. Mantener build-web sin cambios si las pruebas confirman su contrato. No convertir aún Shared completo en publicación implícita.

Alternativas: COPY Shared/ reduce listas duplicadas pero amplía superficie publicable y exige auditoría; manifiesto único añade abstracción y modifica más consumidores. Se posponen. Comparar listas del código es diagnóstico auxiliar: la aceptación se prueba sobre artefactos y omisiones deliberadas.

## Correcciones al informe

El fallo BuildKit es estáticamente fundamentado, no reproducido. La variante de builder clásico no se probó ni se prescribe. La omisión de scripts demuestra artefacto incompleto, pero el alcance de los errores visibles requiere navegador. No usar Kubernetes existente para comprobarlo.

## Pendiente

Disponibilidad de BuildKit/navegador; inventario de dependencias transitivas y carga dinámica; ubicación de herramientas ya documentadas. Registrar versión del builder y contexto al reproducir. No instalar herramientas ni arrancar servicios en PLAN-01.

## Contraste específico de implementación (2026-11-04)

No se repitió la auditoría general. El build original con Docker 26.1.5+dfsg1/buildx 0.13.1 terminó y exportó two-factor-ui.js; por tanto el fallo de construcción de PKG-01a no se reprodujo en este builder. No atribuir causa sin investigar su selección efectiva de ignores. El tar original sí carecía de password-recovery-ui.js e incident-timeline.js. Tres pruebas fallaron antes del cambio: COPY ausente, allowlist incompleta y verificador sin rechazo de recuperación. Después pasan.

Vercel raíz construye Admin mediante build-web; Android consume build-web('android') y su verificador; Kubernetes avance19 ya lista los siete módulos. Ninguna de estas rutas se modificó. No se probó despliegue, APK ni Kubernetes real.
