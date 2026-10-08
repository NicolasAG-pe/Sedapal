# Hidro-Mejora

Prototipo universitario para consultar suministros, recibos, pagos simulados,
incidencias, cortes, solicitudes de atención y notificaciones. Incluye panel
administrativo, comprobantes PDF y actualización en tiempo real.

## Arquitectura

- Local: cliente de desarrollo :8080 y panel administrativo :8081 →
  Nginx → una API Express/Socket.IO :3000 → el mismo PostgreSQL :5432.
- Objetivo de producción: Android para clientes y panel administrativo estático
  en Vercel → la misma API Node/Express/Socket.IO en Render → PostgreSQL en Neon.
- No se publicará una web de clientes. `Frontend/` y Android contienen exclusivamente
  funciones de usuarios; `Admin/` contiene la administración independiente.
- La base local y la futura base de producción son independientes. No existe
  sincronización automática ni se han migrado datos a producción.
- Las salas Socket.IO continúan en memoria. Para esta etapa se utiliza una
  instancia del backend; escalar a varias requiere coordinación externa.

Tecnologías: HTML/CSS/JavaScript puro, Nginx, Node.js 22, Express 5, `pg`, JWT,
Socket.IO 4, PostgreSQL 18, Capacitor 7, Gradle 8.11.1 y JDK 21 para Android.
`Backend/documentacion/java-docs/` es documentación académica, no otra API.

## Carpetas

```text
Frontend/                   Cliente exclusivo de usuarios, assets y Nginx
Admin/                      Panel administrativo independiente HTML/CSS/JS
Shared/                     Sesión, API, formatos, Socket.IO y estilos institucionales
Backend/                    API, configuración por entorno y pruebas
Base-de-Datos/               init.sql, seed.sql y migrations/
android/                    Proyecto Capacitor/Android existente
scripts/                    Respaldo, generación web/Android y selección JDK
compose.yaml                Desarrollo Docker; volumen postgres_data
docs/historical/compose.prod.yaml  Override VPS histórico
capacitor.config.js         Única configuración fuente de Capacitor
.env*.example               Plantillas sin credenciales reales
docs/DEPLOY-VPS-HISTORICO.md Guía histórica VPS, no guía Render/Vercel
backups/                    Respaldos privados, ignorados por Git
artifacts/web/client/       Salida web de desarrollo generada
artifacts/web/admin/        Salida administrativa generada
artifacts/android/web-runtime/    Runtime Capacitor limpio
artifacts/android/staging/  Preparación temporal de runtime Android
artifacts/android/          APK nuevos con nombres únicos, ignorados por Git
```

Las versiones históricas únicas se conservan en un respaldo privado deduplicado. No mover ni eliminar
el volumen local ni volver a ejecutar `init.sql` sobre una base existente.

## Desarrollo local

Conservar el `.env` actual. Solo en una instalación nueva, copiar `.env.example`
a `.env`, completar `POSTGRES_*` y generar un `AUTH_TOKEN_SECRET` propio.

```bash
docker compose up -d
```

Abrir http://localhost:8080 para el cliente de usuarios y http://localhost:8081 para
administración. El proyecto Compose y `sedapal_postgres_data` se conservan.
Después de cambiar código, reconstruir solo los
servicios de aplicación:

```bash
docker compose up -d --build --no-deps backend web admin
curl --fail http://localhost:8080/api/health
docker compose ps
```

Detener conservando los datos: `docker compose stop`. Volver a iniciar:
`docker compose up -d`. No ejecutar comandos que eliminen volúmenes.

Compose utiliza `POSTGRES_*` y `DB_HOST=db`, y mantiene el puerto interno 3000.
No transmite `DATABASE_URL` al backend local: agregar una cadena de producción
al entorno del host no cambia accidentalmente la base utilizada por Docker.

## Variables por entorno

| Variable | Uso |
| --- | --- |
| `PORT` | Backend fuera de Docker; defecto 3000, Render asigna su puerto |
| `DATABASE_URL` | Prioridad sobre `POSTGRES_*` al iniciar Node; cadena de Neon |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DB_HOST`, `DB_PORT` | Conexión local alternativa cuando no hay `DATABASE_URL` |
| `AUTH_TOKEN_SECRET` | Secreto JWT privado del backend |
| `CORS_ALLOWED_ORIGINS` | Lista de orígenes exactos separados por comas, sin `/` final ni rutas |
| `NODE_ENV` | `development` local o `production` en Render |
| `API_BASE_URL` | Única URL pública usada por REST y Socket.IO; sin `/api` final |
| `ADMIN_PORT` | Puerto del panel local, 8081 por defecto |

Los hosts externos de `DATABASE_URL` utilizan TLS con certificado y host
verificados (`sslmode=verify-full`). Los hosts locales `db`, `localhost` y
loopback pueden conectar sin TLS. No desactivar la validación de certificados.

El backend no lee `.env` por sí solo: Docker y Render inyectan las variables.
En Node 22 fuera de Docker se puede usar `node --env-file=../.env server.js`
desde `Backend/`, siempre que `DB_HOST` sea accesible desde ese entorno.

Ambos clientes Docker cargan su `hm-api-config.js` con base vacía: `/api/*`
y `/socket.io/*` pasan por su Nginx al mismo backend. Para publicar el panel se genera otro archivo en la
salida; nunca se cambia esta fuente para insertar un dominio de producción.

```bash
cp .env.admin.example .env.admin
# Completar API_BASE_URL con el origen HTTPS real del backend.
npm run build:admin
```

La variable de proceso `API_BASE_URL` tiene prioridad sobre el archivo público.
La generación solo lee esa clave de `.env.admin`, `.env.frontend` o `.env.android`; no lee
el `.env` privado ni copia contraseñas. En web se permite base vacía para
mismo origen; Android exige una API configurada. Los archivos reales `.env.*`
y las salidas generadas quedan ignorados por Git.

`build:web` sigue disponible para pruebas del cliente de usuarios; no es el objetivo
de publicación. `build:admin` copia exclusivamente el panel, las utilidades
`Shared/`, el logo y Socket.IO. No copia Dockerfiles, `.env`, backups ni código
del cliente. El Dockerfile del panel usa una lista permitida de archivos en
`Admin/Dockerfile.dockerignore`, aunque su contexto es la raíz del repositorio.

## Separación de clientes y sesiones

El login administrativo conserva suministro y contraseña y reutiliza
`POST /api/auth/login`. Rechaza roles normales antes de consultar datos
administrativos. Para administradores confirma también `/api/admin/resumen`
antes de mostrar el panel. JWT y rol siguen siendo verificados por el backend
contra PostgreSQL; los 19 endpoints administrativos mantienen `requiereAdmin`.

El panel incluye resumen, usuarios/suministros, recibos, cortes, incidencias,
pagos de solo lectura, atención y cuenta. No incorpora nuevas funciones de
negocio. La sesión usa claves `hm_admin_*` independientes del cliente de usuarios.
No recupera sesiones almacenadas sin un login nuevo. El router valida la sesión
administrativa. Logout aborta peticiones, invalida respuestas tardías, limpia
arrays y formularios, revoca fotografías, elimina el DOM administrativo y
desconecta Socket.IO. Se mantiene una conexión por sesión/pestaña.

El cliente acepta únicamente `rol=usuario`; un administrador recibe un mensaje
para utilizar el panel y su sesión se elimina antes de consultar información.
No contiene menús, pantallas, formularios ni llamadas `/api/admin/*`. Su router
solo permite las ocho secciones de usuarios. Logout cancela peticiones y
protege las cadenas asíncronas con una generación de sesión, limpia datos,
formularios y fotografías, detiene polling y desconecta el único socket.

El cliente utiliza `Shared/api.js`, `Shared/ui.js` y `Shared/styles.css`; conserva sus cargadores,
PDF, HidroBot, tutorial y navegación móvil. La sesión de cliente
está en `Frontend/assets/js/client-session.js`. Admin conserva sus cuatro
utilidades compartidas y su sesión independiente. Se mantienen las 41 rutas y el esquema
PostgreSQL; la API sigue siendo la autoridad para permisos. El validador de
recibos pasa fechas DATE como YYYY-MM-DD para evitar desplazamientos de día
por zona horaria. Esta corrección no modifica datos existentes.

## Presentación y documentos

`Shared/styles.css` define la paleta, tipografía del sistema, espaciados,
controles, foco, estados y modales. Los estilos específicos están en
`Frontend/assets/css/client.css`, `Frontend/assets/css/app-layout.css`,
`Admin/assets/css/admin.css` y `Admin/assets/css/workspace.css`. El cliente
prioriza deuda y vencimiento a partir de sus recibos; Admin presenta los seis
listados administrativos en tablas semánticas de escritorio con filtros
existentes, y desplazamiento interno en tablet. Los formularios bloquean
temporalmente el doble envío y ambas interfaces muestran la conexión en vivo.

`Frontend/assets/js/documents.js` reutiliza jsPDF para recibos y constancias
A4, con logo, datos registrados, márgenes y numeración real por página.
No estima impuestos, tarifas ni lecturas del medidor. R-ID es una referencia
interna. La constancia registra un pago del prototipo, sin cargo bancario.
Ambos documentos indican su carácter referencial y la generación por el
reloj del dispositivo. Las fechas de pago proceden de la API; los campos
históricos TIMESTAMP sin zona no tienen una política horaria homologada.

Los nombres son `Recibo_HidroMejora_SUMINISTRO_YYYY-MM.pdf` y
`Constancia_Pago_HidroMejora_CODIGO.pdf`. Si el periodo no tiene formato
YYYY-MM, el archivo utiliza el mes de emisión; el documento conserva el
periodo registrado. El logo incrustado se limita a 320 px para reducir tamaño.

## Preparación de producción (sin despliegue realizado)

1. Neon: crear una base externa cuando se autorice esta fase; guardar la cadena
   real únicamente en Render. No restaurar datos locales todavía.
2. Render: servicio Node desde `Backend/`, instalación `npm ci --omit=dev` e
   inicio `npm start`, health check `/api/health`. Configurar `DATABASE_URL`,
   `AUTH_TOKEN_SECRET`, `NODE_ENV=production` y `CORS_ALLOWED_ORIGINS` con el
   origen exacto de Vercel y `https://localhost` para el WebView Android.
3. Vercel: únicamente el panel, raíz del repositorio, framework Other, comando
   `npm run build:admin`, salida `artifacts/web/admin`. Configurar `API_BASE_URL` con el
   origen real de Render. No publicar `Frontend/` como web de clientes.
4. Android de producción: poner ese mismo `API_BASE_URL` HTTPS en `.env.android`
   y sincronizar otra vez. Los cambios de URL requieren regenerar web/APK.

Las previews de Vercel necesitan autorización CORS explícita si se van a probar.
No se permite `*`. Render gratuito puede suspenderse por inactividad; los
timeouts iniciales no implican pérdida de datos. No alojar PostgreSQL dentro
del contenedor de Render ni usar una base gratuita que caduque para persistencia.

URLs de producción: **pendientes**. No se ha creado ni verificado ningún
dominio Vercel/Render/Neon. Ninguna configuración depende de Quick Tunnel.

## Android y Java 21

El nombre visible es Hidro-Mejora y el identificador se mantiene en
`pe.edu.hidromejora.app`. El icono adaptativo y splash utilizan recursos
vectoriales `hm_launcher`, `hm_launcher_foreground` y `hm_splash`, con colores
en `hm_colors.xml`. Los recursos anteriores de plantilla siguen conservados.
Los permisos de ubicación aproximada y precisa se
piden mediante Capacitor al utilizar geolocalización, sin ubicación en segundo
plano. El HTTP de desarrollo se permite únicamente en debug para tres hosts
locales; la configuración HTTPS usa el origen WebView `https://localhost`.

```bash
cp .env.android.example .env.android
npm run cap:sync
npm run android:gradle -- --version
npm run android:gradle -- compileDebugJavaWithJavac testDebugUnitTest
```

El ejemplo Android usa `10.0.2.2:8080` para acceder a Docker desde un emulador.
Con teléfono conectado por USB se puede usar `adb reverse tcp:8080 tcp:8080`
y `API_BASE_URL=http://localhost:8080`. Android y web publicados usarán la misma
API HTTPS de Render, una vez disponible; la web publicada será solo administrativa.

`scripts/android-gradle.sh` selecciona JDK 21 mediante `JAVA_HOME_21`, el
`JAVA_HOME` actual si ya es 21, o una instalación 21 de SDKMAN/Linux. Solo
cambia el entorno de ese proceso. También guarda la ruta local del JDK en
`android/.gradle/config.properties` y, si aún no hay ajustes IDE, configura
Android Studio con `GRADLE_LOCAL_JAVA_HOME`. Ambos archivos se ignoran en Git.
Si ya existen ajustes IDE con otro JDK, seleccionar JDK 21 como Gradle JDK
del proyecto; no cambiar el Java global.

`cap:sync` genera una salida Android nueva y vacía. Conserva temporalmente el
runtime y `assets/public` anteriores en staging para recuperación. Después de
verificar el reemplazo elimina esas copias generadas, sin acumular backups.
Comprueba que el runtime incluya las funciones de usuario y no contenga código
administrativo. Si falla Capacitor, recupera el `public` anterior.

Para crear un APK sin sobrescribir los anteriores, usar una ruta absoluta
**nueva** mediante la propiedad `hidroBuildDir`:

```bash
npm run android:gradle -- -PhidroBuildDir="$PWD/artifacts/android/builds/manual-fecha/app" :app:assembleDebug :app:testDebugUnitTest :app:compileDebugAndroidTestJavaWithJavac
```

El APK estará en `/ruta/absoluta/nueva/hidro-debug/outputs/apk/debug/app-debug.apk`.
Copiarlo a `artifacts/android/` con un nombre único y sin sobrescribir. No usar
`assembleDebug` con la salida predeterminada si contiene un APK que se debe
conservar. Para la APK release firmada, consultar [docs/ANDROID-RELEASE.md](docs/ANDROID-RELEASE.md).

Compilar y comprobar el contenido del APK no valida su ejecución en WebView.
Las pruebas instrumentales y las funciones nativas de Atrás, permisos,
selección de fotos, ubicación, PDF y Socket.IO requieren teléfono o emulador.
El test unitario de plantilla solo verifica una suma; no cubre estos flujos.

## Respaldos y migraciones

```bash
bash scripts/backup-db.sh
```

Genera un archivo CUSTOM con fecha, hora y sufijo único, permisos privados,
listado `pg_restore --list` y checksum SHA-256. No restaura nada. Verificar
el checksum con `sha256sum -c backups/NOMBRE.dump.sha256`.

`init.sql` solo inicializa volúmenes vacíos. `seed.sql` está vacío y no se
ejecuta automáticamente. Las dos migraciones conservan los registros; no se
aplican en esta fase. Un traslado futuro requiere probar restauración en una
base separada y comprobar todas las tablas, fotos y secuencias.

## Verificación y errores habituales

```bash
npm run test:config
npm run test:documents
docker compose exec -T backend node < scripts/check-local.cjs
docker compose exec -T backend node < scripts/check-admin-local.cjs
```

`check-admin-local.cjs` consulta los datos actuales con una conexión SQL de solo
lectura. Usa JWT internos de prueba, sin mostrar tokens ni necesitar contraseñas.
Las operaciones administrativas de escritura solo se intentan con rol normal y
deben quedar bloqueadas con 403. Las lecturas administrativas se comprueban con
una cuenta administradora activa existente.

La prueba `scripts/test/admin-e2e.cjs` utiliza Chromium headless y una instancia
PostgreSQL aislada. No lee `.env` ni usa `hidro_mejora`. Preparación opcional:

```bash
docker run --detach --pull=never --name hidro-admin-test \
  --tmpfs /var/lib/postgresql:rw --publish 127.0.0.1::5432 \
  --env POSTGRES_DB=hm_admin_test --env POSTGRES_USER=hm_fixture \
  --env POSTGRES_PASSWORD=fixture-only-not-production postgres:18
docker port hidro-admin-test 5432/tcp
# Usar el puerto mostrado y una ruta local a Chromium headless:
HIDRO_TEST_DB_PORT=PUERTO HIDRO_TEST_CHROME=/ruta/chrome-headless-shell \
  node scripts/test/admin-e2e.cjs
```

El script exige la base de pruebas `hm_admin_test` y crea una base vacía nueva
por ejecución. Inicializa solo esa base con el `init.sql` original y verifica
login, roles, navegación, operaciones administrativas, persistencia, fotografías,
logout, respuestas tardías y sockets. `scripts/test/client-checks.cjs` añade
registro/login, exclusión de administradores, dashboard, recibos/copias,
pagos, PDF reales descargados, foto de incidencia, ubicación simulada,
cortes, notificaciones, atención, contraseña, HidroBot, tutorial, navegación
móvil y limpieza del cliente en Chromium. `HIDRO_TEST_DOUBLE_SUBMIT=1` verifica
dobles envíos; `HIDRO_TEST_VISUAL_CAPTURE=1` guarda capturas y comprueba campos
con nombre accesible y ausencia de desbordamiento en escritorio, 320/390 px
y orientación horizontal. Se comprueba Tab desde el título de Admin al
buscador. No equivale a una auditoría completa con lector de pantalla.
`test:documents` necesita Poppler (`pdfinfo` y `pdftotext`) y verifica contenido,
A4, nombres de archivos y paginación con texto extenso. Los fixtures anteriores
se conservan mientras el contenedor tmpfs esté activo. Puede detenerse únicamente
ese contenedor de pruebas al terminar. No se restauran backups reales.

La comprobación local realiza lecturas y conexiones Socket.IO. Usa un JWT de
prueba firmado internamente para un usuario existente, sin imprimirlo; esto
verifica rutas protegidas y autenticación del socket, no el login con contraseña.
También inicia temporalmente otra API dentro del contenedor para comprobar
`PORT`, `DATABASE_URL` local y CORS de producción; siempre termina ese proceso.

- Web o API antiguas: reconstruir backend/web y recargar el navegador.
- CORS: configurar el origen completo, sin rutas ni barra final; volver a
  crear el backend si cambiaron variables Compose. HTTPS Android usa
  `https://localhost`; el debug HTTP usa `http://localhost`.
- Error TLS: revisar cadena y certificados; no usar `rejectUnauthorized:false`.
- Error Java/Gradle: usar `npm run android:gradle`, o definir `JAVA_HOME_21`.
- API Android no configurada: completar `.env.android` y ejecutar `cap:sync`.
- Emulador sin conexión: Docker debe estar activo; el localhost del emulador
  no apunta al equipo anfitrión. No usar túneles temporales.
- Ubicación/PDF/fotos: verificar en un dispositivo; compilar no garantiza
  funcionamiento de permisos y descargas en todos los WebView.

No hay commits ni despliegues automáticos. No publicar `.env`, respaldos,
tokens, contraseñas ni claves de firma.

La mejora integral de octubre de 2026 conserva esta arquitectura y todos los
flujos existentes. El cliente usa navegación inferior móvil y un resumen de
cuenta; Admin tiene un escritorio de gestión y tablas específicas. El detalle
completo y las evidencias están en [docs/MEJORA-PROFESIONAL.md](docs/MEJORA-PROFESIONAL.md).
Los PNG históricos permanecen en Frontend/assets; los paquetes nuevos emplean
el emblema SVG local, coherente con el icono y splash vectoriales de Android.

Android guarda los PDF con el selector de documentos del sistema y trata de
abrirlos con un visor instalado. El puente local HidroDocuments no añade
permisos ni dependencias. Capacitor 7 aplica márgenes automáticos para las barras
y recortes en Android 15+. La validación presencial de guardado, visor, teclado,
GPS, cámara y botón Atrás requiere un teléfono o emulador conectado.

Para ampliar la evidencia del harness aislado descrito arriba:
`HIDRO_TEST_VISUAL_CAPTURE=1 HIDRO_TEST_VISUAL_MATRIX=1 HIDRO_TEST_FULL_TUTORIAL=1`.
La matriz revisa cliente 360/390/412/768/1366 y Admin 768/1024/1366/1920;
comprueba imágenes, nombres accesibles, desbordamiento y límites de modales.
Incluye rechazo de JWT expirado/firma alterada y limpieza por expiración.
Las descargas A4 con logo deben quedar por debajo de 40 KB. No ejecutar las
escrituras del harness contra la base original: exige PostgreSQL temporal.

## Organización y limpieza

Ver [docs/LIMPIEZA-SEDAPAL.md](docs/LIMPIEZA-SEDAPAL.md) para criterios, inventario
eliminado, resultados y regeneración. El código fuente permanece en sus carpetas.
Solo se conservan artefactos útiles; cachés y salidas intermedias pueden limpiarse
al terminar las pruebas. No limpiar mientras Gradle, Capacitor o pruebas estén activos.

El lanzador es `bash scripts/iniciar-hidro.sh`. Docker mantiene sus cuatro servicios.
Las dependencias locales se retiraron después de verificarlas. Antes de compilar
o ejecutar tests, reconstruirlas con `npm ci` y `npm ci --prefix Backend`.
Web/Admin: `npm run build:web` y `npm run build:admin`. Android: `npm run cap:sync`
y `npm run android:gradle -- :app:assembleDebug :app:testDebugUnitTest`.
PDF: `npm run test:documents`, o las descargas de recibo/constancia de la aplicación.
Los tests de navegador generan ambas muestras con logo usando fixtures aislados.

La configuración fuente es únicamente `capacitor.config.js`. Los JSON bajo
`android/app/src/main/assets/` los genera Capacitor; no editarlos manualmente.
Conservar `artifacts/android/cache/android-user-home/debug.keystore`: es la identidad
local de firma debug, **no una caché regenerable equivalente**. Conservar también
`.env`, `android/local.properties`, los ajustes JDK/IDE y los dumps PostgreSQL.
No publicar estos archivos privados. La firma release permanente se guarda fuera
del repositorio; consultar [docs/ANDROID-RELEASE.md](docs/ANDROID-RELEASE.md) para
compilar, verificar y respaldar la clave. No limpiar su directorio privado.
