# Desarrollo local aislado

Requisitos: Git, Docker Engine/Compose v2; Node22/npm para pruebas y generadores. Java21/Android SDK solo para tareas Android. No instalar herramientas nativas para ejecutar la suite segura.

## Antes de iniciar servicios

Esta guía describe una instalación **nueva**, según el código de `main` en `4f15173` (2026-11-11); esta revisión documental no inicia servicios. No usar la copia original ni reutilizar sus `.env`, identidad Compose, contenedores, volúmenes, respaldos o datos. Dos carpetas llamadas Sedapal pueden compartir el proyecto Compose por defecto. Inspeccionar recursos y puertos actuales en modo lectura antes de elegir identidad y puertos nuevos.

En esta copia, crear una configuración local desde [.env.example](../.env.example) solo si no existe; completar valores **sintéticos/locales**, secretos locales nuevos y los orígenes CORS que correspondan. Nunca copiar credenciales productivas ni versionar `.env`. No imprimir su contenido. Si ya hay una configuración/instalación, no sobrescribir ni ejecutar esta receta sobre ella.

Ejemplo para laboratorio nuevo, solo después de verificar que proyecto y puertos están libres y que el `.env` es local:

```bash
cp -n .env.example .env
# Completar .env de forma privada antes de continuar.
WEB_PORT=18080 ADMIN_PORT=18081 CORS_ALLOWED_ORIGINS=http://localhost:18080,http://localhost:18081 docker compose --project-name hidro-sdd-lab up -d --build
WEB_PORT=18080 ADMIN_PORT=18081 CORS_ALLOWED_ORIGINS=http://localhost:18080,http://localhost:18081 docker compose --project-name hidro-sdd-lab ps
curl --fail http://localhost:18080/api/health
```

Conservar exactamente identidad/variables para las operaciones futuras de ese laboratorio. Si `hidro-sdd-lab` o esos puertos existen, detenerse y elegir otros **antes** de ejecutar. La identidad nueva evita compartir el volumen lógico postgres_data con el proyecto original; comprobar el nombre real resultante antes de arrancar. No confiar solo en el nombre.

Cliente18080 y Admin18081 sirven Nginx. Backend3000 y PostgreSQL5432 quedan en red interna, sin puerto host según [Compose](../compose.yaml). No introducir un override de la otra copia ni abrir DB al exterior. Para detener únicamente el laboratorio identificado, usar `docker compose --project-name hidro-sdd-lab stop` con la misma configuración. Nunca eliminar volúmenes ni ejecutar limpiezas globales.

## Inicialización y capacidades

Postgres18 monta su almacenamiento en `/var/lib/postgresql`. Ejecuta [init.sql](../Base-de-Datos/init.sql) únicamente al inicializar un volumen vacío. No carga cuentas automáticamente ni aplica todas las migraciones posteriores. Volúmenes existentes no se actualizan al reconstruir imágenes.

`init.sql` incluye el piloto local y seguimiento de incidencias; no incluye recuperación011 ni push012. No aplicar014 a este perfil. El mapa y prerrequisitos están en [DATABASE](DATABASE.md). Tampoco `health=200` valida todas las capacidades.

Compose no transmite automáticamente cada variable de `.env` al backend: solo las declaradas en environment. En particular, no habilita por sí mismo los flags/proveedores avanzados de correo, recuperación o push. No añadir credenciales reales para probarlos. Cualquier ampliación opt-in exige un avance autorizado y recursos de prueba aislados.

## Herramientas sin iniciar Docker

Con Node22:

```bash
npm ci --prefix Backend --ignore-scripts --no-audit --no-fund
npm run test:inventory
npm test
```

El lock raíz y `npm ci` se reservan para herramientas Capacitor cuando se necesiten. `npm run build:web` y `npm run build:admin` escriben artefactos locales, no despliegan; revisar siempre su configuración pública de API antes de pruebas de navegador. [TESTING](TESTING.md) separa integración, navegador, Android y pruebas live. No ejecutar scripts históricos de restauración/correo/live como parte del arranque.

## Laboratorio integrado Auth y Notifications

`compose.integration.yaml` sirve para comprobar la migración progresiva sin tocar `compose.yaml`. Crea `hidro-ms120-integration`, PostgreSQL temporal en memoria, Auth, Notifications en modo `stub`, worker de outbox y Backend. Web y Admin solo se publican en `127.0.0.1:8180` y `127.0.0.1:8181`; base, worker, Auth y Notifications permanecen en la red interna.

Crear un archivo privado nuevo `.env.integration` con seis secretos de fixture distintos: `LAB_AUTH_TOKEN_SECRET`, `LAB_EMAIL_OTP_SECRET`, `LAB_EMAIL_OUTBOX_KEY`, `LAB_TOTP_ENCRYPTION_KEY`, `LAB_AUTH_INTERNAL_SECRET` y `LAB_NOTIFICATIONS_INTERNAL_SECRET`. Puede usarse la misma forma de generación descrita en `.env.microservicios.example`; no copiar `.env` ni claves reales.

```bash
docker compose --env-file .env.integration -f compose.integration.yaml config --quiet
docker compose --env-file .env.integration -f compose.integration.yaml up -d --no-build --pull never
docker compose --env-file .env.integration -f compose.integration.yaml ps
```

El Backend delega las rutas `/api/auth/*`, perfil y cambios administrativos de identidad a Auth mediante `AUTH_SERVICE_URL`. Las demás rutas y Socket.IO siguen en Backend. Si Auth no responde, esas rutas devuelven `503 AUTH_UNAVAILABLE`; no recurren al monolito. El correo del laboratorio acepta únicamente destinatarios `.invalid` y devuelve ids `stub-…`; nunca entrega a proveedores reales.

La prueba manual `Backend/test/microservices-compose.cjs` crea una cuenta sintética. Detén solo el worker antes de ejecutarla y arráncalo cuando indique `fixture_encolado`. Así puede leer el OTP sintético antes de que el worker elimine la carga cifrada al confirmar la entrega. Ejecuta la prueba únicamente en el proyecto `hidro-ms120-integration`.

Para detener todo el laboratorio usa `docker compose --env-file .env.integration -f compose.integration.yaml stop`. PostgreSQL perderá sus fixtures temporales al detenerse. Consulta los [resultados de integración](microservices/06-pruebas-validacion.md) y la [preparación de Billing](microservices/09-preparacion-billing.md).

## Laboratorio sin monolito

`compose.services.yaml` monta el cliente y el panel en `127.0.0.1:8280/8281`.
Gateway dirige REST y Socket.IO a Auth, Billing, Operations, Notifications y
Realtime. Usa `.env.services` para secretos locales, correo `.invalid` y push
simulado. Los demás proyectos de Compose conservan sus puertos y bases.
Consulta [arranque, contratos y verificación](microservices/10-laboratorio-servicios.md).
