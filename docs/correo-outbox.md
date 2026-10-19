# Correo transaccional — avance 14

## Evidencia previa y alcance

Sobre `b2f079a224e8220b55208b279004e42a7edb4c8e` se reprodujo H03 en una base
PostgreSQL 18 nueva: el adaptador simulado aceptó un mensaje, un fallo 08006 antes
del COMMIT revirtió la solicitud y el reintento produjo un segundo mensaje con
otra clave. No hubo llamadas reales a Resend. El diagnóstico local quedó en
`artifacts/h03-verification/baseline.txt` (ignorado, no necesario para producción).
El diagnóstico histórico también quedó reproducible y versionado como
`Backend/test/email-h03-baseline.cjs`: lee únicamente ese commit local mediante
`git show`, crea otra base nueva e inyecta el fallo antes del COMMIT. Ejecutado en
Node 20; no descarga código ni llama a Resend. Requiere conservar esa historia Git.
La causa es efectuar una llamada externa dentro de una transacción SQL: rollback
no puede deshacer el envío. La nueva cola permite confirmar antes de enviar.

## Arquitectura implementada

`006_correo_outbox.sql` añade una tabla referenciada al historial de solicitudes,
sin alterar datos existentes. `encolarCorreo` requiere el cliente de la transacción
del registro; inserta historial y evento conjuntamente. El contenido JSON completo
se cifra con AES-256-GCM, IV aleatorio, etiqueta de autenticación y AAD ligada a
ambos UUID. `EMAIL_OUTBOX_KEY` debe tener 32 bytes aleatorios en base64, ser
independiente de las claves JWT/HMAC y compartirse privadamente entre API y worker.
La huella no secreta de clave evita destruir trabajos por configurar otra clave.
No se persisten OTP legibles; el HMAC continúa comprobando el código.

La API valida/HMAC y confirma pendiente, historial de reserva y evento en una sola
transacción. Sustituir o consumir la solicitud cancela sus eventos activos en la
misma transacción. Usuario y suministro siguen creándose únicamente al confirmar
el OTP. Los advisory locks ordenados coordinan registro, reenvío, verificación y
claim; el worker confirma el lease antes del HTTP y confirma después el resultado.
El historial conserva su columna `enviado_en` por compatibilidad, pero en el nuevo
flujo esa fecha significa **reserva de envío**, no aceptación ni entrega.

El trabajador `Backend/workers/email-outbox.cjs` es independiente y sin arranque
implícito desde la API, Docker o cron. Sin argumentos muestra ayuda sin conectar.
Exige habilitación explícita, conexión exclusiva y nombre de base esperado; no
lee `.env` ni reutiliza `DATABASE_URL`. Nunca imprime destinatarios, UUID, claves,
códigos, respuestas privadas del proveedor o errores SQL.

## Estados y recuperación

- `pendiente`: evento confirmado disponible; `reintento`: espera de backoff.
- `procesando`: lease de 60 segundos y token de fencing; un HTTP de hasta 10 s.
- `aceptado`: Resend devolvió un identificador; **no acredita entrega**.
- `fallido`: error permanente o contenido no autenticable.
- `caducado`: plazo insuficiente o intentos agotados sin ambigüedad registrada.
- `cancelado`: sustituido, consumido o solicitud inválida.
- `ambiguo`: incertidumbre de aceptación que no puede reintentarse con seguridad.

Todos los estados terminales eliminan el payload y el lease. Máximo cinco intentos,
esperas de 5/15/45/90 segundos más jitter 0–2 s y `Retry-After` limitado. Se usan
los advisory locks del registro (correo/suministro ordenados), fila pendiente y
outbox con `SKIP LOCKED`; no se mantienen locks durante HTTP. Tras un crash se
recupera el lease vencido con el mismo cuerpo y clave de idempotencia. Un token
obsoleto no puede finalizar el trabajo de otro proceso.

Al primer claim confirmado se inicia la vigencia OTP de cinco minutos. El código,
cuerpo y vencimiento no cambian al reintentar. No se inicia un mensaje si la
solicitud de una hora no permite cinco minutos completos; los intentos terminan
30 segundos antes del vencimiento OTP. El presupuesto restante se obtiene del
reloj SQL y se convierte a un plazo relativo local antes de llamar al adaptador. Una pausa del proceso o demora SMTP puede
hacer llegar un correo tarde: no es posible garantizar el plazo de entrega externo.
Un reenvío puede cancelar la fila, pero no retirar una llamada externa ya iniciada;
el HMAC sustituido rechaza el código antiguo.

No se promete entrega exactamente una vez. La
[idempotencia de Resend](https://resend.com/docs/dashboard/emails/idempotency-keys)
dura 24 horas; esta ventana de reintentos es menor de cinco minutos. Ante
incertidumbre se conserva la identidad, nunca se crea automáticamente otro OTP.
Los backups/WAL pueden conservar versiones cifradas anteriores al borrado de la
fila; proteger clave, acceso y retención de respaldos sigue siendo obligatorio.

## Verificación del primer incremento

Evidencia histórica del commit `ffa549f`: Node 20.19.2: 26 pruebas de correo/outbox aprobadas. Node 22.23.3: 16 pruebas
focalizadas de outbox/adaptador aprobadas. Incluyen ocho escenarios PostgreSQL:
rollback/visibilidad, backoff, dos trabajadores, crash después de aceptación y
fencing, ambigüedad acotada, clave incorrecta/corrupción, caducidad/cancelación,
restricciones/índices/conexiones. Datos sintéticos, bases nuevas, ningún correo real.

## Validación de la integración final

Comandos ejecutados con `HIDRO_EMAIL_TEST_DB_PORT=32768`, contra PostgreSQL 18
local aislado. Cada ejecución creó bases vacías nuevas con fixtures sintéticos;
no leyó `.env` ni usó Neon. Las llamadas de correo se interceptaron en los tests,
no mediante un modo simulado habilitable en la API de producción.

| Comprobación ejecutada | Resultado |
| --- | --- |
| `node --test Backend/test/email-outbox-api.cjs Backend/test/email-outbox-postgres.cjs Backend/test/receipt-concurrency.cjs Backend/test/receipt-schema.cjs Backend/test/email-*.test.js` | Node 20.19.2 y Node 22.23.3: TAP 61, 60 OK, 1 omisión condicional de la variante legacy H02; cero fallos. Incluye dos contenedores de subpruebas, no 61 escenarios independientes. |
| Solo outbox PostgreSQL/API | 19 escenarios independientes aprobados en ambos runtimes (TAP 21 al incluir los dos contenedores). |
| `HIDRO_RECEIPT_TEST_LEGACY=1 node --test Backend/test/receipt-concurrency.cjs` | Ambos runtimes: 12 OK, 1 omisión correspondiente al esquema nuevo; valida la variante omitida anteriormente. |
| `email-schema.cjs`, `email-api.cjs`, `email-cleanup.cjs`, `email-cleanup-cli.cjs` | Node 20: 2/4/6/3 grupos respectivamente aprobados. |
| `docker compose --env-file /dev/null config --quiet` con variables sintéticas | Configuración validada sin leer el `.env` privado, crear contenedores ni activar trabajador. |
| `email-live.cjs --simulate` | 9 comprobaciones aprobadas; ningún envío real ni espera real de cinco minutos. |
| Configuración, documentos PDF, firma y navegación Perfil | Node 20: 13/4/7/3 pruebas aprobadas. No se compila ni firma APK. |
| Runtimes web/Android en directorios temporales | 15 archivos por destino; contrato de cola presente, sin código administrativo ni secretos del servidor; no genera APK. |
| Chromium cliente/admin con doble envío y matriz visual | 25 comprobaciones, sin errores JS ni recursos fallidos; registro, reenvío, restauración, login, recibos y pagos aprobados. |

Evidencias locales ignoradas: `artifacts/h03-verification/final-node20.txt`,
`final-node22.txt`, `legacy-node20.txt`, `legacy-node22.txt` y reportes e2e.
No se publican buzones, capturas con fixtures ni logs. El fallo diferido de commit
produce intencionadamente un log genérico; la respuesta no contiene el error SQL.

| Requisito H03 | Evidencia automatizada |
| --- | --- |
| Rollback antes del commit | Transacción abierta invisible al worker; constraint trigger diferido fuerza fallo real de COMMIT HTTP, sin pendiente ni evento ni envío. |
| Commit disponible | 202 deja fila pendiente y evento; cero llamadas hasta invocar el worker. |
| Error temporal y reinicio | Backoff persistente, nuevo procesador recupera el evento sin cambiar cuerpo, identidad ni vigencia. |
| Dos trabajadores | Dos objetos concurrentes y dos procesos CLI independientes: una llamada en el caso normal. |
| Respuesta ambigua | Cinco intentos como máximo, mismo código/cuerpo/clave; terminal ambiguo sin payload. SIGKILL y recuperación reproducen incertidumbre externa. |
| OTP correcto/incorrecto/vencido | Confirmación única concurrente, intento incorrecto persistido, fechas SQL vencidas rechazadas; diez minutos simulados en cola no consumen el TTL inicial. |
| Reenvíos y límites | 60 s, tres reservas/hora por correo/suministro, cinco intentos acumulados, sustitución y reenvío durante HTTP; código antiguo rechazado. |
| Cuentas previas/integridad | Login sin fecha de verificación conservado; conflicto de suministro no deja usuario huérfano; confirmación concurrente crea una cuenta y un suministro. |
| Privacidad y privilegios | AES-GCM alterado/AAD/clave rechazados; clave incorrecta conserva el trabajo; stdout/stderr sin secretos. Rol limitado no lee contraseñas/usuarios ni borra outbox. |
| Migración/retención | 006 repetible sobre esquema anterior con datos sintéticos; comparación completa de filas de negocio y pendientes. Lock ajeno provoca timeout/rollback sin tabla parcial; posterior aplicación funciona. Retención protege activos y elimina solo fixtures terminales elegibles. |
| Regresión H02 | Dos procesos, crear/editar/anular/pagar, permisos, monto, unicidad, timeout, rollback, pool liberado y migración 005; cero deadlocks observados, no garantía universal. |
| Parada | SIGTERM durante HTTP permite finalizar y cerrar pool; SIGKILL deja lease que otro proceso recupera con la misma identidad. |

## Contrato y compatibilidad

Registro/reenvío mantienen HTTP 202 y `estado: pendiente`; añaden
`estado_envio: en_cola`, `solicitud_vence_en` y `vence_en: null` hasta el primer
claim. `POST /api/auth/verification-status` recibe el UUID en JSON y devuelve
estado/plazos sin correo, código, hash o proveedor_id; `Cache-Control: no-store`.
El UUID sigue siendo una capacidad privada temporal, no debe incluirse en URLs.
Cliente web/Capacitor fuente admite vencimiento nulo, consulta cada cinco segundos
solo mientras está en cola/proceso y conserva el estado ante desconexiones.
La autenticación/login, permisos, recibos y pagos no cambian de contrato.

**H01 continúa pendiente:** APK v1.0.0 espera registro inmediato; tampoco basta
publicar este backend a usuarios con clientes OTP anteriores que interpreten
`vence_en` nulo. Coordinar versión mínima, distribución y pruebas en dispositivo
antes del despliegue. Las solicitudes previas a 006 no se reenvían ni migran:
su HMAC/vencimiento siguen válidos hasta consumirlas/vencerlas; el estado se
identifica como `anterior`. El login de cuentas previas se comprobó localmente.

## Variables, permisos y habilitación futura

Estas instrucciones preparan una operación; **no se han ejecutado en producción**.
Cada paso que cambie servicios, secretos, base, envíos reales o distribución
requiere autorización explícita del propietario.

1. **Preparación sin cambios remotos:** revisar H01 y demás bloqueantes de la
   auditoría, versión PostgreSQL destino, backups/restauración, permisos,
   conexiones, capacidad y dominio Resend. `onboarding@resend.dev` solo sirve
   para el destinatario de la cuenta, no para registro público. Exigir dominio
   propio verificado, autenticación DNS y plan de rebotes antes de habilitar.
2. **Con autorización:** respaldar esquema/datos y registrar punto recuperable.
   Aplicar migraciones pendientes en orden 003, 004, 005 (preflight y reconciliación
   manual si corresponde) y 006. 006 es aditiva, crea tabla/índices, FK hacia historial
   y checks de estados, intentos, cifrado y lease; no añade UNIQUE sobre datos
   históricos ni modifica sus filas. Necesita DDL y puede bloquear historial al
   crear la FK: `lock_timeout=2s`, `statement_timeout=30s`, transacción completa.
   Ante timeout, ROLLBACK y reprogramar; no elevar límites automáticamente.
   En bases nuevas `init.sql` incluye el esquema. Revisar drift si ya existe un
   objeto `correo_outbox`: `IF NOT EXISTS` no valida una definición ajena.
3. **Con autorización:** configurar API con `RESEND_FROM`, `EMAIL_OTP_SECRET` y
   `EMAIL_OUTBOX_KEY`. Generar la última privadamente con `openssl rand -base64 32`
   y nunca copiar el resultado al repositorio/PR/cliente. API no necesita la clave
   Resend y Compose ya no la pasa al contenedor API. Mantener OTP/JWT existentes; no usar una clave para dos finalidades.
4. **Con autorización:** preparar un rol trabajador dedicado, sin acceso a negocio,
   DDL, INSERT ni DELETE. Necesita CONNECT/USAGE; SELECT/UPDATE de `correo_outbox`;
   SELECT(id,registro_id) de historial; SELECT(id,correo,numero_suministro,invalidado,
   consumido_en,codigo_hash,intentos,vence_en) de pendientes y UPDATE(codigo_vence_en).
   Estos permisos se comprobaron con un rol sintético. El rol API necesita insertar
   historial/outbox, seleccionar estados y cancelar eventos; no asumir que el rol
   productivo ya los tenga. Mantenimiento necesita acceso a outbox para comprobar
   activos/cascadas; sigue siendo una operación separada, por defecto simulada.
5. **Con autorización y clientes compatibles:** actualizar API y probar contrato.
   No habilitar registro público mientras el trabajador y el remitente no estén
   listos: sin worker las solicitudes quedan en cola y no se envían solas.
6. **Con autorización:** configurar un proceso independiente con
   `EMAIL_WORKER_ENABLED=1`, `EMAIL_WORKER_DATABASE_URL`,
   `EMAIL_WORKER_EXPECTED_DATABASE`, `EMAIL_OUTBOX_KEY` y `RESEND_API_KEY` limitada
   a envío. No necesita secretos JWT/HMAC ni `RESEND_FROM` (cuerpo ya congelado).
   Conexiones externas fuerzan TLS `verify-full`; pool máximo dos conexiones,
   adquisición 5 s, sentencia 10 s, transacciones internas 5 s/lock 1 s.
   Ejecutar explícitamente `node Backend/workers/email-outbox.cjs --once` para un
   evento o `--run` para sondeo; `npm run worker:email` sin argumentos solo ayuda.
   No hay servicio Compose, Blueprint, cron ni arranque automático añadido.
   Supervisión y recursos de producción se diseñan/activan por separado.
7. **Con autorización:** canario de correo real, confirmar aceptación y recepción
   independientemente, verificar TTL, reenvío, login y ausencia de PII en logs.
   SIGTERM/SIGINT detienen nuevos claims y esperan el intento en curso; dar al menos
   30 s de gracia. Un fallo interno termina con error sanitizado y deja lease
   recuperable; el supervisor debe reiniciar con backoff y alertar, no bucle rápido.

No programar un reenvío automático con otra clave para filas `ambiguo`. El usuario
puede solicitar un nuevo evento sujeto a los límites; un correo anterior aún
podría llegar y su código quedará invalidado. `fallido/caducado` tampoco se
reabren automáticamente. Con clave incompatible el CLI sale sin consumir intentos
ni destruir ciphertext; comprobar el secreto privadamente antes de reiniciar.

## Monitoreo y recuperación

Los logs del trabajador solo contienen estados. Preparar métricas agregadas de
profundidad/antigüedad pendiente, intentos, leases vencidos, aceptación, errores
permanentes, ambigüedad y caducidad; alertar por acumulación, falta de aceptación y
salidas del proceso. No hay panel/alerta productiva activa ni pruebas de carga real.
No usar OTP, destinatarios, UUID, claves, cuerpo o SQL privado como etiquetas.
Los reportes Resend/webhooks de entrega están fuera de este cambio: `aceptado`
nunca se convierte en `entregado` por inferencia.

Ante incidentes, con autorización: frenar nuevas solicitudes, enviar SIGTERM al
worker, esperar la llamada en curso, conservar eventos/006 y diagnosticar sin
extraer códigos. Reiniciar con la misma clave e identidad recupera leases; el
fencing descarta finalizaciones tardías. No truncar la cola, reiniciar intentos,
extender OTP o cambiar claves de idempotencia para forzar aceptación.
Si hace falta revertir la API, mantener el registro cerrado hasta una versión
segura: volver al envío síncrono de b2f079a reintroduce H03. Login/cuentas y negocio
pueden seguir operando. No quitar 006 ni restaurar toda la base como rollback
habitual: perdería progreso confirmado. Una recuperación integral desde respaldo
requiere plan y autorización propios, conservando la incertidumbre del proveedor.

Rotación de clave: detener nuevas reservas, drenar o resolver de forma controlada
los eventos activos, verificar cero payload pendiente y cambiar API/worker juntos.
La versión actual usa una clave activa; no soporta rotación en caliente de colas
mezcladas. Conservar claves antiguas según el plan privado de backups, nunca en Git.
La retención no borra trabajos activos abandonados: operar el worker hasta
caducarlos/cancelarlos; el ciphertext puede permanecer si el proceso está apagado.

## Límites pendientes

H03 queda corregido **en desarrollo**, con evidencia local. No se probaron Neon,
SMTP/entrega real, dominio propio, teléfono físico, carga productiva ni restauración
productiva. Los vencimientos se ejercitaron con fechas SQL sintéticas, sin esperar
cinco minutos reales en este avance. La migración no se ejecutó en bases existentes.
No se activó ningún trabajador/cron, no se desplegó, publicó APK ni hizo merge.
La nueva versión completa sigue sin estar lista para producción según la auditoría.

## Inventario de archivos del avance

- Backend: `email-registration.js`, `email-outbox.js`, `outbox-crypto.js`,
  `resend-mail.js`, `server.js`, `email-cleanup.js`, `workers/email-outbox.cjs`.
- PostgreSQL: `Base-de-Datos/init.sql` y `migrations/006_correo_outbox.sql`.
- Cliente: `Frontend/index.html`.
- Pruebas: `Backend/test/email-h03-baseline.cjs`, `email-outbox-api.cjs`,
  `email-outbox-postgres.cjs`, `email-outbox.test.js`, `email-api.cjs`,
  `email-cleanup.cjs`, `email-live.cjs`, `resend-fixture.cjs` y
  `scripts/test/admin-e2e.cjs`, `scripts/test/client-checks.cjs`.
- Empaquetado/configuración de ejemplo: `Backend/Dockerfile`, `compose.yaml`,
  `.env.example` (solo plantilla pública), `package.json`. No cambia ningún secreto.
- Documentación: `CHANGELOG.md`, `README.md`, `docs/API.md`, `docs/MAINTENANCE.md`,
  `docs/auditoria-produccion.md`, `docs/verificacion-correo.md`,
  `docs/retencion-correo.md`, este informe. Sin modificar la lógica de recibos/pagos.
