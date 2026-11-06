# Desarrollo local aislado

Requisitos: Git, Docker Engine/Compose v2; Node22/npm para pruebas y generadores. Java21/Android SDK solo para tareas Android. No instalar herramientas nativas para ejecutar la suite segura.

## Antes de iniciar servicios

Esta guía describe una instalación **nueva**; los comandos no se ejecutaron durante DOC-01. No usar la copia original ni reutilizar sus `.env`, identidad Compose, contenedores, volúmenes, respaldos o datos. Dos carpetas llamadas Sedapal pueden compartir el proyecto Compose por defecto. Inspeccionar recursos y puertos actuales en modo lectura antes de elegir identidad y puertos nuevos.

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


Las imágenes Docker web y administrativa escuchan como usuarios sin privilegios
en el puerto interno 8080. Compose conserva los puertos publicados configurados
por `WEB_PORT` y `ADMIN_PORT`; los Services Kubernetes conservan puerto 80 y
apuntan al puerto nombrado del contenedor. Nginx escribe PID y temporales en
`/tmp`, que debe permanecer escribible por el usuario del contenedor.

Para medir cobertura de navegador, primero preparar una API y dos cuentas
**sintéticas y aisladas**. `scripts/capture-browser-coverage.cjs` exige
`HM_COVERAGE_SYNTHETIC=1`, orígenes HTTP de loopback en
`HM_COVERAGE_CLIENT_ORIGIN` y `HM_COVERAGE_ADMIN_ORIGIN`, suministros de fixture
`HM_COVERAGE_CLIENT_SUPPLY` y `HM_COVERAGE_ADMIN_SUPPLY`, y la contraseña de
fixture en `HM_COVERAGE_FIXTURE_PASSWORD`. Requiere las rutas locales
`HM_PLAYWRIGHT_PACKAGE` (package.json) y `HM_CHROMIUM`; no carga archivos .env.
Esos datos deben pertenecer a una base de prueba recién creada, nunca a la base
habitual. El script captura fuentes y contadores V8 en `artifacts/tests` privado.

Para fusionar, generar previamente `coverage-final.json` de la suite Node con
c8 y ejecutar `node scripts/merge-browser-coverage.cjs NODE_JSON CLIENTE_JSON
ADMIN_JSON DIRECTORIO_SALIDA RUTA_C8_PACKAGE_JSON`. La herramienta comprueba
que cada fuente capturada coincide exactamente con su archivo y rechaza
orígenes no locales. El script inline de HTML se omite de la importación de
cobertura hasta disponer de mapeo de offsets validado; no se excluye del análisis.
El LCOV generado refleja solo los escenarios realmente ejecutados.

### API Android de desarrollo

En un emulador dedicado, usa una API sintética local y configura `API_BASE_URL=http://127.0.0.1:8080`. Antes de abrir la aplicación debug, comprueba que el puerto no tenga otro reenvío y ejecuta `adb -s <serial-del-emulador> reverse tcp:8080 tcp:8080`; al terminar retira únicamente ese reenvío con `adb -s <serial-del-emulador> reverse --remove tcp:8080`. HTTP de debug no es adecuado para cuentas ni datos reales. Las conexiones externas requieren HTTPS y la configuración release no habilita tráfico claro. En la revisión del PR #29 no había dispositivos ni emuladores conectados: queda pendiente verificar en un AVD dedicado `adb reverse`, acceso a la API sintética y limpieza del reenvío.

### Chequeos autenticados aislados

`scripts/check-local.cjs` y `scripts/check-admin-local.cjs` se limitan a un backend de desarrollo con `POSTGRES_DB=hm_rootless_test`, `POSTGRES_USER=hm_fixture`, `DB_HOST=db` o `hm-rootless-sonar-db` y el secreto de fixture indicado en `Backend/local-check-transport.js`. La conexión consulta además la identidad efectiva de base y rol. No conectar a datos reales; ambos scripts se detienen ante configuración diferente, URL de base alternativa o cuentas con 2FA activo. Son herramientas de prueba y no sustituyen una verificación completa de 2FA.

El servicio de pruebas debe disponer de destinos `TEST_WEB_BASE` y, para administración, `TEST_ADMIN_BASE`, con HTTPS y nombres autorizados (`web-tls` y `admin-tls`, respectivamente), certificados válidos para esos nombres y CA privada de pruebas montada en el contenedor. Arrancar Node con `NODE_EXTRA_CA_CERTS` apuntando a la CA; no desactivar la validación TLS. Si se emplea un proxy, también debe proteger el tramo posterior o estar limitado a una red de fixtures sin datos ni credenciales reales. Los servicios de Compose existentes sirven HTTP y no satisfacen estos requisitos por sí solos; no reutilizarlos para esta prueba sin preparar un entorno sintético separado.

Ejemplo dentro del contenedor de backend del entorno aislado ya preparado:

```sh
docker exec -e NODE_EXTRA_CA_CERTS=/cert/ca.crt -e TEST_WEB_BASE=https://web-tls:8443 -i <backend-fixture> node < scripts/check-local.cjs
docker exec -e NODE_EXTRA_CA_CERTS=/cert/ca.crt -e TEST_WEB_BASE=https://web-tls:8443 -e TEST_ADMIN_BASE=https://admin-tls:8443 -i <backend-fixture> node < scripts/check-admin-local.cjs
```

La instancia secundaria escucha en la red aislada de fixtures. El cliente la consulta por loopback con un secreto nuevo aleatorio y un JWT efímero propio; no envía el JWT del servicio existente por esa conexión. No se deben montar secretos reales en este entorno.
