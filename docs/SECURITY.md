# Seguridad y límites actuales

Controles comprobados en [server.js](../Backend/server.js), [config.js](../Backend/config.js), clientes y configuración Android de **v1.0.0**. No representa una certificación ni una auditoría de penetración.

## Identidad y autorización

- Contraseñas: scrypt de Node, salt aleatorio de 16 bytes y derivación de 64 bytes; comparación con `timingSafeEqual`. No existe fallback a contraseña en texto claro.
- JWT firmado con `AUTH_TOKEN_SECRET`, expiración de ocho horas. El backend acepta Bearer para REST; no autentica con el rol enviado desde HTML o sessionStorage.
- `requiereAuth` verifica firma/expiración y consulta PostgreSQL en cada petición para reconstruir id, suministro, rol y estado activo. Una cuenta ausente o inactiva recibe 403; un token ausente/inválido/expirado recibe 401.
- `requiereAdmin` exige rol actual `admin`. Un `usuario` recibe 403 en las 19 rutas administrativas. Registro no permite elegir rol ni crea administradores.
- Las rutas `/api/me/*` y las escrituras de cliente usan el suministro autenticado; no aceptan otro número en el cuerpo como autoridad. Las rutas heredadas por número comprueban propiedad o acceso admin.
- Foto de cliente exige propiedad y devuelve 404 si no está disponible/permitida. Admin utiliza su ruta protegida independiente.
- Consultas parametrizadas para valores; filtros dinámicos agregan fragmentos controlados y placeholders, no SQL arbitrario del cliente.

El cliente rechaza login admin y el panel rechaza login usuario. Son barreras de experiencia; la autorización efectiva permanece en el servidor, incluso si se manipulan URLs o almacenamiento.

## Sesión en los clientes

JWT permanece en memoria y se refleja en sessionStorage. No hay restauración automática de una sesión anterior al cargar la aplicación. Login administrativo confirma acceso a resumen antes de renderizar módulos.

Logout/expiración limpian listas, fotos, formularios y datos renderizados, cancelan peticiones pendientes y desconectan sockets. La generación de sesión evita aplicar respuestas tardías. Shared trata 401 y 403 como fin de sesión; por ello un 401 por contraseña actual incorrecta también puede cerrar el cliente.

**Limitaciones:** logout no revoca centralmente el JWT y no existe endpoint de revocación. El cambio de contraseña tampoco invalida todos los tokens existentes. La verificación de cuenta activa protege REST y la desactivación administrativa desconecta sockets conocidos, pero no debe confundirse con un registro general de revocaciones.

## CORS, TLS y cabeceras

`CORS_ALLOWED_ORIGINS` define orígenes HTTP(S) exactos, separados por comas, sin ruta ni comodín. En desarrollo se añaden orígenes locales; en producción se utilizan solo los explícitos. Solicitudes sin Origin son admitidas por la función de origen; CORS no impide clientes HTTP externos ni sustituye JWT/roles.

REST no devuelve autorización CORS a un origen ajeno; eso no significa que siempre responda HTTP 403. Socket.IO usa además `allowRequest` para validar Origin en polling y upgrade WebSocket.

Producción cliente/API usa HTTPS; PostgreSQL externo se configura con TLS `verify-full`. No se desactiva la verificación de certificados. `https://localhost` es el origen virtual Capacitor y no una API local de producción.

Helmet configura cabeceras en el backend y se desactiva X-Powered-By. **Content Security Policy está desactivada**; no afirmar que Helmet protege el HTML estático servido por Vercel/Nginx ni que existe CSP estricta. Express confía en un salto proxy (`trust proxy: 1`) para calcular IP; revisar ese supuesto si cambia la cadena de proxies.

## Límites de solicitudes y archivos

| Ámbito | Límite configurado en v1.0.0 |
|---|---|
| Login | 20 intentos fallidos por IP en 15 minutos; los exitosos no consumen el contador. |
| Registro | 10 solicitudes por IP en 15 minutos. |
| Cambio de contraseña | 10 solicitudes por IP en 15 minutos. |
| POST pagos, incidencias y atención | Limitador compartido de 60 solicitudes por IP en 15 minutos. |

Los limitadores devuelven 429 y usan memoria del proceso. No hay un limitador global que cubra todas las rutas administrativas. Reiniciar el proceso no conserva esos contadores.

JSON: hasta 3 MB; fotografía: hasta 2 MB, JPG/PNG/WebP, comprobación MIME y firma binaria inicial. No existe antivirus ni validación integral de imagen. El puente PDF Android limita tamaño/nombre/tipo a documentos PDF; no recibe rutas arbitrarias.

## Socket.IO

JWT obligatorio en `auth.token`; verificación de cuenta/rol activo en PostgreSQL durante handshake. Las salas son asignadas por el servidor y el cliente no tiene una operación join libre. Desactivación envía `sesion:invalidada` y desconecta salas de cuenta/suministro.

Los avisos contienen identificadores y estados mínimos; los detalles se obtienen por REST autenticado. Contrato completo: [API](API.md).

Límites: salas en memoria, una sola instancia, sin Redis ni replay persistente. El JWT se comprueba al conectar/reconectar; no hay una tarea que desconecte automáticamente cada socket al llegar su expiración ni una consulta periódica de rol para cada mensaje. No se acepta una nueva arquitectura distribuida implícitamente.

## PostgreSQL y secretos

Compose no publica PostgreSQL ni backend al host; Nginx publica las dos interfaces. Neon dispone de un endpoint administrado con autenticación/TLS: no afirmar que ese host pertenece a una red privada Docker. Solo el backend recibe las credenciales de conexión; ningún runtime web/Android debe incluirlas.

Los ejemplos describen nombres de variables. Los `.env` reales, keystores, APK, dumps y backups están ignorados. No adjuntar logs o respaldos sin revisar su contenido: algunos errores de servidor registran detalles, por lo que no se garantiza redacción universal automática.

La clave release permanente permanece fuera del repositorio. Solo el fingerprint del certificado es público; conservar la misma identidad para futuras actualizaciones. Instrucciones únicas en [ANDROID-RELEASE](ANDROID-RELEASE.md).

## Alcance funcional

Los pagos y PDF son académicos/referenciales; no integran una entidad bancaria ni sistemas oficiales de suministro. No hay recuperación automática de contraseñas, push, autenticación multifactor o mecanismo automático de actualización APK. Estas limitaciones no se solucionan documentándolas como capacidades presentes.

Antes de publicar cambios, revisar el diff por secretos y ejecutar las pruebas de roles/sesiones pertinentes. Guías: [TESTING](TESTING.md) y [MAINTENANCE](MAINTENANCE.md).
