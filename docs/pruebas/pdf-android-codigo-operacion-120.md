# Código de operación y PDF Android — desarrollo 1.2.0

Fecha: 26/10/2026. Rama `feature/identidad-acuatica-pdf-120`, Draft PR #15.
Base: `e5d6e65f848080c9fb981dd22437563bfd4e665b`.

## Ajuste

Las etiquetas del formulario, historial, Admin y constancias pasan a «Código de
operación». «Número de operación de Yape» se conserva para declaraciones externas
identificadas como Yape del piloto manual no sintético; no se atribuye ese origen a
referencias históricas, de otros métodos o de laboratorio.

Solo cambia la presentación. No se renombran variables, campos, contratos, estados,
auditorías ni archivos descargados por la aplicación. Sin cambios CSS, logo, paleta,
composición PDF, OTP, 2FA, Keystore, Socket.IO, reglas financieras o migraciones.
La confirmación de pruebas sigue exigiendo que no se recibió dinero. El recibo
permanece pendiente y la operación no acredita fondos ni cancela deuda.

## Evidencia local

Archivos ignorados por Git, sin datos personales ni QR receptor real:

- `output/pdf/codigo-operacion-120/recibo-servicio.pdf`
- `output/pdf/codigo-operacion-120/constancia-operacion.pdf`
- `artifacts/codigo-operacion-pdf-120/`: logs, manifest y renderizados de ambas páginas.
- `audit/client-register-payment.png`, `audit/client-confirmed-history.png`,
  `audit/after-modal-390.png` y capturas de las cinco resoluciones.

PDF generados con el generador real y datos de laboratorio: un A4 por documento,
logo proporcional, azul/celeste originales, S/ 1.00, fechas legibles y aviso
«Entorno de pruebas · Sin cobros reales». Constancia con «Código de operación»,
«Operación confirmada» y «No se recibió dinero», sin atribuir acreditación bancaria.
Todas las páginas se renderizaron con Poppler y se revisaron visualmente.

Android: `artifacts/android-session-native-hPCTjE/` conserva `result.json`,
`native-recibo.pdf`, `native-constancia.pdf`, `payment-register.png`,
`payment-confirmed.png` y ambos `native-*-viewer.png`, revisados visualmente.
Guardado real mediante SAF, apertura en visor y retorno con Atrás aprobados para ambos
documentos. También pasan sesión cifrada, force-stop, corte/reconexión de red, actualización
en vivo, deuda intacta, prevención de duplicados y logout/reapertura. Gradle/Java21:
assembleDebug y assembleDebugAndroidTest aprobados; instrumentación Keystore 1/1.
Sin pruebas fallidas u omitidas en las suites focalizadas. No se repite lint/JUnit general
porque no hay cambios Java; prueba física pendiente según la guía siguiente.
Los ejemplos y PDF anteriores no se sobrescribieron.

| Prueba ejecutada | Resultado |
| --- | --- |
| Documentos, paleta y presentación | 23/23 |
| E2E cliente/Admin responsive + API/PostgreSQL18/Socket.IO reales | 1/1, 16 comprobaciones |
| Primera conexión, carreras REST y reconexión | 1/1, 5 comprobaciones |
| Resoluciones | 360×800, 390×844, 768×1024, 1366×768, 1920×1080 |
| Android API35 / WebView real | 10 comprobaciones aprobadas, 0 errores; hPCTjE |

Las pruebas PDF rechazan la etiqueta anterior y un número Yape en operaciones de
laboratorio o datos históricos sin ese origen. El contrato del piloto externo conserva
su etiqueta Yape y los controles de importe/referencia/recepción independiente.
E2E conserva bloqueo de duplicados, recuperación HTTP, auditoría original y deuda
pendiente. No se mueven fondos ni se contacta un proveedor financiero.

Node22: `artifacts/pagos-pdf-120/tools/node`. Comandos focalizados:

```sh
node --test scripts/test/documents.test.cjs scripts/test/ui-money.test.cjs scripts/test/identity-palette.test.cjs
node --test scripts/test/yape-pilot-flow.cjs scripts/test/payment-realtime-flow.cjs
HM_PDF_EXAMPLE_DIR=output/pdf/codigo-operacion-120 node scripts/generate-payment-audit-examples.cjs
HIDRO_EMAIL_TEST_DB_PORT=PUERTO_FIXTURE node scripts/test/android-session-native.cjs --payments --yape-pilot
```

Usar las rutas de Playwright, ADB y Java21 documentadas en `textos-pagos-120.md`.
La fixture PostgreSQL es nueva y aislada. El AVD dedicado se inicia con SwiftShader
sin Vulkan según el resultado anterior; antes del test se comprueban rutas de red y
que no haya un aviso ANR. No se usan teléfonos físicos en la automatización.

## Abrir los archivos en Debian

Desde la raíz del repositorio:

```sh
xdg-open output/pdf/codigo-operacion-120/recibo-servicio.pdf
xdg-open output/pdf/codigo-operacion-120/constancia-operacion.pdf
```

## Comprobación física por USB sin instalar APK

Esta prueba abre los documentos generados en el visor del celular. No comprueba el
botón de descarga de una APK nueva. La descarga/SAF se comprueba en el emulador;
probar ese código en el celular requerirá una autorización posterior de instalación.
No ejecutar `adb install`, `adb uninstall`, limpieza de datos ni cambios de firma.

**Opción sencilla, sin depuración USB:** conectar el celular desbloqueado, seleccionar
«Transferencia de archivos» en la notificación USB y copiar ambos PDF desde la carpeta
local anterior a una carpeta nueva dentro de Download/Descargas. En el celular abrir
Archivos → Descargas → esa carpeta y tocar cada PDF con el visor ya instalado.

**Opción ADB:** activar depuración USB voluntariamente y autorizar esta laptop en el
celular. Identificar el número de serie físico con `adb devices -l`; no elegir
`emulator-5582` ni usar ADB sin `-s` cuando haya varios dispositivos. Sustituir el
marcador de la primera variable antes de ejecutar:

```sh
TELEFONO_HM='SERIAL_FISICO_AUTORIZADO'
CARPETA_PDF_HM="/sdcard/Download/HidroMejora-PDF-120-$(date +%Y%m%d-%H%M%S)"
adb -s "$TELEFONO_HM" shell mkdir -p "$CARPETA_PDF_HM"
adb -s "$TELEFONO_HM" push output/pdf/codigo-operacion-120/recibo-servicio.pdf "$CARPETA_PDF_HM/"
adb -s "$TELEFONO_HM" push output/pdf/codigo-operacion-120/constancia-operacion.pdf "$CARPETA_PDF_HM/"
```

Abrir ambos desde Archivos → Descargas → HidroMejora-PDF-120-fecha-hora. Comprobar
logo nítido, zoom, importe/fechas, una sola página, bordes/pie completos, nueva etiqueta,
aviso de pruebas y ausencia de recepción bancaria ficticia. Girar el teléfono y volver
al visor. Conservar una captura sin datos reales. Esta validación física queda pendiente;
no se ejecutó ni se instaló/reemplazó ninguna APK oficial.

## Control de publicación

Commit/push solo en la rama visual, PR #15 Draft con base `feature/yape-piloto-120`.
Exclusiones Vercel conservadas en ambos archivos; Render solo consultado en lectura.
Sin merges, deployments, cambios en Neon, Kubernetes, registro o cobros reales.
Las APK 1.1.1 y 1.1.2 se conservan con sus SHA-256 anteriores. No se publica 1.2.0.
Los contenedores del usuario se preservan; el laboratorio nuevo se detiene sin eliminar
sus volúmenes. Siguiente paso: revisión física de estos documentos por el propietario.
