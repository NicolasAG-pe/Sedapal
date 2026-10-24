# Pérdida del autenticador y de todos los códigos

No se implementa un acceso de emergencia ni un endpoint para quitar 2FA con
correo, suministro, recibos, datos públicos, contraseña sola o una sesión abierta.
Una sesión capturada tampoco sirve como autorización reciente del factor.

El esquema actual no mantiene una identidad civil verificada ni una prueba
robusta de titularidad. Por eso **no hay base para una recuperación automática
segura**. Un correo verificado acredita acceso a ese buzón, no identidad del titular;
las cuentas históricas pueden incluso tener `correo_verificado_en=NULL`.

## Procedimiento humano propuesto, todavía no habilitado

1. Abrir un caso con identificador y limitar intentos. No confirmar públicamente
   si una cuenta existe. Soporte no solicita contraseña, TOTP, QR ni códigos.
2. Verificar identidad y relación con la cuenta mediante un canal formal y una
   fuente autorizada de titularidad (por ejemplo, atención presencial contrastada
   con el contrato original). Conocer suministro, monto o correo no es suficiente.
   Si no existe esa fuente o no permite una conclusión fiable, detener la recuperación.
3. Exigir dos revisores independientes, autenticados con 2FA, con separación entre
   solicitante, verificador y aprobador. Registrar motivo, evidencias mínimas y
   aprobaciones en un registro protegido; documentos personales fuera del repositorio
   y de los logs de la aplicación, con acceso y retención definidos.
4. Avisar por canales **previamente** registrados y verificados, sin usar un canal
   aportado en ese mismo pedido como prueba. El aviso no prueba identidad. Aplicar
   una espera acorde al riesgo y permitir reportar fraude antes del reemplazo.
5. Solo después de aprobar ese proceso, diseñar una autorización opaca, temporal,
   de un uso y restringida a reemplazar el factor. Nunca un JWT de acceso a recibos,
   pagos, perfiles o Admin. Ligar usuario, versión y expediente; exigir reautenticación
   independiente de la contraseña mediante su flujo normal si también fue perdida.
6. Al reemplazar, consumir esa autorización, invalidar sesiones/desafíos/recuperación
   anterior, incrementar versión y requerir vinculación + confirmación del nuevo
   autenticador. Notificar el resultado y auditar sin conservar material secreto.

No se proporcionan instrucciones SQL para saltar 2FA. Un administrador del panel
no recibe permiso de recuperación unilateral ni de modificar el factor de otro
usuario. El nuevo soporte 2FA Admin protege **su propia cuenta**, no crea ese poder.

## Casos que sí cubre la aplicación

- Autenticador disponible: login TOTP y regeneración de recuperación con contraseña
  reciente más TOTP; guardar los nuevos códigos fuera de Hidro-Mejora.
- Autenticador perdido, recuperación disponible: login o desactivación con contraseña
  más código de recuperación; volver a configurar y confirmar un autenticador nuevo.
- Respuesta de activación perdida: login normal con contraseña y factor recién
  vinculado; el estado público del registro por correo nunca devuelve un JWT.
- Respuesta de desactivación perdida: volver al login. El servidor determina si
  necesita factor; no repetir ciegamente la operación.

Pendiente para llevar la recuperación total a producción: proveedor/proceso real
de identidad, fuente de titularidad, registro de auditoría con permisos, responsables,
política de espera, notificaciones autorizadas y pruebas de abuso/suplantación.
No se declara implementado ni aprobado ese procedimiento por documentarlo.

Referencia: [OWASP MFA: recuperación y reemplazo de factores](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).
