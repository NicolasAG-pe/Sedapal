# Auditoría y perfeccionamiento de 2FA — sin lanzamiento

Base comprobada: `0fc2af4`, rama `feature/seguridad-totp`, Draft PR #12.
Main `d6a6b83` y Draft PR #11 se conservan. Esta auditoría no publica 1.2.0,
no modifica producción y mantiene la migración 007 pendiente en Neon.

## Primer incremento: errores reproducidos y corregidos

Las pruebas nuevas fallaron contra la implementación anterior y aprobaron
después de corregir estos casos:

1. **JWT anterior a un cambio de rol adquiría los permisos nuevos.** Se vincula el
   claim de rol al rol actual. Un trigger preparado en 007 incrementa la versión
   de seguridad en cambios futuros de rol/estado: volver al rol original o reabrir
   la cuenta no revive JWT anteriores. Aplicar 007 no actualiza usuarios históricos.
2. **Petición validada antes de un cambio MFA modificaba el estado nuevo.** Se
   vuelve a comprobar el actor y su versión dentro de la transacción con bloqueo,
   no solo en el middleware HTTP. Un 401 de sesión caducada/cambiada se diferencia
   del error de código y obliga a autenticarse de nuevo.
3. **Handshake pendiente podía entrar en rooms después de revocar sockets.** La
   conexión entra en una sala de revocación sin datos de negocio y vuelve a leer
   estado/rol/versión antes de unirse a rooms privadas. El cambio 2FA desconecta
   también esa sala. Prueba con barrera SQL reproduce el orden adverso.
4. **Respuesta tardía repoblaba recuperación después de logout.** Se comprueba la
   generación también después de establecer la sesión. Una operación anterior no
   puede mostrar códigos ni cerrar la sesión nueva de otra cuenta.

La retención explícita solo limpia vinculaciones caducadas, desafíos expirados
y hashes usados antiguos (30 días por defecto, mínimo 7, lotes limitados). No
borra usuarios, estado `usuario_2fa`, versiones ni `ultimo_paso`: borrarlos podría
revivir JWT o TOTP. No se programó ningún mantenimiento productivo.

Regenerar recuperación exige contraseña más TOTP. Si el autenticador se perdió,
se utiliza contraseña más recuperación para **desactivar** y volver a configurar.
Así no se fomenta invalidar todos los códigos cuando el único factor restante es
uno de ellos. Una respuesta de cambio perdida obliga a volver al login, sin
repetir automáticamente una operación que quizá ya confirmó el servidor.

Validación de este incremento: 27 pruebas backend Node 22/PostgreSQL 18 aislado,
18 Chromium (OTP, compatibilidad, sesión y carrera de logout), todas aprobadas.
El código de cuenta deshabilitada sigue siendo 403; cambios de rol/versión exigen
login nuevo (401). Se actualizó ese contrato de revocación en sus pruebas.

## Alcance de la garantía y bloqueos futuros

El servidor nuevo no puede impedir que código **antiguo** con la misma clave JWT
y credencial de base ignore las tablas MFA. Es un riesgo de downgrade real, no
solucionado por un flag ni por el cliente. Antes de activar factores en producción
se requiere una política externa que admita solo imágenes/commits compatibles y
prohíba el rollback al backend anterior. No se modifican esos servicios aquí.

Socket.IO usa actualmente un adaptador en memoria y una API. Las pruebas de
revocación cubren esa arquitectura. Varias réplicas necesitan propagación de
revocaciones entre instancias y pruebas específicas; no se declara esa garantía.

## Segundo incremento: custodia y recuperación

[Custodia y rotación](../seguridad-claves-totp.md): lectura compatible v1/v2,
identificador de clave, anillo acotado, respaldo cifrado independiente y herramienta
privada 0600 sin acceso a la base. Rotación con dry-run, límite, destino explícito,
transacción atómica y conservación de contadores/versiones/códigos usados.
25 pruebas focalizadas Node 22 aprobaron. La restauración SQL sintética completa
en otra base preservó 16 tablas, restricciones, 8 secuencias, fotografía y clave.
El primer ensayo detectó una diferencia equivalente de casts en el deparser de
PostgreSQL; se normalizó ese caso y se repitió el ensayo completo en bases nuevas.

[Pérdida total de factores](../recuperacion-cuenta-2fa.md): no hay identidad civil
verificada en el esquema, por lo que no se añade un reset automático. Se requiere
un procedimiento humano con fuente de titularidad y aprobaciones independientes.
No se afirma que ese proceso esté habilitado ni se añade una puerta administrativa.

Pendiente de este avance: 2FA Admin local, comprobación de downgrade y regresiones
nativas finales. Se documentarán sus resultados reales al cerrarlo.

Referencias: [OWASP MFA](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
y [almacenamiento criptográfico](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html).
