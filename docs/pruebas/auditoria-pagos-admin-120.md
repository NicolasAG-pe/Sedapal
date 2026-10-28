# Auditoría funcional de pagos y Admin — desarrollo 1.2.0

Base comprobada: `e961ddff7f30b73b7c94b894d423ab124213a2c3`, rama
`feature/yape-piloto-120`, Draft PR #14, base `feature/pagos-pdf-120`.
Se conservan OTP, inicio automático de sesión, 2FA y sesiones nativas.
No es una certificación financiera ni una publicación de 1.2.0.

## Defectos reproducidos y correcciones

| Problema | Causa concreta | Corrección |
| --- | --- | --- |
| Etiquetas junto a otros campos, inputs estrechos y checkboxes mezclados | El generador Admin insertaba etiquetas e inputs directamente en un form; las reglas de ancho y bloque solo se aplicaban a `.field` | Módulo de gestión con campos semánticos, tabla de escritorio/tarjetas móviles, filtros Grid y diálogo nativo con foco contenido |
| Acumulación de tarjetas y operaciones revisadas entre pendientes | Se renderizaban todos los registros con formularios completos; API limitada a 200 sin paginación | Cinco secciones, contadores y búsqueda parametrizada; 10 operaciones por página con total/páginas reales; pendientes filtradas en servidor |
| Ensayo exigía declarar falsamente recepción bancaria | `review()` y CHECK 009 exigían `movimiento_comprobado` y metadatos de recepción también con `piloto_ensayo=true` | Aceptación `ensayo_confirmado`; sin importe/fecha/receptor bancarios almacenados. 010 conserva historia y bloquea nuevos metadatos bancarios en confirmaciones sintéticas |
| Se solicitaba una fecha manual sin distinción suficiente | Formulario requería fecha bancaria para cualquier piloto, aunque la revisión ya usaba `clock_timestamp()` | Sin fecha editable de revisión; fecha bancaria opcional y NULL si desconocida; revisión/actor automáticos. Validación de ventana/zona/futuro si se informa una fecha bancaria |
| Yape parecía desaparecer tras declarar | El QR respondía 409 correctamente, pero config no devolvía la operación existente y el cliente solo mostraba un error genérico | Overview autenticado con operación propia, estado/motivo permitido y botón «Ver estado e historial»; no obtiene ni muestra otro QR |
| Nueva declaración posible tras rechazo/cancelación con otro UUID | Índice único protegía estados activos, pero no los terminales | Comprobación bajo bloqueo del recibo impide otra declaración del mismo piloto; reintento con UUID/payload original sigue siendo idempotente |
| Respuesta perdida dejaba incertidumbre | UI dependía del siguiente POST | Recupera por GET tanto declaración como revisión; no repite automáticamente la mutación administrativa |
| Resumen privado nuevo podía permanecer en DOM tras logout | La limpieza anterior no conocía esos elementos | Se vacía el resumen, se oculta su enlace, se invalida la vista y se limpian QR/referencia/sesión |
| HidroBot visible antes de terminar la carga inicial | Login volvía a habilitar su botón antes de finalizar los GET; el toque llegaba al asistente, que lo rechazaba por `loading` | Botón del asistente deshabilitado con estado accesible hasta datos listos; prueba con GET de recibos retenido y repetición nativa |
| Constancia sintética titulada como transferencia | Título se elegía por entorno piloto sin distinguir ensayo | «CONSTANCIA DE ENSAYO SINTÉTICO» y «No aplica: ensayo sin dinero»; recepción bancaria nunca presumida |

010 es una migración **solo preparada y ensayada en bases locales nuevas**. No modifica
filas históricas ni elimina operaciones. Las revisiones anteriores permanecen inmutables.
007–010 siguen sin aplicarse a producción por esta tarea. No se usa `init.sql` sobre bases existentes.
La API sin parámetro `page` conserva la respuesta anterior; los estados/rutas anteriores permanecen.

## Evidencia visual

Carpeta local ignorada: `artifacts/auditoria-pagos-admin-120/`.

- Antes: `before-{360,390,768,1366,1920}.png` y `before-geometry.json`.
- Después: `after-table-*.png`, `after-modal-*.png`, `after-client-*.png`,
  `after-manual-contract-*.png`, `after-audit-history.png`, `after-rejected-client.png`.
- `e2e-result.json`: 16 comprobaciones y 20 mediciones de geometría (Admin, cliente y contrato manual), Socket.IO real.
- Antes, las etiquetas sin fila propia fueron 3/4/4/5/5 en 360/390/768/1366/1920 px respectivamente. Después, todas las etiquetas de campos evaluadas están sobre sus inputs y no hay desbordamiento horizontal.
- Capturas con cuentas `example.invalid`, referencias sintéticas y QR sin receptor bancario.
- Los diálogos mantienen desplazamiento vertical interno cuando hace falta; no se fuerza
  una altura que oculte acciones. Pruebas de foco visible, error con contraste CSS >=4.5:1,
  etiquetas por encima, límites de campos y ausencia de scroll horizontal en las cinco resoluciones.

Resoluciones exactas: 360×800, 390×844, 768×1024, 1366×768 y 1920×1080.
Cliente y Admin simultáneos, JavaScript/CSS finales, servidores HTTP loopback reales,
API Express real, PostgreSQL 18 nuevo y Socket.IO real. Los tests anteriores de transición
usan Chromium e interceptan transporte; no se confunden con la prueba de sockets real.

## Pruebas y reproducción

Node usado: 22.23.4 (`artifacts/pagos-pdf-120/tools/node` en esta laptop).
Playwright 1.56.1 y Chromium instalados previamente en artefactos locales.
No se requieren secretos productivos; ejecutar `npm ci` y `npm ci --prefix Backend` en un clon.
Si ese clon no tiene todavía las herramientas de navegador del proyecto:

```sh
npm install --prefix artifacts/vercel-validation/tools --no-save --package-lock=false playwright@1.56.1
export PLAYWRIGHT_BROWSERS_PATH="$PWD/artifacts/vercel-validation/browsers"
node artifacts/vercel-validation/tools/node_modules/playwright/cli.js install chromium
```

Chromium requiere sus bibliotecas del sistema; esta laptop ya las tenía. Los comandos
siguientes suponen que `node --version` devuelve v22 y Docker apunta al daemon local.

```sh
# Fixture NUEVA. Conservar el nombre/puerto devuelto; no reutilizar una base existente.
docker run -d --name hm-payment-audit-UNICO \
  -l hidro.task=payment-audit \
  -e POSTGRES_USER=hm_fixture -e POSTGRES_PASSWORD=fixture-only-not-production \
  -e POSTGRES_DB=hm_email_test -p 127.0.0.1::5432 postgres:18
docker port hm-payment-audit-UNICO 5432
# Esperar pg_isready. Exportar el puerto obtenido, no el de un servicio existente.
export HIDRO_EMAIL_TEST_DB_PORT=PUERTO_NUEVO
export PLAYWRIGHT_BROWSERS_PATH="$PWD/artifacts/vercel-validation/browsers"
node --test Backend/test/yape-pilot.cjs
node --test scripts/test/yape-pilot-flow.cjs
node --test scripts/test/payment-flow.cjs
node --test scripts/test/documents.test.cjs
node scripts/generate-payment-audit-examples.cjs
```

El E2E crea automáticamente laboratorios nuevos mediante `yape-pilot.cjs prepare --synthetic`.
Cada uno tiene DB/contenedor/cuentas/recibo/UUID independientes. Conserva sus datos y detiene
solo sus contenedores al cerrar. Una variante **de contrato manual** usa el mismo QR sintético,
no un receptor real: verifica rechazos por importe/referencia y termina rechazada, sin declarar recepción.

| Conjunto | Resultado comprobado |
| --- | --- |
| Backend piloto: estados, roles, concurrencia, duplicados, 009/010 repetibles, historia conservada, ventana/QR | 9/9 |
| Node/PG: pagos, recibos, OTP/sesión automática, sesión Android, 2FA usuario/Admin/auditoría, estado durable, documentos/UI | 94 aprobadas, 1 histórico optativo omitido (95 casos) |
| Contratos OTP/outbox/cliente viejo/nuevo, UI 2FA usuario/Admin, configuración e HidroBot | 63/63 |
| E2E anterior de pagos actualizado + carga lenta HidroBot | 4/4; junto a sus 4 tests de conocimiento/sintaxis: 8/8 |
| PDF focalizado (incluido también en la regresión de 95) | 14/14 |
| Auditoría Playwright integral | 1 escenario integral aprobado con 16 comprobaciones explícitas; cuatro laboratorios independientes, cinco resoluciones y 20 medidas de geometría |
| Gradle Java21: testDebugUnitTest / lintDebug | BUILD SUCCESSFUL; 4 JUnit, 0 fallos; lint 0 errores, 16 advertencias existentes |
| Piloto en Android WebView real API35 | Repetición final: 9 comprobaciones, 0 errores; `android-session-native-Ltnx6P/result.json`; incluye volver con Atrás desde ambos PDF |
| Sesión nativa general con cliente final | 13 comprobaciones, 0 errores; `android-session-native-IgOI0a/result.json` |

No sumar estos números como casos únicos: hay solapamiento entre las suites.
Los logs completos son locales e ignorados. No se versionan APK, PDF generados, dumps,
credenciales, fotografías privadas ni directorios temporales.

### Cobertura de los 17 escenarios de pagos solicitados

Declaración sintética y estado pendiente; mismo UUID y otro UUID duplicados; respuestas
HTTP perdidas en cliente y Admin; recuperación tras recargar y nuevo login; importe y referencia
incorrectos en contrato manual; campos incompletos con foco/mensaje; confirmación de ensayo;
rechazo motivado; historial con actor/fecha; Socket.IO sin recargar; descarga PDF; recibo sigue
Pendiente y sin fila financiera en pagos; QR no se vuelve a ofrecer; nuevo piloto aislado sin herencia.
Además, cancelación mantiene historial y bloquea otro QR. Dos confirmaciones simultáneas se
comprueban en PostgreSQL real: exactamente una decisión y una entrada final de auditoría.

## Documentos

Generador real jsPDF, A4 595.28×841.89 pt, una página por ejemplo, logo, márgenes,
importe S/ 1.00, referencias/fechas sintéticas y advertencia sin valor SEDAPAL/SUNAT.
Ejemplos revisados con `pdfinfo`, `pdftotext` y Poppler renderizado:

- `output/pdf/auditoria-pagos-120/ejemplos-8TTQNQ/constancia-ensayo-sintetico.pdf`
- `output/pdf/auditoria-pagos-120/ejemplos-8TTQNQ/recibo-sintetico.pdf`

El generador crea una carpeta nueva y no sobrescribe ejemplos anteriores. El PDF de navegador
se guarda también como `artifacts/auditoria-pagos-admin-120/constancia-ensayo-auditado.pdf`.
El estado/fecha de revisión proceden de API/PostgreSQL; la fecha de generación del documento
se identifica separadamente como hora del dispositivo. No hay QR público de validación.

## Fallos iniciales y límites

- Primeros selectores visuales contaban fechas de otros módulos y trataban el tamaño del
  cuadrado checkbox como si fuera el área táctil: se corrigió la medición, conservando pruebas
  de área clicable de su etiqueta, validación efectiva y foco.
- Primera ejecución de contratos olvidó `PLAYWRIGHT_BROWSERS_PATH`: 18 casos quedaron
  bloqueados en hook por ejecutable inexistente, no por defectos de OTP. Repetición: 63/63.
- Primer intento de PDF nativo: ANR de **System UI** en el selector SAF, capturado en
  `android-current.png`; se reinició solo el AVD dedicado sin borrar datos. Repetición del piloto:
  PDF real de constancia y recibo guardados por SAF y abiertos en visor Android, 9/9.
- El fallo nativo «chatbot abierto» no se atribuyó al emulador: la traza mostró pointerdown/click reales y el toast «Cargando datos…». Se corrigió la disponibilidad del botón y se probó con carga retenida. El harness espera la disponibilidad real y el cierre del tutorial, sin demoras arbitrarias.
- La regresión añadida detectó además una espera del test durante el tutorial: se usa su botón Omitir visible antes de esperar al asistente. No se desactiva el tutorial ni un control de seguridad para pasar.
- Sesión nativa general aprobada: primer login histórico, cierre normal, force-stop y muerte de proceso, validación remota única/socket único, JWT expirado/alterado, cuenta deshabilitada, logout, cambio de cuenta, desconexión/reconexión y logcat sin credenciales. La muerte de proceso es la simulación documentada por el harness, no una prueba del LMKD real.
- No se prueba teléfono físico, accesibilidad con lector humano, recepción bancaria auténtica,
  dinero ni proveedor comercial. Requieren actuación del titular y, para sandbox, credenciales
  externas autorizadas. No se simula su aprobación.
- No se realizó auditoría exhaustiva de cada navegador/dispositivo o función ajena al flujo;
  las regresiones automatizadas no constituyen certificación total de seguridad.

## Producción y publicación

Render consultado solo en lectura: branch main, autodeploy off y previews off.
Exclusión `feature/yape-piloto-120:false` conservada en ambos vercel.json.
No workflows/hooks GitHub activos en la comprobación previa; consultas de Render y Vercel exclusivamente de lectura. No se modificaron Neon, Render,
Vercel, Kubernetes, correo ni claves. Se preservan main y los PR dependientes; no se fusionan.
APK 1.1.1 y 1.1.2 conservadas con sus SHA-256 originales; no se crea/publica release 1.2.0.

## Cierre de validación (continuación del 26/10/2026)

Se recuperó el árbol modificado sin reset, limpieza, stash ni cambio de rama. No se
repitieron las 94 regresiones ni los 63 contratos ya aprobados: no hubo cambios posteriores
en backend/SQL/2FA/OTP. Se repitieron solo los flujos afectados por el cierre de UI:

- `e2e-verified.log`: integral real aprobado, 16 comprobaciones y 20 geometrías.
- `readiness-verified.log`: 8/8 (pagos + carga retenida + HidroBot/sintaxis).
- `android-session-corrected.log`: 13 comprobaciones nativas aprobadas.
- `android-payments-final.log`: 9 comprobaciones nativas aprobadas; ambos PDF y Atrás.
- Gradle/JUnit/lint se reutilizan del directorio `artifacts/android/builds/20261025_174712-169909/`:
  4 JUnit aprobadas, 0 errores de lint, 16 advertencias. No cambió código Java/Gradle;
  las dos ejecuciones nativas finales sí compilaron/instalaron recursos debug actuales.

No hay fallos críticos abiertos en estos conjuntos ejecutados. Una prueba histórica optativa
se omite porque no se ejecutó el modo legado `HIDRO_RECEIPT_TEST_LEGACY=1`; sí se verificó el
esquema actual y la conservación de filas anteriores mediante las pruebas de migración.
Admin se probó en Chromium desktop/móvil; no se afirma prueba de Admin en Chrome Android.
No se reconstruyeron ni sobrescribieron las APK oficiales. El runtime generado se devuelve
al HTTPS público al terminar; los artefactos debug del laboratorio no son distribuibles.

Primer incremento: `8771192522a36e654082cf89125e3f026e616e8b` (backend), push remoto confirmado.
Los siguientes incrementos de UI/validación se registran en el Draft [PR #14](https://github.com/NicolasAG-pe/Sedapal/pull/14).
