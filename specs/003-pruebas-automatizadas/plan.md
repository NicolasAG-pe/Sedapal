# Plan — TEST-01

Node22/CommonJS, npm existente, Backend/package-lock.json y dependencias actuales. Sin nuevas tecnologías. Constitution Check antes/después: cambio limitado a infraestructura de pruebas/docs, autorización local sin push, recursos temporales identificados; conforme.

1. Generar catálogo completo y clasificación revisada; conservar comandos viejos.
2. Añadir runner explícito y guard de red no loopback; probar fallos, aislamiento de entorno y catálogo obsoleto.
3. Añadir npm test y grupos específicos. Integración requiere opt-in y preflight de versión/base padre, además de aislamiento de instancia comprobado por el operador. Los tests solo crean bases hijas nuevas. El flag no demuestra aislamiento por sí solo.
4. Ejecutar unit/contract y cobertura con Node22; PG18 tmpfs/network none y suites seleccionadas. Resolver fallos antes de cerrar. Reportes nuevos en artifacts, sin secretos.
5. Registrar límites, conteos, cobertura, comandos y trazabilidad; commit local. Solo después diseñar CI-01. E2E/native/live opcionales no se ejecutan por descubrimiento automático.
