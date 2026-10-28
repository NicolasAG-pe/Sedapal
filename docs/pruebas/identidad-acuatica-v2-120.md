# Segunda composición acuática — desarrollo 1.2.0

Fecha: 26/10/2026. Rama `feature/identidad-acuatica-pdf-120`, Draft PR #15.
Base limpia comprobada: `8b5368435a45227dfb0ffd20466c1a9ec1d413eb`.

## Problema y corrección

La primera identidad mantenía grandes superficies blancas. El último adaptador de
cliente declaraba `.topbar` blanca; el de Admin hacía lo mismo con `.admin-header`.
Además, `.account-overview .balance-card` imponía un fondo sólido y ganaba al selector
menos específico `.balance-card` que intentaba aplicar el degradado. Cambiar tokens
o agregar bordes no corregía esa composición ni la cascada.

Se editaron las reglas de origen de los adaptadores finales y se sustituyeron sus
bloques anteriores de identidad. No se agregó otra hoja de overrides. Orden conservado:
CSS heredado de cada producto → `Shared/styles.css` → `app-layout.css`/`workspace.css`.
Los controles comunes se consolidaron en Shared para evitar declaraciones finales
repetidas de botones/campos/foco.

- Cliente: encabezado y navegación inferior azules, tarjeta de deuda con degradado
  efectivo, suministro en bloque celeste, indicadores en dos columnas móviles,
  alternancia de superficies, cabeceras de recibos/pagos coloreadas y botones destacados.
- Admin: menú oscuro conservado, encabezado azul, cabeceras de sección, indicadores
  diferenciados, encabezados de tablas/filtros celestes y diálogo compacto conservado.
- Login: cabecera de marca dentro de tarjetas celestes. Admin recibe solo un contenedor
  semántico para agrupar su logo/texto; no cambian formularios ni manejadores.
- HidroBot: encabezado y superficies coherentes; ninguna modificación funcional.
- No se introducen nuevos tonos de marca, fuentes, librerías o servicios. Se usan los
  tokens existentes y sus superficies/transparencias; logo e iconos no se alteran.

## Evidencia visual reproducible

En `artifacts/identidad-acuatica-v2-120/`, ignorado por Git:

- `before/`: 100 capturas anteriores, obtenidas antes de editar la interfaz.
- `after/`: 100 capturas finales, mismos recorridos/resoluciones y estados de laboratorio.
- `comparisons/`: 35 comparativas web y 4 Android nativas, con rótulos antes/después.
- Cada comparativa conserva hashes de las capturas fuente en `comparisons/result.json`.
  Solo se recorta al viewport y se agregan rótulos; no se recolorea ni retoca la interfaz.

Viewports Chromium: 360×800, 390×844, 768×1024, 1366×768 y 1920×1080.
Las cuentas de los laboratorios son sintéticas e independientes; sus identificadores
pueden variar entre capturas. No contienen datos de usuarios reales.
Android nativo se distingue de Chromium: AVD API35 `hm_110_debug_api35`, captura física
540×1170. No se presenta ese tamaño como una prueba nativa exacta de 390×844.

Comparativas principales:

- `comparisons/client-login-390.png`
- `comparisons/client-inicio-390.png`
- `comparisons/client-historial-390.png`
- `comparisons/client-pagos-390.png`
- `comparisons/admin-login-1366.png`
- `comparisons/admin-1366.png`
- `comparisons/admin-pagos-1366.png`
- `comparisons/android-native-inicio.png`

Se revisaron visualmente esas composiciones, las pantallas nativas y los PDF.
La comparación cuantitativa usa diferencias RGB significativas y ganancia de área azul;
no considera suficientes cambios de texto/bordes. Sus umbrales mínimos son 8 % de
píxeles cambiados y 2 puntos porcentuales más de área azul en las siete comparativas
principales. Es un control complementario, no sustituye la evaluación humana ni una
certificación de accesibilidad. Admin excluye el menú lateral ya azul al medir sus
pantallas internas de escritorio. El login Admin ya tenía medio panel azul y lo conserva.

Resultados aproximados de la composición (valores exactos en JSON):

| Pantalla | Área cromáticamente distinta | Ganancia de área azul |
| --- | ---: | ---: |
| Login cliente 390 | 37 % | 20 puntos |
| Inicio cliente 390 | 48 % | 13 puntos |
| Recibos cliente 390 | 43 % | 31 puntos |
| Historial pagos cliente 390 | 43 % | 30 puntos |
| Login Admin 1366 | 8 % | 4 puntos |
| Dashboard Admin 1366 | 51 % | 35 puntos |
| Pagos Admin 1366 | 39 % | 27 puntos |

## Pruebas y accesibilidad

Node22, PostgreSQL18 nuevo/aislado, API y Socket.IO de laboratorio reales, Playwright
Chromium y Java21 mediante el wrapper existente. QR, cuentas y recibos sintéticos;
proveedor de correo simulado. Sin transferencias ni mensajes reales.

| Validación | Resultado |
| --- | --- |
| Captura/navegación visual anterior y final | 100 + 100 pantallas, 0 errores JS, sin overflow horizontal global |
| Contraste real en elementos seleccionados | 1076 muestras; mínimo 4,66:1 |
| Foco activo en navegación inferior | 3 px y 8,86:1 en los tres viewports móviles |
| Documentos/paleta/presentación | 23/23 |
| OTP, sesión, compatibilidad, UI 2FA/Admin e HidroBot | 28/28 |
| Flujos de pagos y realtime | 2/2 E2E aprobados (16 y 5 comprobaciones) |
| Android nativo final | 10 comprobaciones aprobadas, 0 errores; gDAw2s |
| Regresión del cierre HTTP del laboratorio | 2/2, peticiones pendientes y cabeceras incompletas |
| Gradle/Java21 | assembleDebug y assembleDebugAndroidTest aprobados; Keystore instrumentado 1/1 |
| PDF de recibo y constancia | A4, una página cada uno, guardados por SAF y abiertos en el visor Android |

No sumar cifras como casos únicos. La regresión comprueba que la deuda permanece,
no hay otra declaración/QR, se conserva auditoría, llegan actualizaciones en vivo y
se recuperan estados al reconectar. No se cambiaron APIs o reglas para pasar pruebas.

En QA se corrigieron tintas pequeñas sobre degradados a blanco y se añadió una
comprobación del foco activo. Esta detectó un outline heredado de 2 px; se fijó
explícitamente a 3 px sin debilitar la prueba. El log fallido `after-final-focus.log`
se conserva; la repetición completa `after-verified.log` está aprobada. El selector SAF
puede devolver temporalmente raíz nula desde UiAutomator; el reintento ya existente
resolvió la extracción sin cambiar límites ni declarar éxito sin archivo/visor.
Gradle conserva el aviso previo de versión XML del SDK, sin errores de compilación.

El proceso Android de `gDAw2s` había completado las diez comprobaciones, pero quedó
esperando el cierre de una conexión HTTP de `netsimd`. Al reanudar se verificó su
propietario y se cerró únicamente el AVD dedicado; el proceso original terminó con
código 0 y escribió `result: passed`. No se reescribió manualmente ese resultado.
Se corrigió el cierre del harness para detener la API y cerrar sus conexiones HTTP
remanentes antes de esperar la liberación de recursos; no se cambió la API productiva.
La regresión usa HTTP y Socket.IO locales reales con dos tipos de conexión retenida.
El reset de un cliente deliberadamente cerrado se valida como `ECONNRESET`, sin aceptar
otros errores. La primera ejecución de esa nueva prueba no gestionaba ese reset;
`native-cleanup-first.log` conserva el fallo, y `native-cleanup.log` registra 2/2 aprobadas.

Las capturas nativas anteriores proceden de `artifacts/android-session-native-FADFVh/`;
las finales de `artifacts/android-session-native-gDAw2s/`, incluidas las imágenes del
visor de PDF. La repetición del cierre corregido está en
`artifacts/android-session-native-1YOROX/result.json` y `native-cleanup-verified.log`:
diez comprobaciones aprobadas, cero errores y proceso terminado por sí solo con código
0, sin detener el emulador para desbloquearlo. Sus pruebas se solapan con las originales;
no se suman como veinte casos distintos.

Logs: `before.log`, `after-verified.log`, `documents-palette.log`, `contracts.log`,
`payments.log`, `native-before.log`, `native-verified.log`, `native-cleanup.log`,
`native-cleanup-verified.log` y `comparisons-final.log`.

## PDF conservados

`Frontend/assets/js/documents.js` permanece idéntico a la base. Se conservan A4,
logo proporcional, cabecera azul, blanco de impresión y bloques celestes. La prueba
compara sus colores con los tokens compartidos, que no cambiaron.
La nueva interfaz no obliga a llenar de tinta los documentos. Se mantienen importes,
fechas, estado real, «Código de operación», alcance referencial y aviso de pruebas.
No se atribuye recepción bancaria a una operación ficticia. Se verificaron ambos
archivos reales exportados por el AVD y sus imágenes renderizadas.

## Repetición y alcance

```sh
export PLAYWRIGHT_BROWSERS_PATH="$PWD/artifacts/vercel-validation/browsers"
HM_VISUAL_OUTPUT=artifacts/identidad-acuatica-v2-120 HM_VISUAL_PHASE=before node --test scripts/test/identity-visual.cjs
# Aplicar la revisión visual y capturar el estado final.
HM_VISUAL_OUTPUT=artifacts/identidad-acuatica-v2-120 HM_VISUAL_PHASE=after node --test scripts/test/identity-visual.cjs
node --test scripts/test/documents.test.cjs scripts/test/identity-palette.test.cjs scripts/test/ui-money.test.cjs
HIDRO_EMAIL_TEST_DB_PORT=PUERTO_FIXTURE node --test scripts/test/android-transition.cjs scripts/test/two-factor-ui.test.cjs scripts/test/hidrobot.test.cjs
node --test scripts/test/yape-pilot-flow.cjs scripts/test/payment-realtime-flow.cjs
node --test scripts/test/close-native-fixture.test.cjs
HIDRO_EMAIL_TEST_DB_PORT=PUERTO_FIXTURE node scripts/test/android-session-native.cjs --payments --yape-pilot --visual-screens
node scripts/compare-aquatic-identity.cjs --native-before CARPETA_ANTERIOR --native-after CARPETA_FINAL
```

Para recrear el «antes» se necesitan los archivos de la base revisada o sus capturas
conservadas; ejecutar ambas fases sobre el mismo CSS no reproduce la comparación.
No cambiar de rama sobre modificaciones locales para hacerlo. Usar Node22 y las
rutas ADB/SDK/Java21 de los informes anteriores. El AVD utiliza SwiftShader sin Vulkan.

Sin cambios de backend, OTP, TOTP, Keystore, sesiones, Socket.IO, pagos, migraciones,
datos productivos, plantillas PDF, logo o firma. El roadmap permanece intacto.
No se repite lint/JUnit general sin cambios Java. Teléfono físico, TalkBack humano,
impresión y certificación PDF/UA siguen pendientes; no se declaran aprobados.

No se fusiona ni publica 1.2.0. Push solo en la rama visual y actualización del Draft #15.
Ambas exclusiones Vercel se conservan; Render solo consultado en lectura, autodeploy y
previews desactivados. Sin cambios en Neon, Vercel, Render o Kubernetes. APK oficiales
1.1.1/1.1.2 con SHA-256 originales. El laboratorio se detiene sin borrar volúmenes ni
pilotos ajenos. Costo S/ 0. Siguiente paso: revisión visual del propietario y prueba física.
