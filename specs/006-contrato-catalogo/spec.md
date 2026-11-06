# CAT-01 — contrato del catálogo de suites

Autorizado por solicitud HIDRO-MEJORA 1.2.0 acelerada. Sin comportamiento visible, API, migraciones ni clientes modificados.

- FR-CAT-001 / AC-CAT-01: cada suite es una lista no vacía de rutas presentes en el inventario descubierto; rechazar ruta inexistente y tipo inválido con mensaje identificable.
- FR-CAT-002 / AC-CAT-02: cada ruta pertenece como máximo a una suite; rechazar duplicados internos y entre suites, sin deduplicar silenciosamente.
- FR-CAT-003 / AC-CAT-03: validar antes de serializar inventario; catálogo actual, orden y pruebas fuera por defecto conservados. Nueva prueba entra en unit y por tanto CI seguro.
- NFR-CAT-001: sin nuevas dependencias, acceso a red/DB ni lectura de secretos. Función pura sobre catálogo y rutas descubiertas; no exige que todas las pruebas entren en suites.

Aceptación: pruebas positivas y negativas ejecutadas, check vigente, regresiones locales pertinentes y límites de entorno explícitos. No atribuir esta validación a Node22/PG18/GitHub sin ejecución.
