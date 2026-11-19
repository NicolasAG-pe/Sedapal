# Océano Claro · revisión de la candidata 1.2.3

El cliente de Capacitor y el panel administrativo comparten los estilos de Océano Claro. La revisión local usa sus archivos de aplicación, el backend de integración y una base PostgreSQL 18 exclusiva con datos sintéticos. Se tomó como base el commit `b864825ce9d461edeac88db2758292140556ed95`.

## Abrir la aplicación en Debian

Con el entorno de revisión en marcha, abre estas dos direcciones.

```bash
xdg-open http://127.0.0.1:45932/
xdg-open http://127.0.0.1:45933/
```

| Aplicación | Suministro de prueba | Contraseña de prueba |
| --- | --- | --- |
| Cliente | 900000002 | Oceano-Prueba-2026 |
| Admin | 900000001 | Oceano-Prueba-2026 |

Si el entorno está apagado, inícialo en una terminal. Usa las dependencias del worktree y la imagen local de PostgreSQL que ya están en este equipo.

```bash
cd /home/nico/.local/share/hidromejora/oceano-claro-implementacion
export PATH="/home/nico/.nvm/versions/node/v22.23.4/bin:$PATH"
node scripts/revisar-oceano.cjs
```

El proceso sirve la API en el puerto 45689 y las interfaces en 45932 y 45933, todos en loopback. Ctrl+C detiene la API, las interfaces y los dos workers de correo. El contenedor `hm-oceano-pg-local` conserva los datos mientras sigue en ejecución. Detener ese contenedor descarta su base temporal. Para probar un registro o la recuperación de contraseña, los códigos solicitados se entregan en el buzón de este entorno. Puedes consultarlo desde otra terminal del worktree.

```bash
tail -f artifacts/oceano/revision/buzon-local.jsonl
```

## Recorrido sugerido

| Área | Qué revisar |
| --- | --- |
| Inicio y consumos | La cuenta de muestra tiene un saldo de S/ 68.40, un vencimiento el 28 de noviembre y seis periodos. Abre el detalle de noviembre. Los 17 m³ están por debajo del promedio de 17,5 m³. |
| Recibos y documentos | Filtra el historial y abre el detalle o «Mis documentos». Descarga el recibo. Verifica el suministro, el periodo y la fecha de vencimiento. |
| Operaciones | En el recibo pendiente, confirma un registro directo. Descarga la constancia y comprueba que aparece en el historial y se conserva el saldo. El flujo manual de prueba se revisa en Pagos de Admin. |
| Atención del suministro | Registra una incidencia o una solicitud de atención, consulta el seguimiento y revisa cortes y notificaciones. Sus datos se guardan en PostgreSQL local. |
| Cuenta, navegación e HidroBot | Revisa registro, OTP, recuperación, Perfil, preferencias y tutoriales. Abre el asistente, envía una consulta y un seguimiento, minimízalo y vuelve al historial. El proveedor de conversación de la revisión es local. |
| Admin | Consulta Resumen, Usuarios y su ubicación de suministro, Recibos, Pagos, Cortes, Incidencias, Atención y Cuenta. Las tablas conservan los filtros, permisos, acciones y formularios de cada módulo. |

## Evidencias y pruebas

Desde el worktree puedes abrir los PDF descargados por el cliente y las capturas del recorrido.

```bash
xdg-open artifacts/oceano/documentos/recibo.pdf
xdg-open artifacts/oceano/documentos/constancia.pdf
xdg-open artifacts/oceano/visual/
```

| Comprobación | Resultado |
| --- | --- |
| Pruebas unitarias y contratos | 214 aprobadas. Incluyen comparación por debajo, igual y por encima del promedio, ausencia de lecturas, sesiones, HidroBot y adaptadores con transporte controlado. |
| Integración con PostgreSQL | 93 aprobadas con el esquema actual. El caso opcional de duplicados históricos se ejecutó además con el esquema anterior y pasó. |
| Recorridos de autenticación, OTP, recuperación, incidencias, operaciones y notificaciones | 72 aprobados con el backend local y Chromium según el caso. Otra ejecución de 8 pruebas verificó Perfil, teclado y revisión manual de operaciones. Las suites se solapan. |
| Recorrido completo de cliente y Admin | 28 comprobaciones en Chromium contra la API y PostgreSQL. Verifica los permisos en 19 rutas administrativas, persistencia, dos descargas, cierre de sesión y sockets. Cero errores de JavaScript y cero recursos fallidos. |
| Pantallas y estados | 27 estados del cliente en 360 × 800, 390 × 844 y 390 × 440. 18 estados de Admin en 1024 × 768 y 1440 × 900. Pasaron las 117 combinaciones. El diálogo de revisión manual también se verificó por separado en los dos tamaños de Admin. |
| Contraste y foco | 944 mediciones de etiquetas y controles sobre los fondos muestreados. El menor contraste de texto fue 4,84:1. El foco de la pestaña activa alcanzó 6,88:1 en tres anchos. |
| Documentos | 17 pruebas del generador. Los dos PDF de muestra son A4 de una página, con texto seleccionable y legibles en escala de grises. Contenidos largos y paginación también probados. |
| Android | Release 1.2.3 (9), cuatro pruebas JVM aprobadas, pruebas instrumentadas compiladas. Android Lint terminó con cero errores y 18 advertencias. |

Para repetir las pruebas principales en este equipo, usa la base de QA dedicada en el puerto 45941. Es independiente de la revisión interactiva.

```bash
cd /home/nico/.local/share/hidromejora/oceano-claro-implementacion
export PATH="/home/nico/.nvm/versions/node/v22.23.4/bin:$PATH"
npm test
npm run test:documents
export HIDRO_EMAIL_TEST_DB_PORT=45941 HIDRO_TEST_ISOLATED_DB=1
npm run test:integration
HIDRO_RECEIPT_TEST_LEGACY=1 node --test --test-name-pattern="histórico duplicado" Backend/test/receipt-concurrency.cjs
export HIDRO_TEST_CHROME=/home/nico/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome
HIDRO_TEST_COMPOSE_SMOKE=0 HIDRO_TEST_REPORT_DIR="$PWD/artifacts/oceano/e2e" node scripts/test/admin-e2e.cjs
export PLAYWRIGHT_BROWSERS_PATH="$PWD/artifacts/oceano/browser-cache"
node --test --test-concurrency=1 scripts/test/payment-flow.cjs scripts/test/profile-navigation.test.cjs
```

El recorrido E2E usa sus propios servidores. La opción de Compose omite la comprobación de los puertos 8080 y 8081 de otro entorno. Los informes de estas ejecuciones están en `artifacts/oceano/`.

## APK y pendientes

La candidata está en `artifacts/android/hidro-mejora-v1.2.3-release.apk`. Conserva el identificador `pe.edu.hidromejora.app` y el certificado SHA-256 de la candidata 1.2.2 (8). Su runtime incluye los archivos del cliente y el generador PDF de esta rama. El empaquetado de release conserva la configuración de API oficial prevista por el proyecto. Para la revisión con PostgreSQL local, abre las URL de esta guía.

```bash
(cd artifacts/android && sha256sum -c hidro-mejora-v1.2.3-release.apk.sha256)
```

Falta validar la actualización sobre el POCO, el teclado de Android en el dispositivo, TalkBack, el selector nativo de archivos y la entrega real por FCM, correo y GroqCloud. La comprobación del teclado usó Chromium con altura reducida y una segunda prueba con desplazamiento de `visualViewport`. El informe de Android Lint incluye recursos sin uso, iconos y orden del manifiesto. Dos de las advertencias corresponden a los colores históricos de marca que se conservaron al aplicar los nuevos colores del tema.
