# Pagos Yape: sincronización de pantallas y textos por entorno

Base: `37e3c9551cbc3e477947be7d7354efa383f92f5e`, rama
`feature/yape-piloto-120`, Draft PR #14. Solo laboratorios locales nuevos.

## Causas reproducidas

1. Admin solo consultaba de nuevo al **reconectar**, no al establecer el primer
   socket. Se retuvo el handshake hasta después de crear una declaración: el GET
   inicial devolvió vacío y la tabla seguía vacía al conectar. Reproducción negativa:
   `artifacts/pagos-realtime-baseline.log`, timeout esperando una fila visible.
2. El cliente recuperaba solo la sección visible después de reconectar. Si estaba
   en Recibos, el historial de pagos y los datos utilizados por Inicio seguían en caché.
3. Las lecturas de pagos podían solaparse: un GET iniciado antes de la revisión podía
   terminar después y sobrescribir el estado confirmado. El debounce anterior solo
   agrupaba eventos antes de iniciar los GET, no durante una lectura en curso.
4. El backend valida otra vez estado/2FA antes de asignar salas. Ese control es
   necesario, pero la asignación asíncrona ocurre después de `connect`; existía otra
   ventana entre primer GET y suscripción efectiva.
5. El CSS móvil ocultaba `#client-connection` con `display:none!important`. El estado
   interno cambiaba, pero el aviso no se veía. Se comprobó en las capturas móviles.

## Correcciones

- Se mantienen `pago:nuevo` y `pago:registrado`, las salas y autenticación existentes.
  Tras la validación y la asignación de salas se envía una invalidación inicial con
  esos mismos eventos (`sincronizacion:true`). No crea operaciones ni notificaciones
  persistidas y no implica que se haya recibido dinero.
- Admin consulta al primer enlace y al reconectar, agrupando invalidaciones. Su
  gestión serializa las cargas, conserva búsqueda/filtros/página y descarta respuestas
  anteriores. Si la página tiene los mismos datos, conserva las filas y el foco.
- El cliente usa una carga de pagos en curso por sesión y una lectura posterior si
  llega una invalidación durante esa carga. La instantánea antigua no se publica.
  Declaración, cancelación, carga inicial y tiempo real reutilizan ese cargador.
- Después de conectar/reconectar se recuperan siempre los pagos, aunque otra sección
  esté visible. Se actualizan historial, Inicio y estado del diálogo abierto.
- Los errores de consulta dejan un aviso de sincronización pendiente. Desconexión y
  reconexión muestran el aviso también en móvil; el estado online conserva el diseño.
- El código de prueba y el UUID interno se presentan en filas separadas para evitar
  superposición. Las insignias distinguen ensayo, demostración, espera y revisión manual.

No se añade transporte, polling, cola de pagos ni sistema de eventos paralelo.
PostgreSQL/API siguen siendo la fuente de verdad. Se conserva la comprobación de
revocación/2FA antes de asignar salas; no se permite escoger salas desde el cliente.
No se cambian columnas, nombres de estados de API, duración JWT ni migraciones.

## Textos

| Contexto | Identificador del usuario | Acción | Estado pendiente | Resultado |
| --- | --- | --- | --- | --- |
| Ensayo sintético | Código de prueba; ejemplo PRUEBA20261026 | Registrar ensayo | Pendiente de revisión | Ensayo confirmado |
| Yape auténtico manual | Número de operación de Yape | Enviar a verificación manual | Pendiente de verificación | Transferencia auténtica verificada manualmente |
| Demostración | Operación interna | Registrar demostración | No acredita fondos | Operación de prueba registrada |
| Proveedor simulado | Identificador del simulador | Solo pruebas existentes | Estado del simulador | Aprobada por simulador, sin dinero |

Un pago comercial real no se implementa ni habilita en esta etapa. Una aprobación del
simulador nunca se presenta como acreditación comercial. El recibo sigue Pendiente
tras confirmar un ensayo, sin crear un pago financiero. Constancias y pantallas mantienen
el mismo vocabulario y las advertencias sin valor oficial.

## Pruebas ejecutadas

Node 22.23.4, PostgreSQL 18 aislado y Playwright/Chromium existentes. Cada laboratorio
crea cuentas `example.invalid`, recibo, QR sin receptor real y base nuevos; conserva
los datos al detener sus contenedores. No se usaron secretos productivos.

| Ejecución | Resultado |
| --- | --- |
| Backend piloto, sesión, auditoría 2FA/Socket, unitarias realtime e HidroBot | 21/21 |
| Cliente/Admin anteriores y documentos A4 | 18/18 |
| Pantallas realtime y auditoría responsive completa | 2 escenarios E2E aprobados |
| Primera conexión, snapshot retenida, reconexiones de ambos roles, filtros y contadores | 5 grupos de comprobaciones visibles en el E2E nuevo |
| Responsive heredado con CSS final | 360×800, 390×844, 768×1024, 1366×768 y 1920×1080; aprobado |
| Android WebView real, API35 | 10 comprobaciones, 0 errores; `artifacts/android-session-native-KoNHIu/result.json` |

Los flujos realtime abren cliente y Admin simultáneamente. No recargan esas páginas
para actualizar sus estados. Retienen deliberadamente un GET antiguo, confirman en Admin,
liberan la respuesta retenida y verifican que la pantalla permanezca confirmada.
También cortan la red, modifican datos desde otra conexión y verifican recuperación desde
Recibos, sin perder los filtros administrativos. Mismo UUID devuelve la operación original;
otro UUID para repetir Yape responde 409. Se comprueba el estado Pendiente en la API.

Comandos (requieren el puerto de una fixture PostgreSQL nueva y Node 22):

```sh
export PLAYWRIGHT_BROWSERS_PATH="$PWD/artifacts/vercel-validation/browsers"
npm run test:payments:realtime
node --test scripts/test/yape-pilot-flow.cjs
node --test scripts/test/payment-flow.cjs scripts/test/documents.test.cjs
HIDRO_EMAIL_TEST_DB_PORT=PUERTO_FIXTURE node --test Backend/test/yape-pilot.cjs Backend/test/two-factor-audit.cjs Backend/test/android-session.cjs scripts/test/realtime.test.cjs scripts/test/hidrobot.test.cjs
HIDRO_EMAIL_TEST_DB_PORT=PUERTO_FIXTURE npm run test:yape:pilot:native
```

Consultar `auditoria-pagos-admin-120.md` para preparar las herramientas y la fixture.
Los scripts realtime crean sus propios laboratorios. Los tests que usan `HIDRO_EMAIL_TEST_DB_PORT`
solo admiten el padre sintético `hm_email_test` en loopback, no una base productiva.

## Evidencia y fallos corregidos

Carpeta local ignorada `artifacts/pagos-realtime-120/`:

- `admin-before-first-connect.png`, `admin-pending-live.png`, `admin-confirmed.png`.
- `client-pending.png`, `client-confirmed.png`, `client-offline.png`.
- `client-reconnected.png`, `admin-reconnected.png`, `result.json`.
- Logs: `regression.log`, `ui-documents.log`, `visible-network.log`, `final-realtime.log`.
- El responsive completo conserva además las capturas de `artifacts/auditoria-pagos-admin-120/`.

La primera regresión visual usaba una expresión con minúscula para el nuevo texto
«Pendiente»: se actualizó al texto exacto. Otro selector esperaba una sola fila mientras
la búsqueda aún tenía su debounce pendiente: ahora espera el resultado filtrado real.
Se conservan sus errores iniciales; no se quitaron las comprobaciones.

El primer corte de red Android esperaba `navigator.onLine=false` en 25 segundos.
En el AVD no fue inmediato: `dumpsys connectivity` confirmó que no había red y el
socket detectó el corte por su heartbeat. La espera del test cubre el intervalo/timeout
existentes (hasta 45 segundos, más margen), acepta el estado de reconexión y exige
que el aviso sea visible. **No se cambiaron los tiempos del servidor para pasar tests.**

La repetición final `android-visible-network.log` aprobó corte real de Wi-Fi/datos, aviso visible, recuperación de un evento perdido desde Recibos, una sola declaración Yape, PDF/retorno con Atrás, force-stop y logout. Se compiló debug con el wrapper Java21; no se reconstruyó una APK release.

La captura reveló un caso real de indicador oculto por CSS en móvil, corregido y
comprobado después con `isVisible`, además de los valores del estado interno.

## Límites y producción

No se afirma prueba en teléfono físico, recepción bancaria auténtica ni acreditación
por proveedor comercial. Socket.IO invalida vistas; no es un registro financiero ni
una garantía de entrega exactamente una vez. Las lecturas posteriores recuperan la verdad
persistida y no vuelven a declarar ni acreditar la transferencia.

No se modificaron Render, Neon, Vercel, Kubernetes, main, firma Android ni APK oficiales.
No se ejecutaron migraciones productivas ni se activaron cobros/registro/correos.
Las APK 1.1.1 y 1.1.2 conservan sus hashes. El PR sigue Draft y no se fusiona.
