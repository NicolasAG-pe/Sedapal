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
