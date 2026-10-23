# Avance 24 — preparación final de Neon y Render

22 de octubre de 2026. **Preparación y publicación de código para revisión. No se autoriza ni ejecuta una actualización productiva.**

## Estado de entrega

- Rama publicada: [`preparation/backend-avance-23`](https://github.com/NicolasAG-pe/Sedapal/tree/preparation/backend-avance-23).
- [Draft PR #6](https://github.com/NicolasAG-pe/Sedapal/pull/6), destino `main`. Sin fusión ni auto-merge. Conservar el historial mediante merge commit cuando el propietario autorice.
- Primera publicación confirmada en `6a64450f8e80b865fa9f8fa667fba5bb43fc3375`; el incremento de diagnóstico/informe se publica en esta misma rama y su HEAD remoto se contrasta después del push. El SHA definitivo figura en el resumen de entrega y en el head del PR.
- `main` permanece en `691209c030c862affa3c6683eadc45c843dafc3d`, ancestro de la preparación. Las demás ramas y worktrees se conservan.
- **Listo para revisión de main; no implica GO productivo.** Neon real, respaldo real, ventana y despliegue siguen pendientes de autorización.

### Trabajo del avance 23 conservado

| Commit | Contenido |
| --- | --- |
| `e2d413327128b8e8a50d6bd13c7b1f2114371faf` | Altas OTP solo con `EMAIL_REGISTRATION_ENABLED=1`; ausencia mantiene cierre |
| `6933760a52b7f3caa61852a475fec7ee64a99192` | `ip-address` transitiva 10.7.4 en lockfile; sin nuevas dependencias |
| `e8085be58eb6471b4aaafce789f289ed21ff02f0` | Ensayo histórico/Docker e informe productivo por etapas |

Se comprobó que el servidor, lockfile y demás código de aplicación no cambian en el avance 24. Sigue vigente la evidencia Node 22 del avance 23: **75 aprobadas, cero fallidas y una omisión condicional**; modo histórico separado 12/1 inversa. También se reutilizan Docker, OTP simulado, Admin/Socket.IO/Chromium, pagos, incidencias, PDF y restauraciones ya aprobados. No se volvieron a ejecutar esas suites ni Android nativo.

Informe previo: [backend-produccion-avance-23.md](backend-produccion-avance-23.md). La imagen local probada sigue siendo `hidro-avance23-backend:6933760`, ID `sha256:1e02c7cfbe1ab711aa2156379e70b15e1b917718a0f0ed2d1733c3135cc00eda`. No se publicó imagen ni APK.

## Publicación sin despliegues

### Vercel

Se consultaron los dos proyectos vinculados a `NicolasAG-pe/Sedapal`, sus últimos despliegues Git y logs de build:

| Proyecto | Evidencia conservada de directorio | Último estado previo |
| --- | --- | --- |
| `hidro-mehora-admin` | Runtime generado en `/vercel/path0/artifacts/web/admin` | READY, commit `049ca5f` |
| `sedapal` | Busca `/vercel/path0/Backend/scripts/build-web.js` | ERROR histórico, mismo commit |

El conector no expone `rootDirectory` directamente; se informa la evidencia de los builds, no una lectura del ajuste del panel. Los proyectos y sus últimas fechas/despliegues coinciden con la revisión anterior. No se modifica el error histórico de `sedapal` ni se dispara un build para investigarlo.

`vercel.json` y `Backend/vercel.json` añaden exclusivamente:

```json
"preparation/backend-avance-23": false
```

Se conserva `false` para `feature/verificacion-correo`, `integration/avance-18` y `main`, sin alterar comandos, rutas de build ni otras ramas. Se validaron ambos JSON y su igualdad con la versión anterior retirando solo la nueva entrada. No hay reglas comodín que habiliten esta rama. La consulta de despliegues de esta rama devuelve cero antes y después de la primera publicación/creación del Draft PR; se repite al cierre.

La exclusión se aplica al despliegue Git, no a operaciones manuales ajenas. [Semántica oficial de `git.deploymentEnabled`](https://vercel.com/docs/project-configuration/git-configuration).

### Render y GitHub

Workspace previamente autorizado en lectura: `wDeco's workspace`. Lista incluyendo previews, detalle y despliegues consultados; solo se observó `hidro-mejora-api` para este repositorio.

| Campo | Estado observado |
| --- | --- |
| Servicio | `srv-db3f89qj9qps73fcvfbg`, `hidro-mejora-api` |
| Rama / raíz / runtime | `main` / `Backend` / Docker |
| Dockerfile / contexto | `./Dockerfile` / `.` relativos a `Backend` |
| Live | `dep-db3fu2aj9qps73ffmbb0`, 8 de octubre de 2026 |
| Commit live | `864e0e1818ac9a61dd8305411deb63b5b944bfe2` |
| Autodespliegue | `autoDeploy=no`, `autoDeployTrigger=off` |
| Previews | `generation=off`, `pullRequestPreviewsEnabled=no` |
| Health | `/api/health` |
| Worker independiente | No se observó un servicio worker en el workspace consultado |

GitHub devuelve listas vacías de workflows Actions y webhooks de repositorio. El push utiliza un refspec explícito de esta rama, sin force; se comparan los demás refs antes/después. No se activan automatismos, no se cambian servicios y el PR permanece Draft.

No se solicitaron valores secretos de Render. Las variables **requeridas** se contrastaron con el código y plantillas, pero sus valores remotos siguen sin verificarse. En particular, no se afirma que el servidor viejo reconozca o tenga configurada la bandera nueva: el estado seguro que debe prepararse para la candidata es `EMAIL_REGISTRATION_ENABLED=0`.

## Neon: destino y migraciones aún sin confirmar

**No se consultó Neon, no se abrió una conexión a su PostgreSQL y no se extrajo un respaldo real.** No se dispone de un conector Neon en esta sesión. No se leen cadenas privadas de archivos locales para inferir el destino ni se publican nombres de cuentas/base/endpoint.

La identificación correcta se completará con autorización y junto al propietario, en una ficha privada:

| Dato | Verificación necesaria |
| --- | --- |
| Proyecto y organización | Confirmación en el panel/API de Neon autorizado |
| Rama e identificador | Correspondencia exacta con el endpoint usado por Render; no asumir que se llama main |
| Endpoint directo y región | Correspondencia con el secreto de conexión del servicio; no confundir pooler, ramas de prueba o endpoints antiguos |
| Base y rol | Comparar con destino efectivo de Render y comprobar identidad al conectar; permisos mínimos aprobados |
| Versión, extensiones, ACL/RLS | Inventario real, compatibilidad del cliente pg_dump y del destino de restauración |
| Recuperación | Ventana de historial/PITR realmente disponible y último respaldo restaurado; no asumir retención por el nombre del plan |

El commit live es anterior a 003–006, pero **no demuestra** qué se aplicó manualmente a Neon. Las cuatro migraciones son candidatas a pendientes hasta que se inspeccione el catálogo. No hay aquí un historial de migraciones productivo consultado. No aplicar archivos automáticamente solo por fecha o por un booleano de presencia.

## Diagnóstico de solo lectura preparado

Archivo: [`Base-de-Datos/checks/024_preproduccion.sql`](../../Base-de-Datos/checks/024_preproduccion.sql). No se integra en arranque, CI, Docker ni despliegue.

- Exige una bandera de autorización y base/rol esperados. Rechaza el destino equivocado antes de consultar filas de negocio.
- Usa `REPEATABLE READ READ ONLY`, límites de bloqueo de 2 s y sentencia de 15 s, UTC y formatos estables para comparar huellas. No llama `nextval`/`setval` ni ejecuta DML/DDL.
- Devuelve versión/estado de transacción, catálogos de columnas, FKs/constraints e índices, conteos por tabla y metadatos de secuencias con máximo de ID. Permisos insuficientes o timeout **detienen** el procedimiento; no se rebajan guardias para aprobarlo.
- Marca presencia estructural de objetos 003–006. Es un indicio: cotejar definiciones completas, índices válidos/listos, FKs esperadas y columnas antes de decidir qué archivo aplicar.
- Incluye el preflight existente [`005_integridad_recibos.sql`](../../Base-de-Datos/checks/005_integridad_recibos.sql), siete controles sin devolver registros personales.
- Cuenta fotos, bytes, imágenes vacías y discrepancias de MIME en `incidencias.foto BYTEA`. Con `huellas_completas=1`, calcula SHA-256 de contenido/MIME/asociación de cada foto y huellas agregadas de todas las tablas. Excluye solo la nueva columna `correo_verificado_en` al comparar tablas históricas.
- El modo ligero omite las huellas costosas. Solo autorizar las huellas completas después de evaluar tamaño/coste, preferentemente en clone/ventana. Un timeout no demuestra corrupción. Las tablas particionadas se contabilizan individualmente: no sumar sus conteos indiscriminadamente.

`psql` 18 no admite código de salida en `\quit`. Las guardias usan un error constante de conversión y `ON_ERROR_STOP` para salir 3, sin leer filas; el rechazo de una base/rol equivocado hace antes ROLLBACK. No se ejecuta ninguna guardia ni consulta en Neon durante este avance.

**Ejemplo futuro, no ejecutado**, solo después de autorizar el destino y preparar un servicio de conexión privado con TLS verificado:

```sh
PGSERVICE=hm_prod_audit PGOPTIONS='-c default_transaction_read_only=on' \
  psql -X -v ON_ERROR_STOP=1 \
  -v diagnostico_autorizado=1 \
  -v expected_database="$HM24_BASE_CONFIRMADA" \
  -v expected_role="$HM24_ROL_CONFIRMADO" \
  -v huellas_completas=0 \
  -f Base-de-Datos/checks/024_preproduccion.sql \
  > "$HM24_DIRECTORIO_PRIVADO/diagnostico.txt" \
  2> "$HM24_DIRECTORIO_PRIVADO/diagnostico.stderr"
```

Los nombres del servicio y variables son referencias de ejemplo, no destinos identificados. No poner URL/contraseña en argumentos, historial, issue o PR. El registro privado debe revisarse antes de compartir incluso conteos/huellas. Una bandera local no sustituye la autorización del propietario.

## Prueba nueva y acotada: fotografía y diagnóstico

Comando realmente ejecutado:

```sh
HIDRO_PREPRODUCCION_TEST_CONTAINER=hm23-db node scripts/test/preproduccion24.cjs
```

El harness exige el contenedor/etiqueta/red interna sintéticos del avance 23. No lee `.env`, `DATABASE_URL`, credenciales reales ni bases ajenas. Crea bases nuevas con nombres aleatorios, conserva todas al terminar y usa el esquema del commit desplegado como punto inicial.

**Cinco grupos finales aprobados:**

1. Falta de autorización, base y rol incorrectos rechazados con salida de error, sin lectura de negocio.
2. Esquema previo: diez tablas, seis filas sintéticas (usuario, suministro, recibo, pago, dos incidencias), cuatro indicios de migración ausentes; diagnóstico no avanza secuencias.
3. Tras 003–006, trece tablas, indicios presentes; conteos/huellas de todas las filas anteriores, FKs originales, secuencias y contenido/MIME/asociación de fotografía conservados.
4. Dump custom sintético restaurado en otra base nueva: mismas huellas de todas las tablas, todas las FKs, secuencias y fotografía.
5. Archivo psql real con include relativo de 005 y modo ligero también aprobado.

La imagen es un PNG sintético de 67 bytes, no una fotografía de una persona. Dumps, salidas y errores iniciales se conservan en `artifacts/avance-24/`, ignorado por Git. Los ensayos iniciales detectaron una guardia psql que no devolvía error y un parseo incompleto de JSON multilínea en el harness; además se sustituyó el primer PNG de fixture por otro con estructura/CRC verificados. Se corrigieron y el ensayo final completo pasó. No son fallos del backend ni pruebas de datos productivos.

## Respaldo real que debe autorizarse

Solicitar permiso para **extraer todos los datos reales de la base exacta confirmada**, incluidas fotografías, cuentas/hashes, recibos y pagos, hacia un destino privado cifrado, y restaurarlos en un PostgreSQL nuevo aislado. La autorización debe indicar responsable, equipo/destino, control de acceso y custodia. No basta autorizar consultas de conteos: un dump contiene información personal.

1. Verificar primero identidad y permisos, versión/compatibilidad, extensiones, espacio y acceso del destino privado. Preferir rol de lectura existente autorizado; cualquier concesión/rol nuevo requiere permiso separado. No crearlo ahora.
2. Usar conexión **directa, no pooled**, TLS validado, cliente pg_dump compatible y servicio/.pgpass privado con permisos 600, fuera del repositorio. No copiar el secreto de Render a documentación. [Recomendación oficial de Neon](https://github.com/neondatabase/website/blob/main/content/docs/manage/backup-pg-dump.md).
3. Respaldo custom completo, sin filtros de tablas/datos. Capturar stderr/salida y SHA-256; revisar fallos y advertencias. BYTEA se respalda como datos de la tabla. Inventariar aparte objetos globales/roles, ACL/RLS y extensiones; un pg_dump de una base no equivale a respaldar todo el clúster. [Alcance de pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html).
4. Restaurar en una base **nueva, vacía y desconectada de los servicios productivos**, con roles/extensiones mapeados de forma aprobada. No apuntar pg_restore a producción ni usar `--clean`. `--no-owner` se usó en el fixture, pero no certifica permisos productivos: elegir el mapeo y validar ownership/ACL/RLS explícitamente.
5. Ejecutar el diagnóstico sobre origen y restauración según la autorización. Comparar tablas, conteos, huellas, fotografía y asociación/MIME, FKs, índices y secuencias. Verificar `is_called`, incremento/ciclo y siguiente valor teórico respecto al máximo, **sin avanzar/reparar secuencias automáticamente**.
6. Examinar privadamente fotos restauradas autorizadas por el propietario para comprobar decodificación/MIME y su acceso por propietario/Admin; no adjuntarlas a GitHub ni a logs. La huella acredita conservación de bytes/asociación, no que una imagen histórica ya dañada sea válida.
7. Ensayar migraciones y API con esa copia solo bajo una autorización que cubra el tratamiento de datos reales en el clone. Mantener red/worker sin salida y correo cerrado; no iniciar notificaciones reales.

Un dump es consistente en su propio snapshot, pero los diagnósticos separados no comparten automáticamente ese snapshot y las secuencias no son MVCC. Para una comparación exacta del corte final, **pausar todos los escritores** hasta completar respaldo/diagnóstico/migración. Durante operación normal pueden diferir conteos legítimamente; no catalogarlos como pérdida sin analizar el instante de corte.

Ejemplo de extracción futura **no ejecutada**, con servicio ya identificado y autorizado:

```sh
set -euo pipefail
umask 077
HM24_RESPALDO_DIR="$(mktemp -d /ruta/privada/aprobada/hm24.XXXXXX)"
PGOPTIONS='-c default_transaction_read_only=on' \
  pg_dump --dbname='service=hm_prod_audit' --format=custom \
  --lock-wait-timeout=10s --file="$HM24_RESPALDO_DIR/completo.dump" \
  2> "$HM24_RESPALDO_DIR/pg-dump.stderr"
# Continuar solo si pg_dump terminó 0 y se revisó stderr.
sha256sum "$HM24_RESPALDO_DIR/completo.dump" > "$HM24_RESPALDO_DIR/SHA256SUMS"
pg_restore --list "$HM24_RESPALDO_DIR/completo.dump" > "$HM24_RESPALDO_DIR/indice.txt"
```

Después de aprobar roles/extensiones y confirmar que el servicio de restauración señala **otra base vacía**, el comando de restauración previsto es `pg_restore --dbname='service=hm_restore_aislada' --exit-on-error --single-transaction "$HM24_RESPALDO_DIR/completo.dump"`. No se ejecutó. Si se necesita mapear propietarios, aprobar ese mapeo antes de elegir `--no-owner`; no omitir silenciosamente ACL ni errores de permisos.

El directorio debe estar dentro del destino cifrado aprobado; permisos 600/700 no cifran por sí solos. Listar el archivo no es probar su restauración. Confirmar también la ventana real de recuperación de Neon sin cambiarla: PITR no sustituye este ensayo ni autoriza sobrescribir la rama activa. [Ventana de historial](https://github.com/neondatabase/website/blob/main/content/docs/postgres/backup-restore/history-window.md).

## Secuencia exacta de actualización posterior

| Etapa y punto de parada | Acción futura y criterio |
| --- | --- |
| A — destino y lectura | Autorizar identificación Neon y consultas; corroborar Render → endpoint/rama/base/rol. Ejecutar diagnóstico ligero; revisar esquema, 001/002, migraciones pendientes y los siete controles 005. Cualquier anomalía o deriva bloquea la migración. |
| B — respaldo y ensayo | Autorizar extracción/custodia/restauración en destino nuevo. Completar comparaciones anteriores, incluidos fotos/ownership/permisos. Ensayar 003–006 en copia. Detenerse si no restaura o pierde equivalencia. |
| C — código revisado | Revisar Draft PR #6 y autorizar su merge conservando historial. Sin merge automático aquí. Registrar el SHA exacto aprobado y construir imagen desde él; misma raíz `Backend`, Dockerfile Node 22/npm ci. No usar main flotante ni publicar imagen sin autorización. |
| D — ventana y corte final | Autorizar mantenimiento, detener todos los escritores API/Admin/scripts y worker, obtener respaldo final y diagnóstico comparable. Confirmar recuperación y responsables antes de iniciar. |
| E — migraciones | Solo con GO explícito, aplicar individualmente 003 → 004 → 005 → 006 según catálogo revisado, `psql -X -v ON_ERROR_STOP=1 -f archivo`, usando conexión privada verificada. Cada archivo tiene su transacción. No ejecutar init/seed, no forzar locks ni corregir históricos. Detener al primer fallo y revisar archivos previos ya confirmados. |
| F — conservación | Comprobar cuentas/hashes, suministros, recibos/pagos/incidencias/fotos, huellas, FKs, secuencias, índices/constraints y permisos. Usuarios históricos conservan NULL de verificación y su login. |
| G — configuración | Revisar privadamente variables de API, conservar secreto JWT y claves vigentes, CORS exactos con `https://localhost`. Altas 0, worker detenido. Mantener autodespliegue/previews apagados. Confirmar destino y límites de conexión antes de desplegar. |
| H — despliegue manual | Solo con autorización de Render: desplegar SHA exacto aprobado y comprobar el SHA efectivamente live. El servidor no ejecuta migraciones al arrancar. No cambiar Neon/Vercel como efecto lateral. |
| I — canario progresivo | Health y DB; capacidades 200; sesión sin JWT 401; login 1.0.0 y usuario/Admin; sesión 1.1.0 válida/expirada/deshabilitada; roles; Socket.IO; recibos/PDF/foto propia; reapertura/logout Android. Usar canarios nuevos autorizados, sin registrar pagos ni editar datos de usuarios reales. Revisar errores/latencia sin PII. |
| J — correo, autorización posterior | Verificar dominio/remitente, claves, retención y worker independiente antes de habilitarlo y autorizar canarios reales. Aceptación no es entrega. Solo después considerar altas 1. Mientras tanto, login/Admin deben funcionar con registro cerrado y sin worker. |

### Variables y worker

API: `NODE_ENV`, `PORT`, `DATABASE_URL`, **`AUTH_TOKEN_SECRET` vigente**, `CORS_ALLOWED_ORIGINS`, `EMAIL_REGISTRATION_ENABLED=0`. Para OTP: `EMAIL_OTP_SECRET`, `EMAIL_OUTBOX_KEY`, `RESEND_FROM`, preparados privadamente cuando corresponda. No rotar claves para "limpiar" solicitudes pendientes ni extender el JWT de ocho horas.

Worker futuro: servicio independiente, comando `node workers/email-outbox.cjs --run`, `EMAIL_WORKER_ENABLED=1`, `EMAIL_WORKER_DATABASE_URL`, `EMAIL_WORKER_EXPECTED_DATABASE`, misma `EMAIL_OUTBOX_KEY` y `RESEND_API_KEY` solo en ese proceso. Antes de crearlo, aprobar plan/coste, permisos y operación. No se creó ni habilitó en Render. La tarea de retención necesita un entorno operativo separado: la imagen actual no incluye los scripts de limpieza.

Android 1.0.0 conserva su login; su registro antiguo recibe 426 controlado. Android 1.1.0 requiere capacidades/sesión nuevos y contrato OTP. Las pruebas del avance 23 acreditan la candidata local; el live antiguo sigue sin esos endpoints. No se declara funcional en producción por haber publicado el PR.

## Recuperación y riesgos pendientes

- **No rollback automático a `864e0e1`:** permite registro sin OTP y desconoce la bandera de cierre. Preparar mantenimiento, corrección hacia adelante o un fallback compatible probado.
- Error de preflight/restauración: no tocar producción. Error SQL: revierte el archivo fallido, no necesariamente los anteriores. Conservar cambios aditivos; no ejecutar downs genéricos ni borrar tablas OTP.
- Error de código/configuración: cerrar altas/detener worker y usar procedimiento aprobado; conservar destino y claves. Rollback Render no revierte PostgreSQL y puede recuperar variables/comandos del deploy objetivo: revisar toda su configuración privadamente antes de aprobarlo. [Documentación de rollback](https://render.com/docs/rollbacks).
- Si se detecta corrupción, detener escrituras y preservar el estado actual. Restaurar/PITR en otro destino y reconciliar los datos nuevos posteriores al respaldo antes de autorizar un cambio. Nunca sobrescribir la base activa con un respaldo antiguo que elimine pagos/cuentas/fotos nuevos.
- Parada temprana del worker del avance 23: señal durante arranque agotó diez segundos y acabó **137**, sin OOM. Una vez listo terminó **0** en 1,12 s. No se corrigió ni volvió a ejecutar ese código en el avance 24. Antes de operar el worker real, ensayar arranque/señales y leases con proveedor simulado, distinguir corte durante arranque de drenaje en curso y fijar operación supervisada; no declarar entrega exactamente una vez.
- Identidad/configuración de Neon y variables secretas de Render siguen sin auditar. Integridad histórica real, ACL/RLS, fotos históricas y copia externa cifrada siguen pendientes. Las pruebas actuales usan datos sintéticos y una instancia; no certifican escalado Socket.IO/rate limits ni todos los escenarios operativos.

## Autorización necesaria para el avance 25

El siguiente avance puede comenzar con **A y B**, si el propietario autoriza expresamente:

1. Identificar privadamente el proyecto/rama/base/endpoint/rol de Neon realmente usados por Render y consultar sus metadatos y diagnóstico de solo lectura.
2. Extraer un respaldo íntegro con datos personales/fotografías al destino cifrado especificado y restaurarlo en una base **nueva y aislada**; autorizar las comprobaciones y el ensayo en esa copia sin correo ni conexiones productivas desde ella.

Esa autorización no debe interpretarse como permiso para merge, migrar Neon, cambiar variables, crear worker, desplegar Render o activar Resend. Tras entregar resultados reales, pedir un **GO separado** para C–I con SHA, destino, ventana, respaldo y recuperación concretos. La activación del registro/correo J necesita otra aprobación y validación.

Respuestas finales: **rama publicada y Draft PR creado; código listo para revisión, no para ejecutar producción sin los controles pendientes.** El respaldo real y Neon aún no están verificados. El procedimiento distingue claramente revisión, lectura, extracción/restauración y modificaciones productivas.
