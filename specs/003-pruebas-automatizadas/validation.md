# Validación TEST-01 — completada localmente

2026-11-05. Base 162e2d8d9f0c52ce4df70107894d2faa6646e568 más cambios de TEST-01; reportes run.json registran SHA base y SHA256 de package.json/runner/catalog/guard para identificar el working tree medido. Se crea commit independiente después de revisar; no se inventa SHA autorreferente.

## Inventario y conservación

101 archivos: 22 unitarias seleccionadas, 3 contratos, 30 integración, 1 integración loopback, 1 unitaria suplementaria (Poppler), 16 E2E/navegador, 10 Android/dispositivo, 8 helpers, 8 manual/históricas, 1 manual/revisión y 1 live. Incluye 100 archivos anteriores y el test nuevo del runner. No se eliminó ni modificó ninguna prueba previa.

Grupos administrados: unit 22, contract 3, integration 5, e2e 1. El resto es suplementario/helper/opt-in y no se declara aprobado por inventariarlo. Cero duplicados exactos, un alias yape-pilot-flow→payment-audit-flow, seis archivos con solapamientos entre scripts npm antiguos. 49 archivos sin entrada npm histórica directa; JSON distingue grupos nuevos y referencias de helpers, no todos son huérfanos. El análisis de imports es estático y no descubre universalmente llamadas dinámicas.

## Entorno y ejecución

Node22.23.4 de imagen local sedapal-backend:latest (737f3d96f4b8). Sin reemplazar Node20 global. Comparte código read-only, usuario1000, sin capacidades, sin privilegios nuevos; Git/bibliotecas del host read-only por contrato Android. artifacts y /tmp exclusivos de pruebas. `npm ci --prefix /tmp/backend-deps --offline --ignore-scripts --no-audit --no-fund` validó el lockfile Backend desde caché local (151 paquetes), sin instalar en el repositorio ni usar red. No se requieren herramientas nuevas ni npm ci raíz para estas suites.

`npm test -- --coverage --report`: salida0, 128 pruebas aprobadas, 0 fallidas/omitidas. Incluye las 25 entradas unit/contract, omisiones PKG-01, mocks de correo/push, sesión y nuevas pruebas TEST-T01..05 (inventario, entorno limpio, bloqueo de socket/fetch no local, propagación de fallo sintético real y rechazo de CLI/prerrequisitos). La prueba deliberadamente fallida ocurre en un proceso fixture y se comprueba su salida1; no es un fallo oculto de la suite principal.

Primera versión del guard: 127 aprobadas/1 fallida; Node normaliza argumentos como array interno y el guard no lo reconocía. Una conexión a example.invalid falló por DNS en contenedor network none. Se corrigió la normalización y se comprobó bloqueo antes de DNS con socket objeto, socket posicional y fetch. Ningún endpoint real fue consultado. Solo infraestructura nueva de pruebas modificada.

`npm run test:unit -- --list`, `npm run test:contract -- --list`, `npm run test:inventory`: salida0. `npm run test:integration` y `npm run test:e2e` sin prerrequisitos: salida2 esperada, sin abrir servicios/conectar a DB. CLI rechaza grupo/ruta arbitrarios. PKG-T05 conserva la evidencia de 4931f2f: no se repite navegador sin cambios. Live, Android, restauraciones y suites suplementarias no ejecutadas por diseño; no se presentan como aprobadas.

## Integración

PG18.6 nuevo, imagen postgres:18 local; contenedor hidro-test01-fea0f23969 con label hidro.sdd.test. NetworkMode none, cero puertos publicados, PGDATA en tmpfs512MB, sin bind/volume de datos. Los Node de prueba comparten solo su namespace aislado; NODE_PATH usa dependencias existentes de la imagen. Fuentes read-only, servidor API/SQL solo loopback sintético; no montaje del socket Docker en pruebas. Se verificó aislamiento externamente antes del opt-in; el runner añade preflight DB/rol/versión.

`npm run test:integration -- --report`: salida0, 63 pruebas (incluye subtests), 62 aprobadas, 0 fallidas y 1 omisión condicional del caso histórico sin UNIQUE. Cinco archivos: receipt-profile-compat, payment-production-compat, quality-migrations, receipt-concurrency, receipt-schema. Producción sin piloto/laboratorio, concurrencia, errores, rollback y esquema005 cubiertos. Caso omitido ya acreditado por separado en DB-01 (162e2d8); no se repite ni se convierte en requisito nuevo de TEST-01. No quedan casos obligatorios fallando.

No se usaron Neon, servicios reales, respaldos ni volúmenes existentes. La retirada del recurso nuevo se documenta al final de este avance; no se ejecutan otras suites. Los scripts antiguos mantienen sus condiciones originales y no deben usarse con variables reales por inferencia.

## Cobertura y reportes

Cobertura nativa Node22 del conjunto seguro: **líneas47,72%; ramas82,66%; funciones62,92%**. Denominador: archivos cargados que coinciden Backend/**, Shared/**, scripts/** y capacitor.config.js; excluye **/test/** y **/node_modules/** y no incluye fuentes no cargadas ni JS inline sin atribución a archivo. No representa cobertura total del producto ni incluye integración/navegador. No se aplica ningún umbral.

Reporte final local: /tmp/hidro-test01-artifacts/tests/safe-jGIPiO/ con junit.xml, run.json y35 JSON V8. Integración: integration-jaLlBF con JUnit/metadatos. Directorios nuevos, ignorados si se generan bajo artifacts/ en checkout normal. No subir V8 crudo ni fixtures por defecto; CI podrá adjuntar solo JUnit/run.json. Reportes contienen SHA base y huellas de infraestructura, no credenciales heredadas. Las mediciones preliminares antes del ajuste del código no sustituyen este baseline final.

AC-TEST-01..06 cumplidos en alcance declarado. TEST-01 completado, CI-01 habilitado condicionalmente. Publicación prohibida; no ejecución de otros avances.

Retirada verificada:0 conexiones cliente, stop/rm solo del ID/label de PG creado; ningún recurso con label hidro.sdd.test restante. No se eliminaron volúmenes. 63 scripts npm anteriores conservados sin cambios; git diff de pruebas anteriores vacío.
