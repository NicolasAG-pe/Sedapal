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
