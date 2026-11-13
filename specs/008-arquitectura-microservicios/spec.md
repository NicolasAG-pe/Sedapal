# MS-01 — Migración gradual de Hidro-Mejora 1.2.0

Rama: feature/arquitectura-microservicios-120. Base: 1be9c28. Fecha: 2026-11-13.
Estado: auditoría y propuesta; implementación pendiente.

La autorización del usuario de esta sesión permite implementación local,
pruebas sintéticas, commits y publicación condicionada al bloqueo de despliegues.
Prevalece sobre las autorizaciones históricas limitadas de la constitución;
sus principios de compatibilidad, evidencia y privacidad se mantienen.

## Requisitos y aceptación

- MS-AC01: inventariar las rutas y dependencias reales, incluidos triggers,
  workers, eventos y transacciones; matriz trazable al código.
- MS-AC02: gateway y Auth/Billing/Operations/Notifications con procesos,
  configuración, health, reinicio y despliegue independientes.
- MS-AC03: conservar contratos HTTP, JWT, roles, suministro, Socket.IO y clientes.
- MS-AC04: permisos SQL mínimos; no lectura directa de tablas ajenas ni
  escritura entre dominios fuera de contratos definidos.
- MS-AC05: conservar atomicidad, idempotencia y concurrencia de negocio.
- MS-AC06: laboratorio exclusivo, PostgreSQL privado, datos sintéticos y
  proveedores simulados; compose original estable.
- MS-AC07: ejecutar matriz de regresión, fallos y recuperación; no presentar
  pruebas estáticas como validación nativa o de despliegue.
- MS-AC08: documentación reproducible, preparación productiva, costos revisados
  y rollback ensayado; integración independiente de activación.
- MS-AC09: commits pequeños, CHANGELOG, revisión de secretos, push y Draft PR
  solo tras comprobar automatizaciones; sin merge ni despliegue.

El cierre requiere todos los criterios; esta auditoría no satisface MS-AC02–08.
