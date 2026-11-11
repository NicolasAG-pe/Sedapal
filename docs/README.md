# Documentación técnica

Guías actualizadas para el código 1.2.0 de la rama chore/adopcion-sdd-rpi, referencia de entrada 6399d44 (2026-11-05), sin certificar el estado productivo. Las evidencias anteriores conservan su fecha, SHA y alcance; no son resultados ejecutados nuevamente.

| Tema | Referencia |
|---|---|
| Producto y estado | [README](../README.md), [CHANGELOG](../CHANGELOG.md) |
| Arquitectura y clientes | [Arquitectura](ARCHITECTURE.md), [Android](ANDROID.md) |
| Docker aislado | [Desarrollo local](LOCAL-DEVELOPMENT.md) |
| Versiones y releases | [Versiones de herramientas](VERSIONES.md) |
| Datos y perfiles | [PostgreSQL](DATABASE.md), [diccionario](base-de-datos/diccionario-de-datos.md), [DER](base-de-datos/diagrama-entidad-relacion.md), [Excel](base-de-datos/diccionario-de-datos.xlsx) |
| API y contratos por dominio | [API](API.md) |
| Seguridad y capacidades opt-in | [Seguridad](SECURITY.md) |
| Pruebas y evidencia | [Pruebas](TESTING.md) |
| Especificaciones y proceso | [SDD + RPI](SDD-RPI.md), [specs](../specs/README.md) |
| CI local/remoto pendiente | [CI](CI.md), [auditoría previa](../specs/004-integracion-continua/prepublication.md) |
| Destinos y publicación restringida | [Despliegue](DEPLOYMENT.md), [firma Android](ANDROID-RELEASE.md) |
| Mantenimiento | [Guía](MAINTENANCE.md), revisar sus prerrequisitos antes de operaciones manuales |

## Referencias especializadas e históricas

[Correo](verificacion-correo.md), [outbox](correo-outbox.md), [recuperación](../Backend/password-recovery.js), [push](android-push-firebase.md), [incidencias](../Backend/incident-tracking.js) y [recibos](integridad-recibos.md) describen sus avances y contratos con alcance propio. Los informes en `docs/pruebas/`, la [auditoría anterior](auditoria-produccion.md), [lanzamiento 1.2.0](LANZAMIENTO-OFICIAL-120.md), [guía de producto v1.0.0](MEJORA-PROFESIONAL.md) y [VPS histórico](DEPLOY-VPS-HISTORICO.md) son antecedentes, no una constatación del despliegue actual. No se alteraron esos informes ni el trabajo de análisis de otro compañero.

[Kubernetes local](../k8s/README.md) conserva su configuración existente; DOC-01 no inicia ni modifica ese entorno.
