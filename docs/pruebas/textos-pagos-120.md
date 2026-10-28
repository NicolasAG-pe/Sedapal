# Textos de pagos y documentos — desarrollo 1.2.0

Fecha: 26/10/2026. Rama `feature/identidad-acuatica-pdf-120`, Draft PR #15.
Base revisada: `17c14a5db2dab7a2ac91b08e5543b5aa0e7ef054`.

## Cambio comprobado

Cliente Android/web, Admin y documentos presentan «Pago con Yape», «Registrar pago»,
«Confirmar operación», «Operación confirmada» y «Constancia de operación».
La pestaña técnica `simulaciones` se muestra como «Pruebas». Los mensajes automáticos
del backend explican la revisión sin repetir etiquetas técnicas.
El aviso «Entorno de pruebas · Sin cobros reales» aparece en pagos y en los PDF.

El checkbox obligatorio conserva el campo `ensayo_confirmado` y exige:
«Confirmo que no se recibió dinero. Esta revisión no acredita fondos ni cancela una deuda».
Los estados, campos, endpoints, auditoría, requisitos de cotejo de una transferencia
auténtica y bloqueos contra duplicados no cambian. Ninguna operación de pruebas
cancela deuda ni crea una recepción bancaria.

Los tres mensajes automáticos conocidos se presentan mediante
`HMShared.ui.paymentAuditMessage`. La API y el historial almacenado conservan sus
literales originales. La prueba E2E comprueba el motivo original de la revisión
mientras la pantalla muestra su texto breve. Los motivos escritos por personas no
se reescriben ni se ocultan; pueden contener términos históricos y se muestran fielmente.

## Validación ejecutada

Node.js 22.23.4, Chromium de Playwright y PostgreSQL 18 nuevos, con cuentas y QR
sintéticos. Sin credenciales productivas, envíos de correo o transferencias.

| Comprobación | Resultado |
| --- | --- |
| Documentos, paleta y presentación de auditoría | 23/23 |
| Backend de operaciones y piloto Yape | 18/18 |
| Flujo cliente/Admin, respuestas perdidas y logout | 4/4 |
| Auditoría E2E con API/PG/Socket.IO reales | 1/1, 16 comprobaciones |
| Reconexión, primera conexión y carreras REST | 1/1, 5 comprobaciones |
| Responsive cliente/Admin | 360×800, 390×844, 768×1024, 1366×768 y 1920×1080 |
| PDF generados y renderizados | 8 archivos, 11 páginas A4 revisadas visualmente |
| Android nativo API35 / WebView real | 10 comprobaciones aprobadas, 0 errores; uCJFdo |

Las comprobaciones se solapan; no sumar como casos únicos. Se mantienen validaciones
de campos obligatorios, importe/referencia incorrectos, QR no repetible, rechazo y
cancelación, idempotencia, historial, separación de recepción/revisión y recibo pendiente.
Los PDF conservan sus advertencias referenciales y no presentan acreditaciones ficticias.

Evidencia local ignorada: `artifacts/textos-profesionales-120/`:
`documents-ui.log`, `backend.log`, `payment-flow-retry.log`, `audit-retry.log`,
`audit/e2e-result.json`, `realtime/result.json` y `pdf/manifest.json`.
Capturas: `audit/client-register-payment.png`, `audit/client-confirmed-history.png`,
`audit/after-table-1366.png` y `audit/after-modal-{360,390,768,1366,1920}.png`.
PDF de muestra: `output/pdf/textos-profesionales-120/constancia-operacion.pdf`.
Android final: `artifacts/android-session-native-uCJFdo/result.json` y
`android-stable.log`. Capturas `payment-register.png`, `payment-confirmed.png`,
`native-constancia-viewer.png` y `native-recibo-viewer.png` revisadas visualmente.
Gradle/Java21: assembleDebug y assembleDebugAndroidTest aprobados; instrumentación
Keystore 1/1. No se repite lint/JUnit general por tratarse de textos sin cambios Java.
Todas las páginas de las variantes se renderizaron con Poppler en `pdf/` y se revisaron.
Los archivos anteriores se conservaron.

Incidencias de ejecución resueltas:

- La primera ejecución de cuatro pruebas no recibió `HIDRO_EMAIL_TEST_DB_PORT`:
  no llegó a probar la aplicación. Repetición con la fixture aislada: 4/4.
- El E2E buscaba la referencia anterior después de cambiar el dato de ejemplo a
  `PRUEBA20261026`; se corrigió la búsqueda del fixture. Repetición completa: aprobada.
- El primer Android (`artifacts/android-session-native-WXLwh2`) se detuvo en SAF:
  el diálogo «System UI isn't responding» del AVD cubría el selector. Se conserva
  `failure.png` y el resultado fallido. Se reinició únicamente el AVD dedicado, sin
  borrar datos; tras el arranque reapareció el aviso y se pulsó «Wait». Se verificó
  su desaparición antes del flujo de prueba. Sin cambios de producción ni relajación
  de las comprobaciones de descarga.
- La siguiente ejecución (`artifacts/android-session-native-sFWoLA`) no pudo conectar:
  Wi-Fi figuraba conectado, pero la tabla de rutas 1016 estaba vacía y una petición
  TCP al host devolvía «Network is unreachable». Se restablecieron datos/Wi-Fi solo
  en el AVD. Antes de repetir, la misma petición HTTP recibió 200; evidencia en
  `avd-network-probe.txt`. No se tocaron timeouts ni controles del cliente.
- En la tercera ejecución (`artifacts/android-session-native-lbikVD`) el emulador
  terminó con SIGSEGV (código 139), dejando ADB offline. Se conservó el resultado.
  Se relanzó el mismo AVD con el modo documentado `-gpu swiftshader -feature -Vulkan`,
  2048 MB y dos núcleos; no se borró ni recreó el AVD. El modo anterior era
  `swiftshader_indirect`. El arranque con el nuevo renderizador terminó sin diálogo
  ANR y con respuesta HTTP 200 al host antes de repetir el flujo.

Comandos focalizados (Node22 y herramientas existentes):

```sh
node --test scripts/test/documents.test.cjs scripts/test/ui-money.test.cjs scripts/test/identity-palette.test.cjs
HIDRO_EMAIL_TEST_DB_PORT=PUERTO_FIXTURE node --test Backend/test/yape-pilot.cjs Backend/test/payment-operations.cjs
HIDRO_EMAIL_TEST_DB_PORT=PUERTO_FIXTURE node --test scripts/test/payment-flow.cjs
node --test scripts/test/yape-pilot-flow.cjs scripts/test/payment-realtime-flow.cjs
HIDRO_EMAIL_TEST_DB_PORT=PUERTO_FIXTURE node scripts/test/android-session-native.cjs --payments --yape-pilot
HM_PDF_EXAMPLE_DIR=output/pdf/textos-profesionales-120 node scripts/generate-payment-audit-examples.cjs --variants
```

Configurar `PLAYWRIGHT_BROWSERS_PATH` y `HIDRO_ADB` con las herramientas locales según
el informe de identidad acuática. No usar una base existente para estas pruebas.
Los nuevos contenedores de prueba se detienen conservando sus volúmenes; los pilotos
ya abiertos por el usuario y los servicios originales permanecen intactos.

La repetición completa con el AVD estable pasó: declaración, sesión cifrada/force-stop,
Socket.IO, desconexión/reconexión, PDF/SAF/visor/Atrás, QR bloqueado, deuda intacta y
logout sin restauración privada. No quedan fallos críticos de la validación focalizada.
Los tres intentos fallidos de entorno se conservan y no se cuentan como aprobados.

## Alcance y publicación

Sin nuevas migraciones, cambios de esquema, autenticación, firmas ni configuración de
pagos reales. OTP/2FA no se vuelven a probar extensamente por este cambio de textos;
no se modificaron sus flujos. No se declara prueba física Android, bancaria ni de impresión.

Ambas exclusiones Vercel se conservan; antes del push, consulta de previews vacía y
Render con autodeploy/previews desactivados, consultado solo en lectura. No se modifican
main, PR #11–#14, Neon, Render, Vercel, Kubernetes ni las APK oficiales 1.1.1/1.1.2.
No hay release, merge o publicación de 1.2.0. Siguiente etapa pendiente: revisión humana
de la copia aprobada y pruebas físicas antes de decidir una publicación futura.
