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
- Generar códigos con aleatoriedad criptográfica y guardar únicamente su HMAC,
  ligado al identificador de solicitud y a un secreto exclusivo del servidor.
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
Un envío tiene como máximo dos intentos con el mismo cuerpo y clave; los errores
de red, timeout, 429 y 5xx permiten el segundo intento. Un 4xx permanente no se
reintenta. Cada intento tiene timeout de 10 segundos, con una pausa de un segundo
entre intentos. La aceptación por Resend no acredita entrega en la bandeja de
entrada: solo la confirmación del código acredita control del correo.

## Contrato de la API

| Ruta POST | Entrada | Éxito |
| --- | --- | --- |
| `/api/auth/register` | `correo`, `numero_suministro`, `password` | 202, `estado: pendiente`, `registro_id`, `vence_en`, `reenvio_en_segundos` |
| `/api/auth/verify-email` | `registro_id`, `codigo` (texto de seis dígitos) | 201, `estado: ok`, suministro para iniciar sesión |
| `/api/auth/resend-verification` | `registro_id` | 202, solicitud y nueva vigencia del código |

No se retorna JWT en estas rutas; después de confirmar se usa el login habitual.
El identificador UUID aleatorio permite confirmar/reanudar la solicitud; tratarlo
como un dato privado temporal. No incluirlo en URLs ni logs.

Los límites de envío (60 segundos y 3/hora) se comparten por correo y por suministro
mediante historial y bloqueos PostgreSQL. Las rutas además limitan por IP:
registro/reenvío 10 peticiones por 15 minutos y verificación 30 por 15 minutos.
Los cinco intentos son acumulados por solicitud y no se reinician con el reenvío.
Al agotarlos se requiere un registro nuevo, sujeto al mismo límite de envíos.
Una solicitud nueva para el mismo correo invalida las anteriores. La confirmación
consume la solicitud y crea cuenta/suministro en una sola transacción. Las cuentas
previas no se marcan artificialmente como verificadas.

Errores: 400 código/entrada inválidos o solicitud vencida; 409 datos ocupados;
429 límite de solicitudes (`Retry-After` cuando lo impone el servicio); 503 correo
sin configurar o envío fallido. Un fallo o timeout de Resend revierte el cambio:
no crea cuentas ni deja códigos nuevos utilizables. Si Resend aceptó un mensaje
pero se perdió su respuesta, ese código puede resultar inutilizable y el usuario
debe volver a solicitarlo. Los intentos automáticos del adaptador usan idempotencia.

El historial contiene datos de registro pendientes y debe conservarse al menos
una hora para aplicar los límites. Antes de habilitarlo en producción, definir una
limpieza de solicitudes de más de 24 horas (incluye cascada de envíos) bajo la
política de retención autorizada. No se ejecuta limpieza contra bases existentes
desde el arranque ni desde estas pruebas.

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

La solicitud puede retomarse después de recargar en la misma sesión del navegador.
Solo se guarda en `sessionStorage` el identificador, suministro y plazos; nunca
contraseña, código ni JWT de registro. Las contraseñas se vacían al recibir el 202.
"Usar otros datos" descarta el estado local y permite iniciar otra solicitud, sin
eludir los límites del servidor. Un login válido o el cierre de sesión limpia
también este estado temporal.

El harness existente de cliente/admin simula Resend mediante un preload exclusivo
de pruebas (`Backend/test/resend-fixture.cjs`); no existe un modo de envío simulado
configurable en el servidor de producción. Su buzón contiene solo códigos y
direcciones sintéticas dentro del directorio de reportes ignorado por Git.

Para repetirlo en el contenedor aislado, usar `HIDRO_EMAIL_TEST_DB_PORT` y ejecutar
`node scripts/test/admin-e2e.cjs`. Se puede indicar la ruta de Chromium con
`HIDRO_TEST_CHROME`. `HIDRO_TEST_DOUBLE_SUBMIT=1`, `HIDRO_TEST_VISUAL_CAPTURE=1` y
`HIDRO_TEST_VISUAL_MATRIX=1` habilitan dobles envíos y capturas/verificación de
layout, campos accesibles y controles en varios anchos. Los reportes permanecen
locales en `/tmp` o bajo `artifacts/` con `HIDRO_TEST_REPORT_DIR`.

## Configuración pendiente de autorización

1. Configurar privadamente en el backend `RESEND_API_KEY`, `RESEND_FROM` y
   `EMAIL_OTP_SECRET`. Usar una clave Resend con permiso de envío y un remitente
   de dominio verificado. Generar el secreto OTP con un generador criptográfico
   (por ejemplo `openssl rand -hex 32`), independiente de `AUTH_TOKEN_SECRET`.
   No pegar esos valores en GitHub, el PR ni el cliente.
2. Revisar y autorizar la migración aditiva
   `Base-de-Datos/migrations/003_verificacion_correo.sql` antes de aplicarla a
   una base existente. El arranque no aplica migraciones automáticamente. Para
   una base de desarrollo nueva, `init.sql` ya incluye el esquema completo.
3. Definir la retención/limpieza de pendientes y comprobar dominio, remitente y
   una entrega real a un buzón de prueba autorizado, incluidos spam y reenvío.
4. Revisar la compatibilidad de versiones antes de publicar: el nuevo contrato de
   registro 202 requiere este cliente actualizado. La APK v1.0.0 anterior espera
   registro inmediato; su login de cuentas existentes sigue siendo compatible.
5. Solo tras autorización, coordinar los cambios de backend/base y la distribución
   del cliente. Este trabajo no realiza merge, despliegues ni publicación de APK.

Si faltan variables de correo, registro/confirmación/reenvío responden 503;
login y el resto de la aplicación conservan su comportamiento anterior. No hay
fallback a creación de cuentas sin verificación.

## Validación del 18 de octubre de 2026

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
