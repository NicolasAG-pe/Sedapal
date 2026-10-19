# Correo transaccional — avance 14

## Evidencia previa y alcance

Sobre `b2f079a224e8220b55208b279004e42a7edb4c8e` se reprodujo H03 en una base
PostgreSQL 18 nueva: el adaptador simulado aceptó un mensaje, un fallo 08006 antes
del COMMIT revirtió la solicitud y el reintento produjo un segundo mensaje con
otra clave. No hubo llamadas reales a Resend. El diagnóstico local quedó en
`artifacts/h03-verification/baseline.txt` (ignorado, no necesario para producción).
La causa es efectuar una llamada externa dentro de una transacción SQL: rollback
no puede deshacer el envío. La nueva cola permite confirmar antes de enviar.

## Componentes preparados

`006_correo_outbox.sql` añade una tabla referenciada al historial de solicitudes,
sin alterar datos existentes. `encolarCorreo` requiere el cliente de la transacción
del registro; inserta historial y evento conjuntamente. El contenido JSON completo
se cifra con AES-256-GCM, IV aleatorio, etiqueta de autenticación y AAD ligada a
ambos UUID. `EMAIL_OUTBOX_KEY` debe tener 32 bytes aleatorios en base64, ser
independiente de las claves JWT/HMAC y compartirse privadamente entre API y worker.
La huella no secreta de clave evita destruir trabajos por configurar otra clave.
No se persisten OTP legibles; el HMAC continúa comprobando el código.

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
30 segundos antes del vencimiento OTP. Una pausa del proceso o demora SMTP puede
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

Node 20.19.2: 26 pruebas de correo/outbox aprobadas. Node 22.23.3: 16 pruebas
focalizadas de outbox/adaptador aprobadas. Incluyen ocho escenarios PostgreSQL:
rollback/visibilidad, backoff, dos trabajadores, crash después de aceptación y
fencing, ambigüedad acotada, clave incorrecta/corrupción, caducidad/cancelación,
restricciones/índices/conexiones. Datos sintéticos, bases nuevas, ningún correo real.

Este incremento todavía no conecta la cola al contrato HTTP. La integración,
regresiones de cliente/recibos y procedimiento operativo final se documentarán
antes de declarar H03 corregido en desarrollo. No se ha ejecutado 006 en Neon,
activado workers, publicado APK ni desplegado servicios.
