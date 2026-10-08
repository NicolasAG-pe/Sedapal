# Instalación y desarrollo local

Guía vigente para el Compose de v1.0.0. Ejecutar comandos desde la raíz `Sedapal/`, salvo indicación contraria. No utilizar las credenciales de producción para desarrollo.

## Requisitos

- Git, Docker Engine y Docker Compose v2.
- Node 22 y npm para herramientas, configuración y pruebas; los contenedores no utilizan `node_modules` del host.
- Poppler (`pdfinfo`, `pdftotext`) para las pruebas PDF.
- Java 21, Android SDK 35 y herramientas Android solo al compilar; ver [ANDROID](ANDROID.md).
- Chromium para integración visual; Playwright para la regresión específica de Perfil; ver [TESTING](TESTING.md).

## Variables y dependencias

En un clon nuevo:

```bash
cp -n .env.example .env
npm ci
npm ci --prefix Backend
```

Completar la configuración privada local sin registrarla en Git. No sobrescribir un `.env` existente ni mostrar su contenido en logs. Los ejemplos son plantillas, no cuentas de producción.

| Nombres | Uso |
|---|---|
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Base local y credenciales utilizadas por Compose. |
| `DB_HOST`, `DB_PORT` | Conexión PostgreSQL cuando se ejecuta Node directamente; Compose fija su red interna. |
| `AUTH_TOKEN_SECRET` | Firma JWT; obligatorio para autenticación funcional. |
| `NODE_ENV`, `CORS_ALLOWED_ORIGINS` | Modo y lista explícita de orígenes. |
| `WEB_PORT`, `ADMIN_PORT` | Puertos publicados por Compose. |
| `PORT` | Puerto Node al ejecutar el backend fuera del Compose actual. |
| `DATABASE_URL` | Conexión alternativa con prioridad en Node; **Compose no la inyecta** al backend local. |
| `API_BASE_URL` | Configuración pública de cada runtime estático/Android. |

El backend no carga `.env` por sí solo. Docker inyecta las variables declaradas. Para ejecutar Node fuera de Docker hay que proporcionar el entorno expresamente; no suponer que todos los nombres de la plantilla son utilizados por Compose.

`.env.frontend.example`, `.env.admin.example` y `.env.android.example` contienen la variable pública de sus respectivos destinos. Los archivos privados correspondientes son independientes. El generador prioriza el entorno del proceso sobre esos archivos. `.env.production.example` corresponde a la alternativa VPS histórica, no configura por sí sola Render o Vercel.

## Servicios y puertos

```bash
docker compose up -d
docker compose ps
```

| Servicio | Acceso | Función |
|---|---|---|
| `web` | <http://localhost:8080> por defecto | Cliente de desarrollo servido por Nginx. |
| `admin` | <http://localhost:8081> por defecto | Panel administrativo servido por Nginx. |
| `backend` | Red interna `backend:3000` | API y Socket.IO. |
| `db` | Red interna `db:5432` | PostgreSQL 18 persistente. |

En local, ambas fuentes usan rutas relativas: `/api/*` y `/socket.io/`. No requieren Render, Neon ni un túnel. Para reconstruir fuentes modificadas, ejecutar `docker compose up -d --build web admin backend`; no necesita reinicializar `db`.

Una base nueva ejecuta `init.sql` y comienza sin cuentas cargadas automáticamente. El registro crea cuentas `usuario`; no existe una ruta pública que asigne `admin`. El acceso administrativo inicial requiere provisión controlada por el responsable de la base, separada de las pruebas y de esta guía. Las migraciones no se ejecutan automáticamente; ver [DATABASE](DATABASE.md).

## Comprobaciones básicas

```bash
curl --fail http://localhost:8080/
curl --fail http://localhost:8081/
curl --fail http://localhost:8080/api/health
curl --fail http://localhost:8081/api/health
docker compose logs --tail=50 backend
```

Los cuatro servicios deben mostrar `healthy` tras su período de inicio. Health ejecuta una consulta SQL; un HTML cargado por sí solo no prueba conectividad con la base. Revisar los logs localmente sin publicarlos sin redacción.

Las comprobaciones automatizadas están centralizadas en [TESTING](TESTING.md). No ejecutar pruebas que escriban contra la base original.

## Acceso PostgreSQL de lectura

Usar las credenciales ya presentes dentro del contenedor, sin imprimirlas:

```bash
docker compose exec db sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Para una revisión:

```sql
BEGIN READ ONLY;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
COMMIT;
```

No volcar usuarios, fotografías ni hashes en documentación o terminales compartidas. Respaldo y verificación: [MAINTENANCE](MAINTENANCE.md).

## Parada segura

```bash
docker compose stop
```

Reanudar con `docker compose up -d`. **No ejecutar `docker compose down -v`, borrar `sedapal_postgres_data` ni cambiar el nombre del proyecto Compose para una instalación existente.** Nunca utilizar `init.sql` como mecanismo de reinicialización sobre datos existentes. Ver [mantenimiento](MAINTENANCE.md) antes de restaurar o limpiar.
