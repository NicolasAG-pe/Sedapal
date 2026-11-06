# Validación futura — PKG-01

Pruebas locales y builds ejecutados tras aprobación de PKG-01; ver [resultados](validation.md). No iniciar servicios.

## Preparación

Tras aprobación de IMPLEMENT, comprobar Git y herramientas existentes. Usar salidas temporales nuevas fuera de artefactos previos. No instalar dependencias ni publicar imágenes por inferencia. Autorizar explícitamente un builder/servidor aislado si hace falta; no usar Compose de las instalaciones existentes.

## Ejecución prevista

1. Ejecutar PKG-T02/PKG-T03/PKG-T04 mediante `node --test scripts/test/client-packaging.test.cjs` con el archivo ya creado.
2. Ejecutar PKG-T01 con contexto raíz y Frontend/Dockerfile en entorno de pruebas, registrar builder, error previo y éxito posterior. Inspeccionar archivos de la imagen generada sin reemplazar imágenes o contenedores existentes. El comando concreto dependerá del builder disponible y del aislamiento aprobado.
3. Ejecutar PKG-T05 con datos sintéticos; revisar carga, tipos de contenido, recuperación y seguimiento sin proveedores reales.
4. Comparar resultados con AC-PKG-01..05 y conservar verificador de separación administrativa.

## Registro requerido

SHA, fecha, versiones, comando exacto, entorno, código de salida, casos ejecutados/aprobados/fallidos/omitidos y motivo. No registrar credenciales. Estado actual por caso en validation.md. Registrar cobertura de código modificado si hay herramienta disponible y aprobada; no instalar una durante esta tarea sin revisión ni fijar porcentaje arbitrario.

## Prerrequisitos pendientes al cierre documental

Verificar versiones y disponibilidad de herramientas antes de ejecutar. Node 22 es la referencia; un runtime distinto se registrará sin afirmar equivalencia. BuildKit requiere daemon accesible y contexto local seguro; navegador y sus dependencias no están garantizados. No instalar herramientas automáticamente. La autorización actual prohíbe iniciar servicios: validación HTTP/navegador con servidor queda pendiente y no puede sustituirse por inspección estática. DB-01 carece de autorización: instancia PostgreSQL nueva, base padre dedicada, permisos y adaptación exacta del harness siguen pendientes. No se ha ejecutado ninguna prueba de aplicación al cerrar PLAN-01.

## Estado vigente

PKG-01 completado mediante autorización posterior para servicios temporales aislados. Node 22, HTTP/MIME y Firefox aprobados; los bloqueos históricos de esta guía quedan resueltos. Ver validation.md. No push ni producción.
