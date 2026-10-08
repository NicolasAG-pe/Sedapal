# Despliegue de producción

Estado publicado de **Hidro-Mejora v1.0.0**. No hay despliegue web de clientes; Frontend se distribuye dentro de Android. Los siguientes servicios comparten únicamente la API de producción:

| Componente | Destino |
|---|---|
| Admin estático | <https://hidro-mehora-admin.vercel.app> |
| Backend Docker | `https://hidro-mejora-api.onrender.com` ([health](https://hidro-mejora-api.onrender.com/api/health)) |
| PostgreSQL producción | Neon |
| Distribución Android | [GitHub Release v1.0.0](https://github.com/NicolasAG-pe/Sedapal/releases/tag/v1.0.0) |

El dominio Admin contiene exactamente `hidro-mehora`, tal como está publicado. No corregirlo por inferencia.

## Admin en Vercel

Repositorio `NicolasAG-pe/Sedapal`, rama `main`, raíz del repositorio para acceder al generador y Shared. Se publica **solo la salida Admin**, no toda la raíz del monorepo.

La fuente de verdad es [vercel.json](../vercel.json):

```json
{
  "framework": null,
  "buildCommand": "node scripts/build-web.js admin",
  "outputDirectory": "artifacts/web/admin",
  "installCommand": "echo \"skip install\""
}
```

`framework: null` corresponde a **Other**. No se requieren entrypoints Node, funciones serverless ni otro framework. El build usa módulos nativos de Node y genera HTML/CSS/JS, Shared, recursos locales y la configuración pública.

Configurar `API_BASE_URL` con el origen público del backend Render. Ese origen es información pública, no una credencial. El archivo generado `hm-api-config.js` configura tanto REST como Socket.IO. No publicar `.env`, SQL, backend, backups, APK ni Frontend.

Después de un despliegue, verificar el dominio real, recursos, ausencia de errores de consola, login administrativo y logout. Las verificaciones de acceso están en [TESTING](TESTING.md).

El origen del backend no sirve una portada HTML; su comprobación pública es `/api/health`, no GET `/`.

## Backend en Render

Web Service `hidro-mejora-api`, repositorio y rama indicados, una instancia. Se utiliza [Backend/Dockerfile](../Backend/Dockerfile): contexto `Backend/`, Node `22-alpine`, copia de manifiesto/lockfile, `npm ci --omit=dev` e inicio `node server.js`.

Si la configuración Render utiliza raíz `Backend`, seleccionar su `Dockerfile`; si utiliza la raíz del monorepo, el contexto Docker debe seguir siendo `Backend` y la ruta del archivo `Backend/Dockerfile`. No utilizar el Compose como despliegue de Render.

Variables requeridas, documentadas solo por nombre:

- `DATABASE_URL`.
- `AUTH_TOKEN_SECRET`.
- `NODE_ENV`.
- `CORS_ALLOWED_ORIGINS`.
- `PORT`, asignada por Render y leída por el servidor.

El modo de producción habilita exclusivamente los orígenes configurados. Health Check Path: `/api/health`; consulta PostgreSQL y devuelve 500 si no puede conectarse. El servidor escucha en `0.0.0.0` y utiliza el puerto de su entorno.

Las salas Socket.IO se mantienen en memoria: conservar una instancia hasta que exista un diseño distribuido explícito. No asumir reglas de auto-deploy o límites comerciales que no estén fijados en el repositorio; comprobarlos en el panel del servicio antes de una operación futura.

## CORS y Android

Añadir exactamente `https://hidro-mehora-admin.vercel.app` a `CORS_ALLOWED_ORIGINS`, sin eliminar los orígenes explícitos ya autorizados. Nunca utilizar `*`.

El origen WebView de la release es `https://localhost`; es un origen interno de Capacitor, **no el destino API**. Los orígenes de desarrollo incluyen los puertos locales y, para debug HTTP, `http://localhost`. En producción no se añaden automáticamente: deben formar parte de la lista explícita cuando se requieran. No inventar un origen `capacitor://` para este proyecto.

La API y Socket.IO de la release se conectan a Render HTTPS. La configuración local/emulador permanece separada. Contratos y limitaciones: [API](API.md), [SECURITY](SECURITY.md) y [ANDROID](ANDROID.md).

## Neon

Proyecto `hidro-mejora-production`, base `hidro_mejora`. El backend es el único cliente de aplicación que recibe la conexión PostgreSQL; Android y Admin nunca reciben credenciales de base de datos.

`Backend/config.js` prioriza `DATABASE_URL`. Para hosts externos fuerza `sslmode=verify-full`; para desarrollo sin esa variable utiliza `POSTGRES_*`, `DB_HOST` y `DB_PORT`, sin SSL. No documentar ni versionar la URL de conexión completa.

La restauración de la copia inicial fue validada antes del despliegue Render durante la preparación de producción de octubre de 2026, según la confirmación del propietario. Esta documentación no vuelve a consultar datos ni garantiza que los conteos iniciales sigan constantes tras el uso real. El esquema está descrito en [DATABASE](DATABASE.md).

PostgreSQL Docker y Neon no se sincronizan automáticamente. Un respaldo local no debe restaurarse sobre Neon por rutina ni sobre la base original para probar. Procedimiento seguro: [MAINTENANCE](MAINTENANCE.md).

## APK y cambios posteriores

La APK firmada se entrega por GitHub Releases. Identidad, checksum, publicación y futuras actualizaciones se mantienen en la única guía [ANDROID-RELEASE](ANDROID-RELEASE.md).

Para futuros despliegues: comprobar diferencias del commit, pruebas pertinentes, health, CORS y autenticación; después revisar lecturas y tiempo real sin escrituras de negocio innecesarias. No publicar secretos ni alterar datos como parte de una actualización documental.
