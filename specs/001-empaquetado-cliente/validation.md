# Evidencia de PKG-01 — validación parcial

Fecha: 2026-11-04. Rama: chore/adopcion-sdd-rpi. Código base: d3d27d068a53dff8e536d690e615f858722157bb. PLAN-01: f7f21e6. Corrección: commit local de PKG-01 posterior a ese commit; el hash se comunica al verificar el cierre, sin autorreferencia dentro del documento.

Estado: implementación aplicada, NO completada bajo SC-PKG-001. No se modificó DB-01 funcionalmente, SQL, infraestructura ni la otra copia.

## Entorno y límites

Node v20.19.2; Node 22 de referencia no disponible en PATH ni instalado. Docker cliente/servidor 26.1.5+dfsg1 y buildx 0.13.1+ds1. Build con instancia default/driver docker ya existente; no se creó builder, tag, servicio ni contenedor de aplicación, ni se alteraron los existentes. Las capas de apt/nginx estaban en caché. Se generaron caché de build y tar temporales, sin ejecutar Nginx. Acceso al daemon y escritura Git requirieron ejecución fuera del sandbox. No se instalaron dependencias.

## Pruebas primero

Comando: `node --test scripts/test/client-packaging.test.cjs`.

Antes de corregir: 9 casos, 6 aprobados y 3 fallidos, salida 1. Fallos pertinentes: el verificador no rechazó ausencia de password-recovery-ui.js; COPY no cubrió esa referencia; faltó negación explícita para two-factor-ui.js. La ejecución inicial del runner dentro del sandbox solo devolvió fallo genérico del proceso; se repitió fuera del sandbox y mostró los casos. También se comprobó mediante ejecución directa del archivo. No se atribuye el fallo genérico al código del producto.

## Regresión tras corrección

Comando:

```sh
node --test scripts/test/client-packaging.test.cjs scripts/test/public-api-config.test.js scripts/test/android-upgrade.test.cjs
```

Resultado: salida 0, 17 casos aprobados, 0 fallidos, 0 omitidos. Nueve nuevos: artefactos web/Android con referencias HTML/CSS, contenido idéntico de los tres módulos, controles sintéticos de privacidad, tres omisiones deliberadas, rechazo de código Admin, COPY/contexto y referencia Kubernetes. Ocho existentes: configuración pública, separación Admin, empaquetado Android e identidad/configuración nativa sin compilar APK.

Se proporcionó API_BASE_URL sintética explícita a los builds de prueba, evitando leer .env. Las pruebas nuevas limpian únicamente sus directorios temporales propios. Las pruebas existentes pueden dejar sus salidas temporales, sin alterar artefactos anteriores. No se ejecutaron suites live, HTTP ni base de datos. No se midió cobertura instrumentada; no se afirma un porcentaje ni validación bajo Node 22.

## Build e inspección independiente

Comandos, desde la raíz, sin tags ni contenedores:

```sh
docker build --progress=plain --output type=tar,dest=/tmp/hidro-pkg01-before-f7f21e6.tar -f Frontend/Dockerfile .
docker build --progress=plain --output type=tar,dest=/tmp/hidro-pkg01-after-f7f21e6.tar -f Frontend/Dockerfile .
```

Ambos terminaron con salida 0. El build previo tenía 20 archivos regulares bajo var/www/html y carecía de recuperación/seguimiento. two-factor-ui.js SÍ estaba: el fallo BuildKit previsto inicialmente NO se reprodujo. La discrepancia entre allowlist específica y selección efectiva del ignore por este builder permanece sin explicación; no se añadió un nuevo builder ni se alteró el alcance para investigarla.

El tar corregido tiene 22 archivos de runtime. Se inspeccionó con tarfile de Python: referencias HTML existentes, tres módulos iguales byte a byte a Shared, nombres sin .env/keystore/key/dump/backups/Admin y ausencia de patrones de claves privadas/tokens GitHub/AWS. Es una revisión acotada, no garantía universal de detección de secretos. Los únicos orígenes COPY son los públicos revisados; no se copió Shared completo. También se ejecutó verifyClientRuntime sobre los archivos regulares extraídos selectivamente a un directorio nuevo de /tmp: `{ files: 22, administrativeCode: false }`.

SHA-256 del tar corregido: `59eeed597b09b83b7b46a6215a3ada10f2f15b608a49acb9a5853958eddce725`.
Los tar son evidencia temporal local, no se versionan ni publican. No se asumió que los tar de sistema debían extraerse íntegramente ni se siguieron symlinks al inspeccionar runtime.

## Aceptación y pendientes

| Criterio | Estado real |
|---|---|
| AC-PKG-01 | Comprobado: build corregido termina, recursos COPY presentes; el fallo previo de build no se reprodujo |
| AC-PKG-02 | Parcial: archivos y contenido correctos; HTTP y MIME no ejecutados |
| AC-PKG-03 | Pendiente: flujos de navegador/flags con fixtures |
| AC-PKG-04 | Aprobado: control positivo y omisiones deliberadas de los tres módulos |
| AC-PKG-05 | Aprobado en artefactos locales: web/Android y separación Admin; sin prueba de despliegue o APK |

PKG-T05 no ejecutada porque el propietario prohíbe iniciar servicios. No se simula como aprobada. No hay pruebas necesarias fallando después de la corrección; sí hay validación necesaria pendiente. No cerrar PKG-01 hasta HTTP/MIME y flujos afectados bajo autorización compatible. Conservar Node 22 como verificación pendiente. SonarQube no ejecutado. No push, PR, merge ni despliegues. DB-01 permanece pendiente de autorización.

## Validación final autorizada — cierre de PKG-01

Código evaluado: 53a9d33. Fecha de sesión: 2026-11-04. No se repitió Research general ni el build suficiente ya registrado.

Node 22.23.4 encontrado en sedapal-backend:latest local. Ejecutadas las mismas 17 pruebas con red none, raíz read-only, tmpfs /tmp y repositorio read-only. Primera ejecución: 16 pasan y una falla por `spawnSync git ENOENT`, prerrequisito del entorno. Segunda ejecución: Git y bibliotecas del host montados read-only, UID 1000; 17 pasan, 0 fallan/omitidas. No se instaló Git ni Node, no se cambió Node 20 global y no se alteraron pruebas para esconder el fallo. Comando de pruebas interno idéntico al del apartado Regresión.

PKG-T05 implementada en scripts/test/client-packaging-browser.cjs. Requiere HIDRO_PKG01_STATIC_ORIGIN apuntando al Nginx temporal verificado; Firefox ESR 153.6.0 instalado. Ejecutar `node scripts/test/client-packaging-browser.cjs` con ese origen. No instala Playwright ni navegador. El frontend se sirve desde la copia del tar verificado por hash y contenido, con la configuración Frontend/nginx/default.conf read-only, Nginx local 1.31.8, red Docker interna nueva y exclusiva; backend se resuelve a loopback sin API real. El servidor de fixtures escucha solo 127.0.0.1:puerto efímero. El navegador usa un perfil nuevo, proxy que rechaza salida externa y CSP self; únicamente se añade instrumentación de errores al HTML servido, sin modificar archivos del artefacto. Las llamadas API son sintéticas; no hay correo, push, sesión real ni PostgreSQL.

Resultados: 10 comprobaciones aprobadas. HTTP directo de Nginx: los tres módulos devuelven 200, Content-Type JavaScript y contenido idéntico a Shared. Firefox: tres factories cargadas por el frontend real; recuperación request/verify/complete con fixture; capacidad no disponible muestra aviso y permite regresar; módulo real de seguimiento muestra/refresca/cierra evento sintético y no abre sin sesión. Cero errores de consola, recursos o promesas; siete solicitudes API sintéticas. El seguimiento usa una instancia aislada del módulo en la página, no un login real ni una integración con PostgreSQL. Es verificación del empaquetado, no certificación integral del producto.

Primer intento HTTP: 404 por raíz temporal 0700 inaccesible al worker Nginx. Se corrigió únicamente la copia pública nueva (directorios 0755, archivos 0644); siguiente ejecución completa pasa. No se cambió configuración de producto. Cada contenedor/red nuevo se verificó por ID/label antes de stop/rm y se retiró; el perfil Firefox y copia pública propios también se retiraron. No se tocaron contenedores previos ni volúmenes. La revisión de privacidad del artefacto y las pruebas bajo Node 22 siguen aprobadas.

AC-PKG-01/04/05 conservan evidencia previa; AC-PKG-02 ahora aprobado por HTTP/MIME; AC-PKG-03 aprobado en los flujos fixture descritos. SC-PKG-001/002/003 satisfechos en el alcance local. PKG-01 COMPLETADO. Sin pruebas omitidas necesarias para este contrato. Cobertura porcentual, otros motores, APK y producción no forman parte de esta validación y no se afirman. Publicación sigue prohibida. DB-01 puede comenzar por autorización condicional del propietario.
