# Plan CAT-01

Constitution Check antes/después: cambio mínimo, autorización vigente de implementación local y commit sin push; conserva contratos y fixtures, sin servicios reales. No enmendar gobierno histórico por cada sesión.

1. Crear pruebas de contrato para catálogo válido, grupos inválidos, listas vacías, rutas inexistentes y duplicadas; comprobar rojo.
2. Exportar validateGroups(catalog, discovered), invocarlo al inicio de inventory(), registrar prueba en unit; regenerar inventario revisado.
3. Ejecutar prueba nueva, catálogo, checker CI y regresiones PKG posibles. Intentar suite administrada con prerrequisitos reales; documentar bloqueos Node22/PG18 sin saltar guardas.
4. Revisar diff/secretos, actualizar trazabilidad, tareas, guía y CHANGELOG; commit local independiente.
