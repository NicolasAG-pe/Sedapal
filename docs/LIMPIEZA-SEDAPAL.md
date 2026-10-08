> **Informe histórico fechado: 7 de octubre de 2026, anterior al despliegue y a la release v1.0.0.** Todos los conteos de archivos, datos, pruebas, tamaños y estados de este documento corresponden a esa fase de limpieza; no son el estado actual ni una nueva validación. El cuerpo se conserva como evidencia, incluida información única de recuperación. No se verificaron respaldos privados durante la actualización documental.
>
> Guías vigentes: [mantenimiento](MAINTENANCE.md), [pruebas](TESTING.md), [desarrollo local](LOCAL-DEVELOPMENT.md), [Android](ANDROID.md) y [release](ANDROID-RELEASE.md). Los comandos y rutas de artefactos del informe son antecedentes; la lista histórica de archivos conservados no autoriza nuevas eliminaciones.

# Limpieza verificable de Hidro-Mejora

7 de octubre de 2026. Se trabajó únicamente en Sedapal. No se modificó la lógica,
el diseño, las 41 rutas, SQL, migraciones, roles ni datos actuales. No hubo commit,
push, deploy, git reset/clean ni operaciones de eliminación de volúmenes.

## Medición y auditoría

Las cifras incluyen .git y archivos privados locales; cuentan archivos regulares
sin seguir enlaces simbólicos. El espacio indicado es la suma de bytes de archivos,
no bloques asignados por el sistema ni volúmenes Docker. Dependencias y cachés
se reconstruyeron para probar y se retiraron otra vez para entregar una carpeta limpia.

<!-- METRICS -->
| Medida | Antes | Después |
|---|---:|---:|
| Archivos regulares | 44,300 | 639 |
| Bytes de archivos | 1,595,300,429 | 50,201,165 |
| Grupos exactos (sin .git) | 2,108 | 20 |
| Enlaces simbólicos | 210 | 0 |

Reducción de espacio: 96.85 %. Se eliminaron definitivamente
43,726 rutas de archivos originales y
17,072 directorios originales;
10,324 copias redundantes originales desaparecieron.
Además, 931 entradas repetidas de respaldos fuente se almacenan una sola vez.
<!-- END METRICS -->

Auditoría recursiva A–J: ejecución, desarrollo, documentación, generado,
caché, prueba, backup, duplicado exacto, histórico y revisión. La categoría H se
registra adicionalmente mediante SHA-256: ser idéntico no autoriza borrar un recurso
que Gradle/Capacitor necesitan. La clase principal conserva su función.

Evidencias privadas: ../backups/cleanup_20261007_185343/.
Inventarios antes/después, clasificación, grupos por hash, referencias, planes previos
a cada eliminación, directorios/enlaces eliminados y resultados están comprimidos
cuando son grandes. No contienen contraseñas visibles en el informe. Los dumps y
archivos de recuperación sí contienen datos privados y están excluidos de Git.

## Qué se eliminó

- Cachés Gradle/NPM/Chromium, distribuciones copiadas de herramientas y temporales.
- Builds Android históricos/intermedios, APK anteriores reconstruibles y sus copias.
- Resultados repetidos de navegador, screenshots, reportes/logs/JSON de fases y
  anteriores diffs/estados Git; se mantiene evidencia breve de la limpieza actual.
- PDF antiguos/de prueba, renders y salidas web/Admin históricas y de validación.
- Backups acumulados de runtime/public Capacitor, después de preservar versiones únicas.
- Siete copias inactivas de Frontend/backups y Backend/backups, con bytes verificados
  en el checkpoint fuente. No tenían referencias activas.
- Javadoc generado: 84 archivos antes versionados. Se reconstruyó correctamente
  desde las clases Java antes de retirarlo. Las clases/documentación académica se conservan.
- capacitor.config.json de raíz: sus valores se consolidaron en capacitor.config.js
  y se actualizaron los generadores antes de eliminarlo.
- Auditoría, plan, resultado integral y organización de fases en docs/: la información
  operativa se consolidó en README y MEJORA-PROFESIONAL; las versiones originales están
  protegidas en el checkpoint. No se trasladaron cachés/basura a otra carpeta.
- node_modules raíz/Backend, después de npm ci, npm ls y todas las pruebas.
- Tres dumps anteriores, sus listados y checksums: el SQL normalizado que genera
  pg_restore es idéntico al dump reciente, incluidos datos, esquema y secuencias.
  El SQL se procesó en memoria para calcular su huella; no se mostró ni ejecutó.

Los manifiestos enumeran cada archivo, hash, motivo y comando de reconstrucción.
`initialFilesPermanentlyRemoved` cuenta rutas originales ausentes al terminar;
las operaciones de borrar/recrear/borrar durante validación se registran separadas
para no presentar las reconstrucciones como archivos originales adicionales.

## Qué se conserva y por qué

- Fuentes/configuración de Frontend, Admin, Shared, Backend, PostgreSQL y Android.
- package.json y package-lock.json raíz/Backend intactos; wrappers Gradle y tests.
- .env y .env.android originales, ejemplos sin secretos, ajustes locales SDK/JDK/IDE.
- Un dump PostgreSQL reciente verificado, checksum y listado: backups/hidro_mejora_20261007_185414_UaCpgu.dump.
- backups/source-history-deduplicated.tar.gz y checksum: 1.289 rutas históricas mapeadas
  a 358 objetos únicos, todos verificados. 931 contenidos repetidos se almacenan una
  sola vez. Conserva versiones fuente/runtime y la clave debug, no cachés de herramientas.
- backups/cleanup_20261007_185343/sources-before.tar.gz y checksum: checkpoint privado de fuentes
  y configuración anterior a esta limpieza, con copias de código inactivas y documentos.
- APK debug actual, firma verificada: artifacts/android/hidro-mejora-limpio-debug-20261007_190339.apk.
- Dos PDF profesionales útiles en artifacts/pdf/integral-20261007_162512/.
- Runtime actual en artifacts/android/web-runtime y android/app/src/main/assets/public:
  las copias son necesarias para el flujo Capacitor y coinciden con las fuentes.
- artifacts/android/cache/android-user-home/debug.keystore: identidad de firma única.
  NO tratar esa clave como caché. No se configuró firma release.
- Cuatro imágenes históricas únicas de Frontend/assets (LogoSedapal.png, logo.png,
  sedapal1.png y sedapal.jpg): no usadas por runtime nuevo, pero son originales
  distintos y las pruebas verifican su conservación; no son duplicados exactos.
- Configuración/guía VPS histórica y modelo académico Java: contienen información
  única y tienen referencias documentales. No son el despliegue de producción actual.
- 18 scripts actuales: generación, arranque, respaldo, selección JDK, comprobaciones
  o tests. No se confirmó ningún script fuente obsoleto que pudiera borrarse con seguridad.

Los duplicados restantes son runtime Capacitor, recursos Android por ruta/densidad,
archivos vacíos de estructura, ejemplo Android igual a configuración local y el par
antes/después de PostgreSQL. No se rompe su estructura por ahorrar unos bytes.

## Reconstruir

```bash
# Dependencias locales: eliminadas intencionadamente después de validarlas.
npm ci
npm ci --prefix Backend

# Docker no utiliza node_modules del host; conserva su volumen actual.
docker compose up -d

# Paquetes estáticos.
npm run build:web
npm run build:admin

# Recursos y APK Android, Java 21 por proceso.
npm run cap:sync
npm run android:gradle -- :app:assembleDebug :app:testDebugUnitTest :app:lintDebug :app:compileDebugAndroidTestSources

# PDF, A4, contenido y paginación (requiere Poppler).
npm run test:config
npm run test:documents

# Lecturas sobre la base original, sin contraseña/token mostrado.
docker compose exec -T backend node < scripts/check-local.cjs
docker compose exec -T backend node < scripts/check-admin-local.cjs
```

Para pruebas con escritura/descargas PDF reales, usar el PostgreSQL tmpfs y Chromium
según README, nunca la base original. El harness crea su propia base vacía, aplica
init.sql únicamente ahí y comprueba los dos roles. Sus salidas son reconstruibles.
`node scripts/build-web.js android`/`npm run cap:sync` generan siempre desde staging
vacío. Conservan rollback hasta validar el reemplazo y después eliminan solo la copia
generada; ya no acumulan backups de recursos. Los JSON nativos los genera Capacitor:
son salidas, no otra fuente de configuración. La única fuente es capacitor.config.js.

Javadoc: seguir Backend/documentacion/java-docs/README.md; fuente Java conservada.
Gradle y dependencias se descargan/reutilizan al compilar según su wrapper/locks;
la compilación de esta fase usó dependencias instaladas de solo lectura, sin cambiar
Java global ni escribir en cachés globales. Luego retiró la caché local de validación.

## Recuperación de fuentes históricas

El checkpoint es un tar normal. No restaurarlo sobre el proyecto sin revisión.
El archivo deduplicado contiene manifest.json con origin/path/SHA-256/mode y objetos
objects/SHA-256. Para recuperar una versión concreta, consultar manifest.json y extraer
el objeto correspondiente hacia una carpeta privada separada dentro de Sedapal.
Los SHA-256 de todos los objetos se verificaron antes de eliminar paquetes redundantes.
No se ejecutó ninguna restauración PostgreSQL; su checksum y pg_restore --list se
verificaron. No publicar estos archivos: los respaldos de fuentes incluyen .env.

## .gitignore

Cubre node_modules, build/dist, .gradle/.cache, cachés Python, coverage, artifacts, dumps, backups,
.env reales, claves, APK/AAB/AAR, logs, temporales y Javadoc generado. No ignora
HTML/CSS/JS fuente, SQL/migraciones, Gradle/wrapper ni package-lock. seed.sql conserva
su regla privada anterior y su archivo intacto. Los ejemplos .env siguen versionables.

## Pruebas y estado final

- npm ci: 93 paquetes raíz y 120 Backend; npm ls correcto y locks sin cambios; los 3.183 archivos instalados se reconstruyeron
  idénticos byte por byte a los originales.
- Configuración: 13/13. Documentos: 4/4, incluidos A4 y paginación.
- Chromium/API/PostgreSQL tmpfs: 25 comprobaciones y 67 firmas de endpoint observadas;
  registro/login cliente/Admin, CRUD/estados, fotos fixture, GPS simulado, PDF,
  perfil/contraseña, notificaciones, cortes, atención, tutorial completo, HidroBot,
  JWT alterado/expirado, roles, limpieza/logout, respuestas tardías y socket único.
  Sin errores JavaScript ni recursos fallidos. Contenedor de pruebas detenido.
- API local: 19 rutas Admin → 403 al usuario, 401 sin JWT; lecturas administrativas,
  CORS 8080/8081/Android y Socket.IO autenticado comprobados, sin escrituras aceptadas.
  En la base original se usaron JWT internos de prueba; no se probaron contraseñas
  desconocidas de cuentas antiguas. Login con contraseña se validó en fixtures.
- Docker: cuatro servicios healthy; cliente/Admin HTTP 200 y /api/health operativo
  por ambos proxies, incluso tras retirar las dependencias del host.
- PostgreSQL: usuarios 7, suministros 7, recibos 19, pagos 15, incidencias 12,
  cortes_servicio 11, cortes_suministros 1, notificaciones 6,
  notificaciones_lecturas 5 y solicitudes_atencion 1. Huellas de registros/esquema,
  restricciones, índices y 8 secuencias idénticos; mismo contenedor y volumen
  sedapal_postgres_data. Sin reinicialización ni migración.
- Android: build limpio Java 21, offline/sin build-cache, 165 tareas ejecutadas;
  4 tests unitarios; instrumentación compilada; lint 0 errores/16 advertencias previas.
  APK 4.334.152 bytes, firma válida con la misma clave, ID pe.edu.hidromejora.app;
  17 recursos web sin Admin, HTML igual a Frontend y API debug 10.0.2.2:8080.
- PDF descargados nuevos: recibo 14.276 bytes, constancia 14.296 bytes, ambos A4.
  Se retiraron las salidas de prueba después de validar y se conservaron solo
  las dos muestras profesionales vigentes. Motor PDF y diseño no se modificaron.

Pendientes: validación presencial Android de GPS/permisos, fotos/cámara, teclado,
Atrás y apertura/guardado de PDF. No se afirma prueba de hardware. Persisten 16
advertencias lint de recursos/dependencias, sin cambios de versiones. Antes de
compilar o ejecutar tests locales otra vez, ejecutar ambos npm ci.

## Git y archivos de esta fase

Modificados: .gitignore, capacitor.config.js, scripts/build-web.js,
scripts/sync-android.cjs, scripts/audit-layout.py, README.md, docs/README.md,
docs/MEJORA-PROFESIONAL.md. Creado: docs/LIMPIEZA-SEDAPAL.md. Eliminaciones
no funcionales listadas arriba. La lógica/frontend/Admin/API/SQL original no cambió.
El diff exclusivo de esta fase está en cleanup-only.diff dentro de la evidencia.

Git conserva todos los cambios previos: 9 M, 86 D y 31 entradas ??; nada staged.
84 D son Javadoc generado de esta limpieza; DEPLOY.md y compose.prod.yaml ya
figuraban D por los movimientos de la organización anterior. Frontend/index.html,
Backend/server.js, Compose y otras M son cambios previos que no se revirtieron.
Git status completo y diff resumido se guardan en git-status-final.txt y
git-diff-stat-final.txt. No equivale a un working tree sin cambios: no se hizo commit.

## Árbol principal final

```text
Sedapal/
├── Frontend/                 Cliente fuente
├── Admin/                    Panel fuente
├── Backend/                  API, tests y modelo académico
├── Shared/                   Utilidades y assets compartidos
├── Base-de-Datos/             SQL y migrations
├── android/                  Fuente/configuración nativa y runtime actual
├── scripts/                  18 herramientas/tests actuales
├── artifacts/
│   ├── android/               APK actual, runtime y clave debug protegida
│   └── pdf/                   Dos muestras vigentes
├── backups/                  Dump actual, fuentes únicas y evidencia de limpieza
├── docs/                     Documentación vigente y referencia VPS histórica
├── compose.yaml
├── capacitor.config.js        Única configuración Capacitor fuente
├── package.json
├── package-lock.json
├── README.md
├── .gitignore
├── .dockerignore
└── .env*                     Privadas locales + ejemplos versionables
```

.git se conserva. No quedan node_modules, builds intermedios, caché Gradle ni
resultados temporales de navegador. El único archivo bajo cache es la clave debug
expresamente protegida. No quedan enlaces de compatibilidad a históricos eliminados.
