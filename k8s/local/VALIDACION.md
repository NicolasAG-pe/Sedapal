> Evidencia histórica del compañero, anterior a la integración OTP/outbox.
> No se repitió en avance 18 y no acredita el backend integrado. Ver el
> [informe nuevo](../../docs/pruebas/integracion-avance-18.md).

# Validación local — 21 de octubre de 2026

Rama: `feature/vercel-to-k8s`. Entorno: Linux x86_64, Docker, Kind v0.33.0,
Kubernetes v1.37.0 y kubectl v1.37.1. Paneles accesibles por localhost en
8082 (usuario) y 8083 (administración), conservando Compose en 8080/8081.

## Resultado final

- Los cuatro Pods quedaron `1/1 Running`, con cero reinicios en sus contenedores actuales.
- PVC `db-data` de 10 GiB enlazado a la StorageClass `standard`.
- Validación de manifiestos con `--dry-run=server` correcta.
- Login real de administrador y usuario con suministro/contraseña y roles correctos.
- Las 19 rutas administrativas rechazaron ausencia de JWT con 401 y usuario normal con 403.
- Assets, proxy REST, CORS y Socket.IO autenticado pasaron la verificación.
- Usuario creó una solicitud, administración respondió y el usuario leyó la respuesta.
- Chromium cargó el login y los siete módulos administrativos; también el dashboard de usuario.
- Se guardaron capturas de escritorio y móvil, sin errores JavaScript ni respuestas HTTP fallidas en el recorrido verificado.
- Tras recrear PostgreSQL se conservaron las dos cuentas y la respuesta de atención.
- El backend recuperó la conexión sin cambiar de Pod, contenedor o contador de reinicios.
- `npm run test:config`, `npm run test:documents` y `git diff --check` pasaron.

## Falla detectada y corregida

La primera prueba de reinicio de PostgreSQL provocó un evento `error` no manejado
en el pool y terminó Node con código 1. Se agregó un listener de `pool.on('error')`
en `Backend/server.js`, con registro del código sin volcar el objeto cliente.
El pool descarta la conexión dañada y establece otra al consultar, según la
[documentación de node-postgres](https://node-postgres.com/apis/pool#events).
La repetición de la prueba comprobó la recuperación sin reinicios del backend.

Durante la descarga inicial de PostgreSQL hubo errores transitorios de conexión
al registro; Kubernetes reintentó y el despliegue concluyó. Los fallos de readiness
mientras PostgreSQL está detenido son esperables: la API no queda lista hasta
recuperar acceso a la base.

## Evidencia y alcance

Reportes completos y capturas en `.local/k8s/state/`, excluidos de Git.
Ver [README](README.md) para repetir las pruebas. Consumo observado del nodo
Kind: aproximadamente 935 MiB, con Compose también activo.

Esta prueba cubre el despliegue local, autenticación, autorización, navegación,
Socket.IO, flujo de atención y persistencia. No es una prueba de carga ni una
validación exhaustiva de cada operación de negocio. Producción aún necesita
imágenes de registro, credenciales propias, Ingress/TLS, CORS público y plan de
respaldo/restauración de los datos existentes. No se realizó push ni merge.
