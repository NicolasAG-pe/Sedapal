# Pruebas y evidencia

Referencia de código: **v1.0.0**, commit `135cb54`. Esta guía distingue cobertura disponible, resultados de fases anteriores y pruebas físicas. La actualización documental no vuelve a ejecutar logins reales ni escribe en bases.

## Automatizadas JavaScript y backend

| Prueba | Ejecución | Alcance |
|---|---|---|
| Configuración | `npm run test:config` | Configuración PostgreSQL local/TLS externo, puertos, orígenes, fechas DATE y build público separado. |
| PDF | `npm run test:documents` | A4, datos registrados, ausencia de desglose ficticio, constancia, nombres, paginación y puente nativo simulado. Requiere Poppler. |
| Firma release | `node --test scripts/test/android-release-signing.test.cjs` | Variables y permisos de fixtures, firma fuera del repositorio, errores sin valores privados. No utiliza la clave release real. |
| Perfil | `node --test scripts/test/profile-navigation.test.cjs` | Cuenta móvil/hash/escritorio, una carga por entrada, hash inicial y cancelación de respuesta tras logout. API y Socket.IO simulados. |

Preparar `npm ci` y `npm ci --prefix Backend`. Las pruebas escriben salidas reconstruibles bajo `artifacts/`; no deben ejecutarse esperando un working tree sin archivos locales generados.

### Herramientas de navegador

Perfil requiere Playwright y Chromium como herramientas de validación separadas de las dependencias funcionales. El script permite `HIDRO_PLAYWRIGHT_MODULE` para la ruta del módulo instalado y `PLAYWRIGHT_BROWSERS_PATH` para navegadores. Su ruta predeterminada bajo `artifacts/vercel-validation/tools/` es local y no se obtiene solo con `npm ci` del repositorio.

La integración usa Chromium mediante Chrome DevTools Protocol y `ws` disponible en dependencias Backend. `HIDRO_TEST_CHROME` selecciona su ejecutable; no asumir que la ruta histórica de la máquina del autor existe en otro equipo.

## Integración con PostgreSQL temporal

[scripts/test/admin-e2e.cjs](../scripts/test/admin-e2e.cjs) lanza un backend y servidor estático de pruebas independientes, crea una base nueva y carga init.sql únicamente allí. Requiere un PostgreSQL **aislado**, nunca `sedapal_postgres_data` ni Neon.

Preparación controlada:

1. Reservar un puerto local libre y un nombre de contenedor de pruebas que no exista.
2. Configurar en un entorno separado las variables `POSTGRES_DB`, `POSTGRES_USER` y `POSTGRES_PASSWORD` de fixtures según las constantes del harness, sin cargar `.env` original. La base padre esperada es `hm_admin_test`.
3. Iniciar PostgreSQL 18 temporal, con `--tmpfs /var/lib/postgresql:rw`, publicación solo en `127.0.0.1` y sin volumen persistente ni montaje de la base original. Docker puede recibir esas variables por `--env <NOMBRE>` sin poner valores en el comando.
4. Esperar `pg_isready` y proporcionar `HIDRO_TEST_DB_PORT` con el puerto aislado; configurar `HIDRO_TEST_CHROME` y `HIDRO_TEST_REPORT_DIR` bajo `artifacts/tests/`.
5. Ejecutar:

```bash
node scripts/test/admin-e2e.cjs
```

El harness verifica base padre, crea una base de ejecución nueva y exige que esté vacía antes de cargar esquema. No es una autorización para apuntarlo a una instancia real solo porque acepte conexiones. Al terminar, retirar únicamente el contenedor temporal identificado; no ejecutar operaciones sobre el Compose del proyecto.

Cubre login/registro, módulos Admin, estado usuario/suministro, recibos, cortes, incidencia/foto, pagos, atención y cuenta. Comprueba las 19 rutas administrativas con 403 para usuario y 401 sin token, JWT alterado/expirado, CORS, logout, respuestas tardías y Socket.IO. Invoca [client-checks](../scripts/test/client-checks.cjs) para flujos cliente, descargas PDF, foto fixture y ubicación simulada. Los writes, incluida contraseña fixture, ocurren solo en esa base temporal.

Opciones del harness, por nombre: `HIDRO_TEST_DOUBLE_SUBMIT`, `HIDRO_TEST_FULL_TUTORIAL`, `HIDRO_TEST_VISUAL_CAPTURE`, `HIDRO_TEST_VISUAL_MATRIX`, `HIDRO_TEST_VISUAL_CLIENT_ONLY`. Cuando la matriz visual está habilitada revisa anchos cliente 360/390/412/768/1366 y Admin 768/1024/1366/1920. Las capturas no equivalen a una certificación de accesibilidad.

## Lecturas y comprobaciones locales

```bash
docker compose ps
docker compose exec -T backend node < scripts/check-local.cjs
docker compose exec -T backend node < scripts/check-admin-local.cjs
```

Estos scripts utilizan lecturas de cuentas existentes y JWT internos de prueba, **no prueban contraseñas reales**. `check-admin-local` envía POST/PATCH de denegación con rol usuario; se espera bloqueo antes de SQL, no una escritura aceptada. `check-local` verifica también una instancia Node temporal con conexión PostgreSQL de solo lectura. Revisar el entorno antes de ejecutarlos.

[database-fingerprint.cjs](../scripts/database-fingerprint.cjs) usa una transacción de lectura repetible y resume datos/esquema/índices/constraints/secuencias sin devolver filas de usuarios. Sus resultados son privados; comparar antes/después de una operación autorizada, sin publicar credenciales ni contenido de respaldo.

## Android: unitarias, Gradle y lint

```bash
npm run android:gradle -- :app:testDebugUnitTest :app:lintDebug :app:compileDebugAndroidTestSources
```

- Unitarias: límites, nombre y cabecera del payload PDF, más la prueba aritmética de plantilla.
- Lint: revisar errores y advertencias del informe de la ejecución, no asumir que cero errores significa cero advertencias.
- Instrumental: verifica package/applicationId mediante contexto Android. `compileDebugAndroidTestSources` **solo compila**; `connectedDebugAndroidTest` requiere un dispositivo/emulador y es una ejecución distinta.
- La compilación release integra unitarias release, lint y compilación instrumental debug. Build y firma: [ANDROID-RELEASE](ANDROID-RELEASE.md).

## Manuales de producción

Estado de infraestructura publicado: Admin Vercel → Render → Neon, y Android → Render → Neon. Revisión manual:

- Recursos sin 404 ni mixed content; configuración pública apunta a Render, sin destinos API de desarrollo/túnel.
- Health de Render; CORS desde el origen exacto de Vercel y el origen WebView autorizado.
- Login admin, navegación por módulos, fotografías, logout y segundo login.
- Login usuario, rechazo del panel y 403 administrativo; sin JWT, 401.
- Socket.IO autenticado, polling, upgrade WebSocket, desconexión/reconexión y recuperación por REST.
- Comparación de datos/esquema de Neon solo mediante acceso autorizado de lectura; no mantener cifras iniciales como requisito tras uso real.

El propietario confirmó previamente infraestructura y logins reales. Las comprobaciones de scripts con JWT interno y las fixtures no sustituyen ese login. Las credenciales de pruebas privadas no se publican ni se incorporan a estas instrucciones. No repetir writes de negocio en producción como parte de una revisión documental.

## Dispositivo físico: v1.0.0

Antes del cierre de la Release del 8 de octubre de 2026, el propietario confirmó en un teléfono físico la APK firmada v1.0.0: instalación, login, perfil, dashboard, recibos, PDF, pagos, incidencias, foto, ubicación, cortes, atención, notificaciones, logout, botón Atrás y Socket.IO con Admin, todos correctos.

Es evidencia manual física de esa APK, no una ejecución automatizada instrumental ni una certificación de todas las versiones Android/WebView, accesibilidad o funcionamiento offline completo.

## Resultados históricos y límites

El [informe de limpieza del 7 de octubre de 2026](LIMPIEZA-SEDAPAL.md) conserva sus cantidades de pruebas, archivos, tamaños PDF y resultados lint de aquella fase debug. Son resultados fechados anteriores a producción/release; no se presentan como una nueva corrida de v1.0.0.

Las guías describen pruebas existentes; el informe de cada ejecución debe identificar fecha, commit, entorno, variante APK y si se ejecutó, compiló, omitió o falló cada prueba. No copiar un número histórico de pruebas como resultado actual.
