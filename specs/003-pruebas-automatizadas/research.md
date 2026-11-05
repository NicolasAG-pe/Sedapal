# Research — TEST-01

2026-11-05. Base: 162e2d8. Git limpio, rama chore/adopcion-sdd-rpi. Revisión específica de Backend/test, scripts/test, scripts npm y dependencias; no se repite Research de arquitectura.

No existe npm test agregado. Hay node:test, ejecutables directos, helpers, suites de navegador, pruebas nativas y ensayos con recursos externos. email-live.cjs puede enviar correos; email-live.test.js solo prueba terminales simulados. Los sufijos no determinan seguridad. Los helpers email-schema/email-api crean bases nuevas; los flags/credenciales heredados no deben propagarse al nuevo runner. Native/restore/historical scripts pueden utilizar dispositivos, contenedores concretos o respaldos: excluir de las entradas seguras. No borrar archivos ni cambiar scripts antiguos.

El inventario generado por test-catalog incluirá todos los archivos, tipo, imports, variables requeridas, entradas npm directas, referencias entre archivos, hashes y grupos nuevos. Un archivo sin entrada npm directa no es necesariamente huérfano: puede ser helper o invocado por otro ejecutable. Comparar duplicados exactos por SHA y registrar alias/solapamientos; no deduplicar por semejanza sin prueba.

Decisión: listas explícitas para unit/contract/integration/e2e, entorno limpio, bloqueo de salida no loopback como defensa adicional, integración opt-in sobre PG18 nuevo verificado externamente. Node 22 local disponible en imagen backend existente; no sustituir Node global. Cobertura incorporada de Node sin paquetes adicionales, con denominador limitado a módulos cargados de la suite segura; sin umbral ni afirmación de cobertura global. Reportes opcionales en directorios nuevos de artifacts/tests, nunca respaldos o datos reales.
