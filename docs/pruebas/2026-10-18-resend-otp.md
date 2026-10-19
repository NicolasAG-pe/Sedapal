# Prueba de correo OTP con Resend — 18 de octubre de 2026

Estado: **prueba real aprobada**, verificada mediante el informe local de ejecución.
Rama: `feature/verificacion-correo`. [Draft PR #1](https://github.com/NicolasAG-pe/Sedapal/pull/1).

## Alcance y aislamiento

Se revisaron `email-registration.js`, `email-otp.js`, `resend-mail.js`, las rutas
de autenticación, las pruebas existentes y la interfaz `Frontend/index.html`
empaquetada por Capacitor. El OTP tiene seis dígitos, HMAC SHA-256, vigencia
de 300 segundos y cinco intentos acumulados. El registro no crea la cuenta:
solo una confirmación válida inserta usuario y suministro en una transacción.

El contenedor reutilizado es `hidro-email-test-20261018`, imagen `postgres:18`,
sin montajes y con puerto `127.0.0.1:32768`. Es independiente de los servicios
`sedapal-*`. Cada ejecución crea una base nueva con fixtures sintéticos y conserva
las anteriores. La ejecución real usó exclusivamente el buzón autorizado
por el propietario; el resto de sus datos de cuenta fueron sintéticos.

El ejecutor comprueba la asociación entre contenedor y puerto antes de conectar.
Fija host, base, usuario y contraseña de pruebas; vacía `DATABASE_URL` y nunca
lee `.env`. No cambia Neon, el Compose existente, volúmenes, APK ni despliegues.
El servidor de la prueba solo escucha en loopback y un puerto aleatorio.

## Resultados comprobados antes del envío real

| Validación | Resultado |
| --- | --- |
| `npm run test:email` | Tres archivos aprobados: OTP, adaptador Resend y terminal privada |
| `npm run test:config` | Tres archivos aprobados |
| `HIDRO_EMAIL_TEST_DB_PORT=32768 node Backend/test/email-schema.cjs` | Esquema, migración repetible, restricciones y conservación de cuenta previa aprobados |
| `HIDRO_EMAIL_TEST_DB_PORT=32768 node Backend/test/email-api.cjs` | HTTP/PostgreSQL con proveedor simulado: registro pendiente, consumo único, concurrencia, límites, conflictos, vencimiento y login aprobados |
| Harness `admin-e2e.cjs`, doble envío y matriz visual | 25 comprobaciones aprobadas; cero errores JavaScript y cero recursos fallidos |
| Perfil con Chromium instalado | Tres pruebas aprobadas, incluida cancelación de respuestas después del logout |
| `npm run test:documents` | Cuatro pruebas aprobadas |
| Firma Android | Regresión aprobada; sin compilar ni publicar APK |
| `email-live.cjs --prepare` | Base nueva vacía preparada, sin correos |
| `email-live.cjs --simulate` | Flujo completo del nuevo ejecutor aprobado, sin red hacia Resend |

El harness del navegador comprueba OTP, recuperación tras recarga, cooldown,
reenvío, doble clic, código sustituido y ausencia de cuenta/JWT antes de confirmar.
Incluye regresiones de las 19 rutas administrativas, JWT vencido/alterado y los
flujos anteriores de clientes. La matriz OTP cubre 360, 390, 412, 768 y 1366 px.
Perfil construye y usa el runtime Android real con respuestas sintéticas.
Esto no equivale a una prueba en teléfono físico.

Evidencia local ignorada por Git:
`artifacts/email-real-preflight/run_1792368547124/admin-e2e.json` y
`artifacts/email-live/resultado-*.json`. No publicar buzones de fixtures, capturas
con códigos, logs ni informes sin revisar. Los informes del nuevo ejecutor solo
incluyen modo, fechas, nombre aleatorio de base aislada, contadores y etiquetas
fijas de comprobación; nunca cuerpos HTTP, correos, códigos, hashes ni JWT.

## Procedimiento privado para la prueba real

Se conserva este procedimiento para reproducibilidad. La prueba real ya terminó;
este avance documental no lo vuelve a ejecutar ni envía correos adicionales.

Primero obtener autorización del propietario para **dos correos** al único buzón
que indicó en la conversación. El remitente está fijado en `onboarding@resend.dev`.
El destinatario se pasa mediante `HIDRO_LIVE_EMAIL_TO`, sin publicarlo en esta guía.
Resend restringe este remitente al correo asociado a su cuenta:
[documentación oficial](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).
Una cuenta distinta puede devolver 403; no sustituir destinatarios para eludirlo.

Desde Bash, en la raíz del repositorio, después de autorizar el envío:

```bash
(
  set +x
  export HIDRO_EMAIL_TEST_DB_PORT=32768
  IFS= read -r -p 'Destinatario autorizado: ' HIDRO_LIVE_EMAIL_TO
  export HIDRO_LIVE_EMAIL_TO
  IFS= read -r -s -p 'Resend API Key privada: ' RESEND_API_KEY
  printf '\n'
  export RESEND_API_KEY
  node Backend/test/email-live.cjs --live
)
```

Introducir la clave en el prompt, nunca como argumento, comando literal ni mensaje
del chat. `read -s` evita el eco; el subshell limita la variable a esta ejecución.
No se crean archivos de credenciales. Los secretos OTP/JWT y la contraseña sintética
se generan criptográficamente en memoria, con valores independientes.
El ejecutor exige una terminal TTY y la confirmación privada `ENVIAR 2` antes del
primer envío. Ctrl-C cancela la entrada y restaura el modo de terminal.

1. Comprobar el login de una cuenta previa sintética sin fecha de verificación.
2. Registrar con el buzón autorizado y un suministro sintético; exigir HTTP 202,
   TTL de 300 segundos, sin usuario, suministro definitivo ni JWT. Login: 401.
3. Leer el primer correo e introducir su OTP en el prompt oculto **antes de cinco
   minutos**. El ejecutor verifica su HMAC en memoria sin guardar el código como
   evidencia. Revisa también spam; no enviar capturas ni copiar el OTP al chat.
4. Probar un código distinto, exigir 400 y un intento persistente sin cuenta.
5. Esperar hasta que el reloj de PostgreSQL supere el vencimiento. El ejecutor
   muestra el tiempo restante cada 30 segundos como máximo y exige al menos
   300 segundos reales desde el registro. No modifica fechas en modo real.
6. Reutilizar el primer OTP vencido: exigir 400 y ausencia de cuenta/suministro.
7. Reenviar: segundo correo, nuevo hash, mismo registro y contador de intentos.
8. Introducir el segundo OTP desde la terminal antes de su caducidad. Dos
   confirmaciones concurrentes deben producir exactamente 201 y 400. Un tercer
   uso también debe fallar; no se emite JWT desde la confirmación.
9. Comprobar un usuario verificado y un suministro enlazado, cero huérfanos,
   exactamente dos envíos lógicos y limpieza de los hashes pendientes consumidos.
10. Iniciar sesión, usar el JWT en `/api/me/perfil`, rechazar contraseña incorrecta
    y repetir el login de la cuenta previa. JWT/contraseña permanecen en memoria.
11. Revisar el informe con permisos 0600 bajo `artifacts/email-live/`. Comunicar
    únicamente la ruta y el resultado, sin claves ni códigos. La base se conserva
    localmente y contiene el buzón real, por lo que no debe exportarse ni subirse.

`--simulate` usa solo un destinatario `.invalid` y un proveedor en memoria; adelanta
fechas exclusivamente en su propia base sintética para ensayar la caducidad sin
esperar. Su informe distingue `simulacion_aprobada` de `prueba_real_aprobada`.

## Problemas encontrados y soluciones

- El sandbox bloqueó conexiones PostgreSQL/Docker y herramientas PDF: se repitieron
  las pruebas pertinentes fuera del sandbox con autorización, conservando el
  aislamiento de datos. No eran defectos del flujo de registro.
- Perfil buscaba Chromium en una caché ausente. Se resolvió usando
  `PLAYWRIGHT_BROWSERS_PATH=artifacts/vercel-validation/browsers`, que ya contiene
  el navegador. Las tres pruebas pasaron sin cambiar el código de producción.
- Faltaba un procedimiento reproducible para credenciales/OTP privados y caducidad
  real. Se añadió `Backend/test/email-live.cjs`, sus pruebas de terminal y el comando
  `npm run test:email:live`. Los fallos del ejecutor se informan por etapa con texto
  fijo; los errores SQL del servidor heredado no se imprimen ni guardan.

## Resultado de la ejecución real

Se revisó el informe local más reciente,
`artifacts/email-live/resultado-1792369605147-e602a843.json`, sin incorporarlo a Git.
Sus nueve comprobaciones coinciden, en contenido y orden, con las del ejecutor
`Backend/test/email-live.cjs` publicado en `be8f1b1`.

| Dato del informe | Valor comprobado |
| --- | --- |
| Modo | `live` |
| Resultado | `prueba_real_aprobada` |
| Inicio UTC | `2026-10-19T00:26:45.146Z` |
| Fin UTC | `2026-10-19T00:32:02.472Z` |
| Fecha y horario en Lima (UTC−05:00) | 18 de octubre de 2026, 19:26:45 a 19:32:02 |
| Vigencia configurada del OTP | 300 segundos |
| Espera real registrada | 300 segundos |
| Envíos lógicos aceptados | 2 |
| Comprobaciones aprobadas | 9 |

Huella SHA-256 del archivo local, para comprobar la identidad de la evidencia:
`f3d3c0091ebc7584ce8adaa3ca13a3f8c6713ff29b068806076069b5bb754cc6`.
Esta huella corresponde al informe completo, no a un OTP ni a una credencial.

| Comprobación de la prueba real | Resultado aprobado |
| --- | --- |
| PostgreSQL aislado | Base nueva y vacía; esquema inicial aplicado |
| Compatibilidad con cuenta previa | Login de cuenta sintética sin fecha de verificación antes y después del flujo |
| Registro y primer envío real por Resend | HTTP 202; TTL de 300 segundos; sin usuario, suministro definitivo ni JWT antes de confirmar; login previo rechazado |
| Recepción privada del primer OTP | El código introducido desde la terminal coincide con el HMAC del primer envío |
| Código incorrecto | HTTP 400; intento persistente y ausencia de cuenta/suministro |
| Caducidad real | Primer OTP rechazado con HTTP 400 tras esperar 300 segundos reales, sin modificar fechas ni crear cuenta/suministro |
| Reenvío real | Segundo envío aceptado; nuevo hash y contador de intentos conservado; cuenta aún pendiente |
| Confirmación única e integridad | Dos confirmaciones concurrentes producen 201 y 400; reutilización rechazada; exactamente un usuario verificado y su suministro, cero huérfanos y hashes pendientes consumidos limpiados |
| Registro completado y sesión | Login correcto y acceso al perfil protegido; contraseña incorrecta rechazada; cuenta previa conserva acceso |

Al documentar este resultado se validaron el modo, estado, fechas, contadores y
las nueve etiquetas del informe contra el ejecutor. Se revisó el diff documental
para excluir datos personales y secretos. No se repitieron el flujo, los envíos
ni las pruebas que requieren escribir en PostgreSQL. El informe privado y la base
aislada se conservan localmente; solo se publica este resumen sin credenciales,
direcciones personales, códigos ni tokens.

## Límites de la evidencia y pasos antes de producción

HTTP 202 y el adaptador acreditan aceptación del proveedor, no colocación en inbox.
La entrada correcta del OTP recibido acredita el acceso al mensaje por el operador.
La prueba real cubre el flujo API/PostgreSQL; la interfaz web/Android se validó
por separado con proveedor simulado. No se acredita una nueva prueba física de APK
ni el funcionamiento de cuentas de producción: la cuenta previa es sintética.
Esta prueba no consulta cuerpos de Resend ni comparte enlaces a sus mensajes;
los eventos de entrega del proveedor requerirían una comprobación separada.
Cualquier repetición futura requiere autorización para los envíos adicionales.

Antes de producción: validar dominio propio/remitente y entregabilidad, acordar
retención de pendientes, evaluar la recuperación ante un envío aceptado seguido de
un fallo de COMMIT, y coordinar migración y cliente. El SMTP/proveedor y PostgreSQL
no comparten una transacción; la idempotencia cubre los reintentos del mismo envío,
pero no garantiza atomicidad entre ambos sistemas. La APK anterior conserva login
y espera el contrato antiguo de registro. El suministro es una asociación académica
y no una acreditación contra un sistema oficial. Toda migración, publicación,
despliegue o merge requiere la autorización separada del propietario.
