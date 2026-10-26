# Identidad acuática y rediseño de documentos — desarrollo 1.2.0

Base comprobada: `fae9aa7d0d72f684c0291cc0fe76a3768756443c`.
Rama nueva: `feature/identidad-acuatica-pdf-120`.
Draft [PR #15](https://github.com/NicolasAG-pe/Sedapal/pull/15), base `feature/yape-piloto-120`.
No es un lanzamiento ni un cambio productivo.

## Conservación del trabajo

Árbol inicial limpio; se leyó AGENTS.md y se consultaron los PR #11/#12/#13/#14.
Cadena conservada: #11 sesión automática tras OTP; #12 seguridad TOTP (incluye #11);
#13 pagos/PDF con base #12; #14 piloto y realtime con base #13. Ninguno se fusiona ni
modifica en esta etapa. Se guardaron las referencias remotas iniciales para comparar al cierre.
No se ejecutó reset, clean, stash, pull automático ni borrado de volúmenes/bases.

## Cambios visuales

Paleta y reglas: `docs/IDENTIDAD-VISUAL-120.md`.

- Tokens comunes con la paleta solicitada y tintas semánticas para contraste.
- Login cliente/Admin, tarjeta de acceso, fondos acuáticos decorativos CSS, encabezados,
  navegación, dashboard, tarjetas, formularios y tablas coherentes.
- Registro/OTP/2FA usan los mismos controles y estilos; no cambia su lógica.
- Menús táctiles, safe-area, teclado, avisos de red y persistencia Keystore se conservan.
- El módulo de pagos conserva tabla/tarjetas compactas, filtros, paginación y diálogo;
  no se vuelve al formulario grande dentro de cada operación.
- Logo SVG original, iconos locales y fuentes del sistema conservados. Sin dependencias nuevas.

## Rediseño de PDF

Se conserva jsPDF, las firmas de receipt/payment/save y los nombres de descarga.
La composición sí cambia: encabezado azul con logo proporcional, fichas de identificación,
jerarquía tipográfica, total destacado y tabla legible para recibos. La constancia comienza
por importe y banda de estado, seguida de identificación y trazabilidad. Fechas/actor
solo cuando existen; una declaración o ensayo no se convierte en un pago financiero.

No se estiman nombres, direcciones, tarifas, impuestos, consumos, lecturas ni movimientos.
Las observaciones se resumen sin retirar el aviso referencial ni la advertencia financiera.
No hay QR de validación inventado. Se conserva la fecha de generación del dispositivo
separada de las fechas registradas por el backend.

Se generaron ocho ejemplos sintéticos: recibo, ensayo confirmado, operación pendiente,
rechazada, cancelada, revisión manual y dos casos largos. Son **11 páginas A4** en total;
las seis variantes ordinarias tienen una página y los casos largos continúan sin perder datos.
La plantilla manual verificada es un ejemplo marcado; no certifica una transferencia auténtica.

Ejemplos finales (locales, no versionados):

- `output/pdf/identidad-acuatica-120/final/ejemplos-5onezr/recibo-sintetico.pdf`
- `output/pdf/identidad-acuatica-120/final/ejemplos-5onezr/constancia-ensayo-sintetico.pdf`
- El mismo directorio conserva los otros seis casos.

Antes: `output/pdf/identidad-acuatica-120/before/`.
Inventario exacto: `artifacts/identidad-acuatica-120/pdf-manifest.json`.
Se renderizaron **todas** las páginas con Poppler y se revisaron imágenes/contactos,
además de texto, A4, límites, paginación y ausencia de páginas vacías/superposición de palabras.

## Capturas comparables

`artifacts/identidad-acuatica-120/before/` y `after/`: **100 capturas por fase**,
cinco resoluciones: 360×800, 390×844, 768×1024, 1366×768, 1920×1080.
Cliente: login, registro, Inicio, recibos, pagos, incidencias, cortes, atención, perfil,
HidroBot y diálogo de pago. Admin: login y ocho secciones, incluida seguridad.
API y PostgreSQL reales de laboratorio, sin errores JavaScript ni scroll horizontal.

Comparaciones locales, izquierda antes / derecha después:

- `compare-android.png`
- `compare-admin.png`
- `compare-recibo-sintetico.png`
- `compare-constancia-ensayo-sintetico.png`

Los PDF completos y las imágenes por página permiten ampliar la revisión; no se declara
una mejora basándose solo en los colores. Las posiciones, la tabla, el total y la jerarquía
cambian respecto al generador anterior.

Android anterior: se reutiliza `android-session-native-KoNHIu/payment-pending.png`,
evidencia nativa conservada de la base fae9aa7d, copiada como `before/android-payment.png`.
La captura inicial de arranque de esta sesión quedó en carga y no se usa como evidencia
aprobada. Después: `android-session-native-Cc10S0/payment-pending.png`, copiada en after.
Las capturas web se identifican como Chromium, no como Android físico.

## Pruebas ejecutadas

Node 22.23.4, PostgreSQL 18 aislado, Playwright 1.56.1/Chromium, Android15/API35,
AVD dedicado hm_110_debug_api35 y Java21 mediante el wrapper del proyecto.

| Prueba | Resultado |
| --- | --- |
| Navegación/capturas antes y después | Dos ejecuciones aprobadas, 100 pantallas cada una |
| Paleta y contraste semántico | 3/3 |
| PDF, datos, geometría, texto largo y campos máximos | 17/17 |
| Contratos OTP, sesión automática, UI TOTP/recuperación/Admin e HidroBot | 27/27 |
| Pagos/realtime real y responsive completo heredado | 2/2 escenarios E2E aprobados |
| Descarga web con plantilla final | 1/1 escenario integral aprobado |
| Android WebView: pagos, sesión segura, force-stop, red, Socket.IO, PDF/visor/Atrás/logout | 10 comprobaciones aprobadas, sin errores; Cc10S0 (plantilla final) |
| Android WebView TOTP: activación, desafío sin JWT, código inválido/recuperación, restauración y desactivación | 6 comprobaciones aprobadas, sin errores; XocNV9 |
| Gradle testDebugUnitTest y lintDebug | BUILD SUCCESSFUL; 4 JUnit, 0 errores de lint y 16 advertencias |

No sumar estas cifras como casos únicos: las suites comparten verificaciones.
Logs en `artifacts/identidad-acuatica-120/`: before.log, after-final.log,
contracts.log, palette-final.log, pdf-tests-final.log, documents-palette-final.log,
payments-final.log, final-download.log, android-final-pdf.log, android-2fa.log y gradle.log.

Comandos reproducibles, con Node22 y el puerto de una fixture PostgreSQL nueva:

```sh
export PLAYWRIGHT_BROWSERS_PATH="$PWD/artifacts/vercel-validation/browsers"
node --test scripts/test/identity-visual.cjs
node --test scripts/test/identity-palette.test.cjs scripts/test/documents.test.cjs
HIDRO_EMAIL_TEST_DB_PORT=PUERTO_FIXTURE node --test scripts/test/android-transition.cjs Backend/test/email-contract.cjs scripts/test/hidrobot.test.cjs
node --test scripts/test/yape-pilot-flow.cjs scripts/test/payment-realtime-flow.cjs
HM_PDF_EXAMPLE_DIR=output/pdf/identidad-acuatica-120/ejemplos node scripts/generate-payment-audit-examples.cjs --variants
HIDRO_EMAIL_TEST_DB_PORT=PUERTO_FIXTURE npm run test:yape:pilot:native
HIDRO_EMAIL_TEST_DB_PORT=PUERTO_FIXTURE npm run test:2fa:native
bash scripts/android-gradle.sh --no-daemon --console=plain :app:testDebugUnitTest :app:lintDebug
```

Preparación de fixture/herramientas: `auditoria-pagos-admin-120.md`. No usar .env ni
credenciales productivas. Cada test crea datos nuevos y conserva sus volúmenes al detenerlos.

## Hallazgos de QA corregidos y límites

- Una advertencia del PDF legado tenía una comprobación literal («cargo bancario»):
  se conservó esa advertencia con texto breve, sin quitar la prueba.
- Se actualizó el E2E a la etiqueta del título de ensayo, sin retirar comprobaciones financieras.
- Un correo largo válido provocaba una página adicional casi vacía: se corrigió la
  reserva de espacio de sección y la nota del recibo; regresión específica aprobada.
- El cotejo de paleta evita divergencia CSS/PDF. La geometría de texto comprueba márgenes
  y superposición; la revisión visual sigue siendo necesaria y se realizó.
- Pendientes: teléfono físico, TalkBack/lector humano, impresión física y certificación
  PDF/UA. No se declara que jsPDF produzca PDF etiquetado accesible.
- No se probaron banco real ni pasarela comercial; no forman parte del rediseño.

## Control de publicación

Primer commit visual: `52e6ce4fcbe65f7c1500edb8c0b17ea8249a7148`, push confirmado.
Segundo incremento: composición PDF y cierre de evidencia en el mismo Draft PR #15.
Exclusión de la rama agregada a ambos vercel.json antes del primer push. Vercel no
registró previews; Render consultado solo en lectura, autodeploy/previews off.

Sin cambios de backend de negocio, endpoints, base de datos, migraciones, Java/plugins,
claves, firma, Neon, Kubernetes ni servicios productivos. No se publicaron APK/releases.
APK 1.1.1/1.1.2 con hashes originales; las ramas anteriores y main se conservan.
Recuperación de contraseña, push, seguimiento, reportes y nuevas funciones de seguridad
siguen en el roadmap, sin implementarse en esta etapa. Coste de desarrollo: S/ 0.
