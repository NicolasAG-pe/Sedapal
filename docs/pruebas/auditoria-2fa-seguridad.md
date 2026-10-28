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

## Tercer incremento: Admin, UX y downgrade

Admin incorpora el segundo paso de login y gestiona **su propio factor** desde Mi
cuenta, con el mismo componente `Shared/two-factor-ui.js` usado por el cliente.
No se cargan permisos privados antes de obtener el JWT completo y confirmar el
permiso actual. El JWT administrativo sigue solo en memoria. Se conserva login por
suministro y la interfaz existente. `TOTP_ADMIN_ENROLLMENT_ENABLED=0` separa el
alta administrativa del alta de usuarios; ambos permanecen cerrados por defecto.
Un usuario promovido conserva el factor, invalida su JWT anterior y requiere login
nuevo con contraseña y MFA antes de disponer de permisos administrativos.

Se distinguen códigos incorrectos de sesión caducada, se asocian errores a campos
y se anuncia carga con `aria-busy`. Timeout, 5xx o respuesta perdida de un cambio
crítico/inicio de segundo factor eliminan el desafío y los datos efímeros y llevan
a login; no se reenvía automáticamente una operación que quizá ya consumió un código.
El doble envío se bloquea. Respuestas de una generación anterior no afectan otra cuenta.

[Downgrade y control de publicación](../seguridad-despliegue-2fa.md): el backend
antiguo efectivamente permitió contraseña sola en el laboratorio. El candidato
la rechaza y la herramienta de contrato bloquea al antiguo. No se afirma que
esa herramienta impida por sí sola un rollback manual remoto: falta imponer la
política externa en **todos** los caminos antes de activar factores reales.

## Resultado final de pruebas

| Entorno/comprobación | Resultado |
| --- | --- |
| Node 22.23.4 + PostgreSQL 18 + Docker: autenticación/2FA/auditoría/Admin/rotación/OTP/sesiones/outbox/configuración/recibos/pagos/esquema/retención | 80 aprobadas, 0 fallidas, 1 omitida por `HIDRO_RECEIPT_TEST_LEGACY`. Incluye casos anidados. |
| Admin focalizado, incluida promoción con factor y HTTPS de candidato | 4/4 aprobadas después de ampliar la regresión. Se solapa con parte de la suite anterior; no se suman como casos independientes. |
| Chromium + API/SQL, sesión/OTP/registro/documentos/HidroBot/importes y Admin | 45/45 aprobadas. Son pruebas de navegador, no Android. |
| UX focalizada: respuesta tardía tras logout, doble envío, respuesta perdida, timeout, 5xx y expiración | 6/6 aprobadas. |
| Runtime/configuración pública e identidad Android | 8/8 aprobadas. Fixture actualizado para incluir el componente compartido; ningún recurso Admin en el runtime cliente. |
| AVD Android 15/API 35, WebView real, Java 21 | 6 comprobaciones 2FA aprobadas: Keystore instrumentado, QR/activación, ausencia de JWT tras contraseña sola, rechazo/recuperación, force-stop con un socket, desactivación/logout. |
| Regresión OTP nativa en el mismo AVD dedicado | 12 comprobaciones aprobadas: UUID durable, reenvíos/errores/vencimiento, respuesta perdida sin JWT público, acceso automático, fallo seguro de almacenamiento, cifrado, force-stop/muerte del proceso y logout. |
| Gradle 8.11.1 / Java 21 | Debug e instrumentación compilados; 4 tests unitarios debug aprobados. `lintDebug`: 0 errores, 16 advertencias de manifiesto/recursos conservados. No se construye release. |
| Dockerfiles finales API/Admin | Construidos; health/capabilities y contrato correctos. Admin, JS compartido y proxy API devuelven 200 en red privada, sin puertos públicos. |
| Backup/restauración real de laboratorio | `pg_dump`/`pg_restore` en dos bases nuevas: 16 tablas, constraints, 8 secuencias, fotografía y clave recuperada coinciden. |
| Dependencias | `npm audit --prefix Backend --omit=dev`: cero vulnerabilidades. |

No quedan pruebas fallidas del conjunto ejecutado. No se ejecutó el caso histórico
omitido, una auditoría WCAG completa, una topología Socket.IO con múltiples réplicas
ni el procedimiento humano real de recuperación. Las diferencias de fixtures y
herramientas no se ocultaron: se corrigieron nombres/formato/copia compartida,
se detectó un AAD inconsistente en el nuevo respaldo antes de darlo por válido y
se repitieron sus pruebas. El CLI GitHub antiguo no pudo editar por GraphQL clásico;
la descripción final del Draft se actualiza mediante REST.

## Evidencia y producción

Resultados privados: `artifacts/totp-hardening/`, AVD 2FA
`artifacts/android-session-native-LQjlHy/` y OTP
`artifacts/android-session-native-sHocBr/`. Captura local Admin con datos sintéticos:
`admin-profile.png`; no se publican QR ni códigos. La terminación del proceso de
la regresión OTP fue SIGKILL del PID propio tras HOME, no una prueba real de LMKD.

APK 1.1.1 intacta:
`541b4c9d70a52396266358d786032db47c85e99aa2ae4d7ae1bcf5eb28c3bb4b`.
APK 1.1.2 intacta:
`a6b81541a210e79ffb6ec8a38c79b8b1260758ab45c246b81fca45ee4439ed93`.
Sin cambios de firma, versión Gradle, cuentas productivas, claves productivas,
Neon, Render, Vercel, Kubernetes, correos reales, main ni PR #11. La migración 007
se amplió y probó aquí pero **continúa pendiente en producción**. No se publica 1.2.0.

## Validación física pendiente y próximas tareas

Para un ensayo posterior autorizado, usar cuentas sintéticas y backend aislado con
HTTPS verificado, flags solo del laboratorio y una aplicación autenticadora real:

1. Escanear el QR desde el teléfono, confirmar con un código y guardar recuperación
   en un lugar privado externo a Hidro-Mejora. El código de activación se consume:
   esperar al siguiente para iniciar otra sesión con TOTP.
2. Probar reloj automático, código incorrecto/vencido/usado, login sin datos privados
   antes del segundo factor, cambio de cuenta, reinicio y logout.
3. Simular pérdida de red y respuesta después de confirmar. Volver a login y comprobar
   estado real, sin reenviar cambios ni obtener tokens desde consultas públicas.
4. Probar recuperación de un uso y desactivar/revincular con contraseña más factor.
   No resetear una cuenta únicamente con datos públicos ni con una sesión abierta.
5. Probar teclado, lector de pantalla y foco, rotación y app autenticadora en teléfono
   real. La versión 1.1.2 existente no incorpora la pantalla 2FA: hace falta un cliente
   de pruebas compatible aprobado, sin sobrescribir esas APK.

Antes de cualquier publicación: imponer bloqueo externo de downgrade, revisar
código/007/custodia, completar la identidad y gobernanza de recuperación, ensayar
rotación con todas las instancias reales y, si se usan réplicas, implementar su
revocación distribuida. Mantener cerradas las altas hasta disponer de esos controles
y clientes compatibles. Ninguna de estas tareas autoriza un despliegue ahora.

Referencias: [OWASP MFA](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
y [almacenamiento criptográfico](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html).
