# Verificación de correo: desarrollo y revisión

Repositorio: `NicolasAG-pe/Sedapal`. Rama: `feature/verificacion-correo`.
La revisión se centraliza en un Draft Pull Request hacia `main`.

## Avances previstos

1. Registrar el flujo de trabajo y comprobar la configuración existente.
2. Preparar el esquema de registros pendientes y los códigos de un solo uso.
3. Integrar Resend y las rutas de registro, confirmación y reenvío con pruebas aisladas.
4. Incorporar la confirmación al cliente web/Android y documentar la configuración.

Cada punto se publica al completarse, con diff revisado, pruebas y entrada en
`CHANGELOG.md`. Los hashes y resultados se pueden revisar en los commits del PR.

## Decisiones de seguridad

- Crear usuario y suministro solo al confirmar el correo. Las cuentas existentes
  conservan el acceso; no se modifica su estado mediante una migración masiva.
- Generar códigos con aleatoriedad criptográfica; validar mediante HMAC ligado
  a la solicitud y a un secreto exclusivo. La outbox conserva temporalmente el
  mensaje cifrado con AES-GCM y una clave independiente; nunca OTP legibles.
- Limitar vigencia, intentos y reenvíos. La confirmación y el consumo deben ser
  atómicos para impedir reutilización o dobles registros concurrentes.
- Guardar únicamente el hash de la contraseña del registro pendiente. No devolver
  códigos, hashes ni secretos por la API ni escribirlos en logs.
- Enviar desde el backend con Resend, con timeout y clave de idempotencia por envío.
  No incorporar claves de Resend a la aplicación ni a los archivos generados.
- No activar un modo de registro sin verificación si falta la configuración.
- Probar con un proveedor simulado y PostgreSQL aislado; el envío real y cualquier
  cambio de infraestructura requieren configuración y autorización independientes.

La verificación acredita el control del correo; el suministro continúa siendo
declarado por el usuario en este prototipo académico, sin validación oficial.

## Revisión antes de publicar

Revisar `git diff --check`, el diff preparado, los nombres de los archivos y el
contenido completo de los nuevos archivos. Excluir secretos, datos personales,
respaldos y binarios privados. Ejecutar las pruebas correspondientes al avance,
crear el commit y hacer push de la rama. Comprobar el SHA remoto y mantener el PR
en borrador, sin fusionar ni desplegar.

## Proveedor de correo

El adaptador usa la [API de envío de Resend](https://resend.com/docs/api-reference/emails/send-email)
y sus [claves de idempotencia](https://resend.com/docs/dashboard/emails/idempotency-keys).
El registro no llama al proveedor. Confirma la solicitud y un evento cifrado en
la misma transacción PostgreSQL; un trabajador independiente intenta enviarlo
**después del commit**. Consulta [arquitectura y operación outbox](correo-outbox.md).
Cada evento permite cinco intentos como máximo, un HTTP de hasta 10 s por claim,
backoff y la misma clave/cuerpo en todos los intentos. 429 permite reintento;
red, timeout, 409 y 5xx se tratan como potencialmente ambiguos. Los 4xx restantes
son permanentes. No se inspeccionan ni registran errores privados del proveedor.
La aceptación por Resend no acredita entrega en bandeja ni lectura.

## Transición de clientes — avance 15

El cliente nuevo usa `/api/auth/otp/register` y `/api/auth/otp/resend-verification`,
con `X-Hidro-Auth-Contract: otp-outbox-v1`; el alta requiere UUID `solicitud_id`
persistido antes de enviar. Los alias de la tabla siguiente conservan el guardia:
sin contrato devuelven 426 y no crean solicitud. Login no requiere esa cabecera.
Consulta de estado también devuelve verificado/cerrado o 404, permitiendo recuperar
respuestas perdidas. El reintento de alta con el mismo UUID y credenciales conserva
el evento/cuota; no sobrescribe contraseñas ni amplía vigencia. Sin migración nueva.
[Compatibilidad, contrato completo, pruebas y plan Android](android-transicion.md).

## Contrato de la API

El código OTP vence 300 segundos después de preparar el primer intento de envío.
La solicitud vence a la hora original, sin ampliarla por demora o reenvío.

| Ruta POST | Entrada | Éxito |
| --- | --- | --- |
| `/api/auth/register` | `correo`, `numero_suministro`, `password` | 202, `estado: pendiente`, `estado_envio: en_cola`, `registro_id`, `vence_en: null`, `solicitud_vence_en`, `reenvio_en_segundos` |
| `/api/auth/verify-email` | `registro_id`, `codigo` (texto de seis dígitos) | 201, `estado: ok`, suministro para iniciar sesión |
| `/api/auth/resend-verification` | `registro_id` | 202, nuevo evento en cola; el código anterior se invalida |
| `/api/auth/verification-status` | `registro_id` | 200, estado de envío y plazos, sin destinatario ni código |

No se retorna JWT en estas rutas; después de confirmar se usa el login habitual.
El identificador UUID aleatorio permite confirmar/reanudar la solicitud; tratarlo
como un dato privado temporal. No incluirlo en URLs ni logs.

Los límites de envío (60 segundos y 3/hora) se comparten por correo y por suministro
mediante historial y bloqueos PostgreSQL. Las rutas además limitan por IP:
registro/reenvío 10 peticiones por 15 minutos, verificación 30 y consulta de
estado 240 por 15 minutos. Los cupos de envío cuentan reservas de la cola,
incluso si el proveedor falla, para evitar eludir límites mediante errores.
Los cinco intentos son acumulados por solicitud y no se reinician con el reenvío.
Al agotarlos se requiere un registro nuevo, sujeto al mismo límite de envíos.
Una solicitud nueva para el mismo correo invalida las anteriores. La confirmación
consume la solicitud y crea cuenta/suministro en una sola transacción. Las cuentas
previas no se marcan artificialmente como verificadas.

Errores: 400 código/entrada inválidos o solicitud vencida; 409 datos ocupados;
429 límite de solicitudes (`Retry-After` cuando lo impone el servicio); 503
configuración ausente o contención SQL temporal. Los errores Resend ya no revierten
la solicitud: se reflejan en la cola y en la consulta de estado. Un fallo anterior
al commit no crea el evento ni permite enviar. Un commit con respuesta HTTP
perdida puede requerir reiniciar el registro tras el cooldown; no hay idempotencia
de la solicitud HTTP. El trabajador sí conserva la identidad de cada evento.

La [política de retención](retencion-correo.md) conserva cada solicitud al menos
24 horas después de `vence_en`, además de proteger cualquier envío de la última
hora. La limpieza usa lotes, bloqueos y cascada del historial/outbox terminal asociado;
protege cualquier evento activo incluso si la solicitud es antigua y
no elimina usuarios ni suministros. No se ejecuta desde el arranque ni está
programada en producción. Las pruebas eliminan solo fixtures de bases nuevas.

## Pruebas locales aisladas

Instalar dependencias con `npm ci --prefix Backend`. Ejecutar `npm run test:email`
y `npm run test:config`. Para las pruebas de base/API usar un PostgreSQL separado,
publicado solo en loopback, con base `hm_email_test` y usuario de fixtures
`hm_fixture`; nunca usar credenciales de producción. El fixture de conexión se
define en `Backend/test/email-schema.cjs`.

Con el puerto de ese contenedor, ejecutar:

```sh
HIDRO_EMAIL_TEST_DB_PORT=<puerto-local> npm run test:email:schema
HIDRO_EMAIL_TEST_DB_PORT=<puerto-local> npm run test:email:api
HIDRO_EMAIL_TEST_DB_PORT=<puerto-local> npm run test:email:outbox
```

Cada ejecución crea bases nuevas con nombres aleatorios y no borra las anteriores.
Las pruebas de API arrancan un servidor HTTP local, interceptan exclusivamente el
envío a Resend y verifican el flujo contra PostgreSQL real con datos sintéticos.
No leen archivos `.env` ni envían mensajes reales.

## Cliente web y Android

El cliente compartido muestra la pantalla de código después del registro 202.
Ofrece entrada numérica de seis dígitos con `autocomplete="one-time-code"`,
errores accesibles, cuenta regresiva de reenvío y protección contra doble envío.
Confirmar lleva al login con el suministro rellenado; no inicia sesión por sí solo.
La aplicación Android usa este mismo HTML empaquetado por Capacitor.

La solicitud puede retomarse después de recargar, incluso con `vence_en: null`.
El cliente consulta el estado cada cinco segundos mientras está en cola/proceso;
se detiene al obtener aceptación o estado terminal. Una desconexión conserva el
estado y el código introducido. No promete envío ni entrega por recibir un 202.
Solo se guarda en `sessionStorage` el identificador, suministro y plazos; nunca
contraseña, código ni JWT de registro. Las contraseñas se vacían al recibir el 202.
"Usar otros datos" descarta el estado local y permite iniciar otra solicitud, sin
eludir los límites del servidor. Un login válido o el cierre de sesión limpia
también este estado temporal.

El harness existente de cliente/admin simula Resend mediante un preload exclusivo
de pruebas (`Backend/test/resend-fixture.cjs`) en un trabajador hijo explícito; no existe un modo de envío simulado
configurable en el servidor de producción. Su buzón contiene solo códigos y
direcciones sintéticas dentro del directorio de reportes ignorado por Git.

Para repetirlo en el contenedor aislado, usar `HIDRO_EMAIL_TEST_DB_PORT` y ejecutar
`node scripts/test/admin-e2e.cjs`. Se puede indicar la ruta de Chromium con
`HIDRO_TEST_CHROME`. `HIDRO_TEST_DOUBLE_SUBMIT=1`, `HIDRO_TEST_VISUAL_CAPTURE=1` y
`HIDRO_TEST_VISUAL_MATRIX=1` habilitan dobles envíos y capturas/verificación de
layout, campos accesibles y controles en varios anchos. Los reportes permanecen
locales en `/tmp` o bajo `artifacts/` con `HIDRO_TEST_REPORT_DIR`.

## Configuración pendiente de autorización

1. Configurar privadamente en la API `RESEND_FROM`, `EMAIL_OTP_SECRET` y
   `EMAIL_OUTBOX_KEY`; el trabajador usa su conexión exclusiva, la misma clave
   outbox y `RESEND_API_KEY`, sin necesitar el secreto HMAC ni el JWT. Usar una
   clave Resend con permiso de envío y un remitente
   de dominio verificado. Generar el secreto OTP con un generador criptográfico
   (por ejemplo `openssl rand -hex 32`), independiente de `AUTH_TOKEN_SECRET`.
   No pegar esos valores en GitHub, el PR ni el cliente.
2. Revisar y autorizar las migraciones aditivas 003, 004, 005 (con su preflight
   de integridad independiente) y `006_correo_outbox.sql`, en ese orden, antes de aplicarlas a
   una base existente. El arranque no aplica migraciones automáticamente. Para
   una base de desarrollo nueva, `init.sql` ya incluye el esquema completo.
3. Revisar la [retención ya implementada](retencion-correo.md) y autorizar por
   separado su operación y futura programación en un destino identificado.
   Comprobar dominio y remitente propios antes de producción. La entrega real de
   prueba y el reenvío ya se documentaron en
   [el informe OTP](pruebas/2026-10-18-resend-otp.md).
4. Revisar la compatibilidad de versiones antes de publicar: el nuevo contrato de
   registro 202 requiere este cliente actualizado. La APK v1.0.0 anterior espera
   registro inmediato; su login de cuentas existentes sigue siendo compatible.
5. Solo tras autorización, coordinar los cambios de backend/base y la distribución
   del cliente. No se realiza merge ni publicación de APK. Las previews automáticas
   detectadas en Vercel se registran a continuación y se deshabilitan para esta rama.

Si faltan variables de correo requeridas por la API, registro/confirmación/reenvío
y consulta responden 503; login y el resto de la aplicación conservan su comportamiento anterior. No hay
fallback a creación de cuentas sin verificación.

## Validación histórica previa al avance 14 — 18 de octubre de 2026

- `npm run test:config` y `npm run test:email`: aprobados.
- Pruebas de esquema y API con `HIDRO_EMAIL_TEST_DB_PORT=32768`: aprobadas en
  el contenedor aislado `hidro-email-test-20261018`. Cada ejecución creó una base
  nueva sin usar el `.env` local ni conexiones externas de base de datos.
- Harness de Chromium con doble envío y matriz visual: 25 comprobaciones
  aprobadas, cero errores JavaScript y cero recursos fallidos. Evidencia local:
  `artifacts/email-verification/run_1792366815866/admin-e2e.json`; no se publica
  el buzón de códigos ni logs en Git. Matriz OTP: 360, 390, 412, 768 y 1366 px.
- Runtimes `web` y `android` generados en directorios temporales y validados por
  `verifyClientRuntime`: 15 archivos cada uno, formulario de verificación presente,
  sin código administrativo ni referencias a secretos del servidor.
- Regresiones de documentos (4 pruebas) y firma Android aprobadas. No se compiló
  ni distribuyó una APK y no se ejecutó un envío real de correo.

El contenedor de pruebas y sus bases se conservan. Los reportes son locales y los
resultados reproducibles se documentan aquí y en el PR; no equivalen a una prueba
de entrega de Resend ni a una validación en teléfono físico.

La evidencia nueva de avance 14, incluida Node 22 y la cola, figura en
[correo-outbox.md](correo-outbox.md). Las pruebas anteriores se conservan como
históricas; no prueban este contrato por sí solas.

## Auditoría de automatizaciones de GitHub

La integración Vercel existente activó previews al recibir los primeros pushes.
La auditoría de `a7ebcae` confirmó los entornos `Preview – hidro-mehora-admin`
(completado) y `Preview – sedapal` (fallido). El segundo buscó
`/vercel/path0/Backend/scripts/build-web.js`, que no existe; esto corresponde a
la configuración del proyecto Vercel y su raíz, y no a las pruebas locales de OTP.
No se reintentó el despliegue ni se cambiaron ajustes remotos del proyecto.

Para impedir nuevas previews de esta rama, `vercel.json` y `Backend/vercel.json`
declaran `git.deploymentEnabled["feature/verificacion-correo"] = false` según la
[configuración Git oficial de Vercel](https://vercel.com/docs/project-configuration/git-configuration).
Se incluyen ambas raíces porque los proyectos conectados construyen desde
directorios distintos. Antes de publicar futuras ramas, comprobar también sus
integraciones y autorizaciones; un Draft PR no impide las previews automáticas.
