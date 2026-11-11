# Versiones y releases de las herramientas

Registro de las versiones con las que se construye y se ejecuta Hidro-Mejora 1.2.0.
Observado el **2026-11-11** sobre `main` con la app levantada en Docker Compose.
Este documento es descriptivo: **no cambia versiones de la aplicación ni del stack**
para conservar la compatibilidad del repositorio.

## Regla de compatibilidad

- Los manifiestos npm (raíz y `Backend/`) siguen en **1.0.0**; Android declara
  **1.2.0 / versionCode 6**. No se modifican aquí.
- Varias imágenes usan etiquetas flotantes (`node:22-alpine`, `nginx:stable-alpine`,
  `debian:bookworm-slim`, `postgres:18`). Se documenta la versión resuelta observada;
  puede cambiar al reconstruir sin tocar el código. Fijar digests queda fuera de
  este avance porque requiere validar cada plataforma.
- Las dependencias de Node sí están fijadas por `package-lock.json` y se instalan
  con `npm ci`.

## Servicios en contenedores

| Servicio | Imagen / base | Versión resuelta | Fuente |
|---|---|---|---|
| `web` (cliente) | `debian:bookworm-slim` + nginx del sistema | nginx **1.22.1** | [Dockerfile](../Frontend/Dockerfile) |
| `admin` (panel) | `nginx:stable-alpine` | nginx **1.30.6** | [Dockerfile](../Admin/Dockerfile) |
| `backend` (API) | `node:22-alpine` | Node **22.23.4** | [Dockerfile](../Backend/Dockerfile) |
| `db` (datos) | `postgres:18` | PostgreSQL **18.6** (Debian 13) | [compose](../compose.yaml) |

Los cuatro servicios comparten `docs/ARCHITECTURE.md` como mapa de responsabilidades.
Solo `web` y `admin` publican puertos; `backend:3000` y `db:5432` son internos.

## Backend (fijado por `Backend/package-lock.json`)

| Paquete | Versión | Uso |
|---|---|---|
| `express` | 5.2.1 | servidor HTTP y rutas |
| `socket.io` | 4.8.4 | tiempo real (debe coincidir con el cliente vendorizado) |
| `pg` | 8.23.1 | acceso a PostgreSQL |
| `jsonwebtoken` | 9.0.3 | sesión JWT |
| `helmet` | 8.3.0 | cabeceras de seguridad |
| `cors` | 8.2.6 | origen permitido por configuración |
| `express-rate-limit` | 8.7.0 | límites de peticiones |
| `otpauth` | 9.5.2 | TOTP/2FA |
| `qrcode` | 1.5.4 | QR de activación |
| `pngjs` | 5.0.0 | procesamiento de imágenes |

Comprobar el valor vigente con
`node -e "const l=require('./Backend/package-lock.json');console.log(l.packages['node_modules/express'].version)"`.

## Cliente y Android

| Herramienta | Versión | Fuente |
|---|---|---|
| `@capacitor/core`, `@capacitor/android`, `@capacitor/cli` | 7.6.9 | [package-lock](../package-lock.json) |
| `@capacitor/app` | 7.1.2 | [package-lock](../package-lock.json) |
| `@capacitor/push-notifications` | 7.0.7 | [package-lock](../package-lock.json) |
| Gradle | 8.11.1 | [wrapper](../android/gradle/wrapper/gradle-wrapper.properties) |
| Android Gradle Plugin | 8.7.2 | [build.gradle](../android/build.gradle) |
| Google Services | 4.4.2 | [build.gradle](../android/build.gradle) |
| Java (source/target) | 21 | [app/build.gradle](../android/app/build.gradle) |
| compileSdk / targetSdk / minSdk | 35 / 35 / 23 | [variables.gradle](../android/variables.gradle) |

## Librerías vendorizadas en el cliente

| Archivo | Versión | Nota |
|---|---|---|
| `Frontend/assets/vendor/socket.io.min.js` | Socket.IO **4.8.4** | copiar desde `Backend/node_modules/socket.io/client-dist/` si cambia el backend |
| `Frontend/assets/vendor/jspdf.umd.min.js` | jsPDF **2.5.1** | generación de PDF en el navegador |

## Herramientas de desarrollo y pruebas

| Herramienta | Versión observada | Nota |
|---|---|---|
| Docker Engine | 26.1.5 | requerido para Compose |
| Docker Compose | 2.26.1 | `docker compose config` valida el archivo |
| Node.js del host | 20.19.2 | suficiente para las suites seguras (`fetch`, `AbortSignal.timeout`) |
| npm | 9.2.0 | instalación con `npm ci` |

## Cómo verificar las versiones

```bash
# Contenedores en ejecución
docker exec sedapal-backend-1 node --version
docker exec sedapal-db-1 postgres --version
docker exec sedapal-web-1 nginx -v
docker exec sedapal-admin-1 nginx -v

# Dependencias fijadas
npm ls --prefix Backend --depth=0
npm ls --depth=0

# Android
grep distributionUrl android/gradle/wrapper/gradle-wrapper.properties
grep -n "compileSdk\|targetSdk\|minSdk" android/variables.gradle

# Estructura y puertos de Compose
docker compose config
```

## Referencias oficiales de release

- Node.js: <https://nodejs.org/en/about/previous-releases>
- Express: <https://github.com/expressjs/express/releases>
- Socket.IO: <https://github.com/socketio/socket.io/releases>
- node-postgres (`pg`): <https://github.com/brianc/node-postgres/releases>
- PostgreSQL: <https://www.postgresql.org/support/versioning/>
- nginx: <https://nginx.org/en/CHANGES>
- Capacitor: <https://github.com/ionic-team/capacitor/releases>
- Gradle: <https://gradle.org/releases/>
- Android Gradle Plugin: <https://developer.android.com/build/releases/gradle-plugin>
- jsPDF: <https://github.com/parallax/jsPDF/releases>

No se publican credenciales ni digests privados en este documento.
