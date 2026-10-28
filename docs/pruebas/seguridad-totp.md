# 2FA opcional mediante TOTP — preparación y pruebas

Este informe conserva la validación inicial de `0fc2af4`. El desarrollo posterior,
incluidos Admin, custodia de claves y correcciones, está en la
[auditoría actual](auditoria-2fa-seguridad.md). No representa una versión publicada.

24 de octubre de 2026. Rama `feature/seguridad-totp`, creada desde el último
`origin/main`, `d6a6b83057f179168d54d3691e5738ff2d060740`. Como main todavía no
incluía el PR #11, se reutilizó su incremento probado por cherry-pick (`afac774`)
para conservar la sesión automática después del OTP. Sin merge a main.

## Comportamiento y arquitectura

Perfil → **Seguridad de la cuenta → Verificación en dos pasos**. Para activar se
reintroduce la contraseña actual; el servidor genera un secreto aleatorio de
160 bits y muestra un QR `otpauth://`. La activación solo se confirma con un TOTP
válido dentro de cinco minutos de esa reautenticación. QR generado localmente
en el servidor, sin servicios externos ni claves en URL de terceros.

Se usa OTPAuth 9.5.2 y QRCode 1.5.4, fijados en el lockfile del backend. TOTP:
SHA-1, seis dígitos, período 30 s, ventana ±1 paso para desfase de reloj. El último
paso consumido se guarda bajo bloqueo de fila: ni otro desafío ni una petición
concurrente pueden reutilizarlo. La confirmación de activación también lo consume;
debe esperarse al siguiente código para usar TOTP otra vez.

`TOTP_ENCRYPTION_KEY`: clave independiente de 32 bytes base64, exclusivamente en
el servidor. Secreto activo y de vinculación cifrados con AES-256-GCM, IV aleatorio
de 12 bytes, tag de 16 y AAD por usuario. La clave no se genera automáticamente,
no se deriva del JWT y no se almacena en PostgreSQL. Ausencia de clave, etiqueta
alterada o formato de cifrado no canónico fallan cerrados. Es indispensable
respaldar esta clave separadamente de la base; reemplazarla sin recifrado perdería
el acceso a los secretos. No se proporciona rotación automática en esta entrega.

El QR contiene necesariamente el material de vinculación y solo se entrega al
cliente autenticado durante el alta del factor, en una respuesta `no-store`.
Permanece transitoriamente en el DOM y se retira al confirmar, cerrar, vencer o
salir de sesión; no se guarda en archivos, Preferences, Keystore ni WebStorage.
El autenticador externo sí debe conservar su propia copia para generar códigos.
No se afirma que el secreto jamás transite por la memoria de la pantalla Android.
Para escanear desde el mismo teléfono puede abrirse la configuración en otro
dispositivo. No se añadió exportación de la clave ni importación por enlace.

Después de confirmar se muestran **10 códigos de recuperación**, cada uno con
128 bits aleatorios. El servidor guarda únicamente SHA-256 con dominio e ID de
usuario, nunca valores reversibles. La comparación y consumo son transaccionales;
se entregan una sola vez. Regenerarlos invalida los anteriores. Una respuesta
perdida no permite consultarlos otra vez: se usa el autenticador para ingresar y
generar otros. Cerrar sesión/controles retira su representación del cliente.

## Login, límites y prevención de bypass

- Usuario sin 2FA: contrato existente 200 y JWT de ocho horas. Los JWT anteriores
  sin claims MFA siguen sirviendo si la cuenta nunca cambió su versión 2FA.
- Usuario con 2FA: contraseña correcta devuelve 202, `estado=segundo_factor`,
  desafío opaco aleatorio de 256 bits y caducidad de cinco minutos, **sin JWT**.
  Solo se guarda SHA-256 del desafío en PostgreSQL, ligado a usuario, versión y
  huella del hash de contraseña. No se guarda la contraseña para completar login.
- Segundo factor: `/api/auth/2fa/login` consume TOTP o recuperación y desafío;
  emite JWT completo después del COMMIT. Cambio de contraseña, versión, baja,
  vencimiento, consumo previo o intentos agotados rechazan el desafío.
- Cinco fallos acumulados por cuenta bloquean operaciones 2FA 15 minutos. Además:
  máximo cinco intentos por desafío, diez desafíos pendientes por cuenta y límites
  por IP en operaciones 2FA. Generar otros desafíos no borra los fallos.
- `requiereAuth` y Socket.IO comprueban versión MFA y métodos autenticados. Ni un
  desafío, ni un JWT solo de contraseña para una cuenta con 2FA, ni un JWT con
  propósito distinto de acceso autorizan rutas privadas. No basta ocultar pantallas.
- Activar, regenerar recuperación y desactivar incrementan la versión, invalidan
  JWT anteriores y desconectan sockets de esa cuenta. La operación devuelve una
  sesión nueva a través del almacenamiento seguro ya existente.
- Cambiar/desactivar exige contraseña verificada **en esa petición** y factor
  existente (TOTP o recuperación). No se confía en la edad del JWT como prueba de
  autenticación reciente. Para reemplazar el autenticador se desactiva con ambos
  factores y se vuelve a configurar uno nuevo. No hay ruta de bypass administrativo.

Rutas nuevas: `GET /api/auth/2fa`; POST `setup`, `confirm`, `disable`, `recovery`,
`login` bajo `/api/auth/2fa/`. Todas las respuestas llevan `Cache-Control: no-store`.
Errores públicos genéricos: sin códigos, claves, JWT ni detalles SQL en logs.
Un error de contraseña/código en la gestión se muestra sin cerrar la sesión.

## Migración y compatibilidad

`Base-de-Datos/migrations/007_usuario_2fa.sql`: tres tablas nuevas
(`usuario_2fa`, `usuario_2fa_recuperacion`, `desafios_2fa`) e índices. Transacción,
timeouts, creación idempotente, sin UPDATE de usuarios, DROP, DELETE, TRUNCATE ni
reinicialización. `init.sql` contiene también estas tablas para instalaciones nuevas.
Solo se probó en bases sintéticas PostgreSQL 18; no se consultó ni modificó Neon.
La repetición se probó contra el esquema esperado, no como reparador de cualquier
esquema parcialmente alterado: una instalación incompatible requiere revisión.

La migración 007 es prerrequisito del backend nuevo. Sin sus tablas la
autenticación falla cerrada; el arranque **no ejecuta migraciones**. La clave y
`TOTP_ENROLLMENT_ENABLED=1` permiten nuevas activaciones. El valor predeterminado
es `0`; cerrarlo después no deshabilita ni omite factores ya configurados.

Registro OTP, correo, outbox y sesión automática de 1.1.2 se conservan. Las APK
anteriores conservan login para cuentas sin 2FA; una cuenta que lo active necesita
un cliente compatible para completar el nuevo segundo paso. Admin no incorpora
una pantalla 2FA en esta entrega: sus cuentas existentes sin factor conservan el
acceso. Promover una cuenta con factor a otro rol requiere revisar el flujo del
cliente administrativo; no se elimina el factor automáticamente para facilitarlo.

## Pruebas ejecutadas

Todos los destinatarios y datos fueron sintéticos; proveedor de correo simulado,
PostgreSQL nuevo en red Docker interna y tmpfs, sin Neon ni correos reales.

| Verificación | Resultado real |
| --- | --- |
| Node 22.23.4: `two-factor`, `otp-auto-session`, `android-session`, `email-contract`, `email-outbox-api`, configuración | 45 tests aprobados, incluidos casos anidados. Activación, QR, contraseña reciente, RFC 6238, códigos incorrectos/vencidos, reutilización, concurrencia, recuperación, bloqueo agregado, límites, aislamiento entre cuentas, sockets, revocación, clave ausente/cifrado alterado y cierre de nuevas activaciones. |
| Chromium + API/SQL: transición Android y regresión de sesión/registro/documentos/HidroBot/importes | 44 tests aprobados. Incluyen perfil/QR, activación, login escalonado, contraseña incorrecta en gestión, recuperación y desactivación; clientes v1.0.0/v1.1.1 y sesión automática tras OTP. |
| Chromium focalizado tras limpieza final del estado de interfaz | 1 prueba 2FA completa aprobada; las otras 16 se omitieron expresamente por filtro de nombre. |
| API de recibos, pagos y Admin, y restricciones (Node 22) | 21 tests aprobados; 1 omitido por la opción histórica `HIDRO_RECEIPT_TEST_LEGACY`, no declarado aprobado. |
| Esquema/retención tras ajustar fixtures | 10 tests aprobados: integridad 005 y retención de correo con las nuevas tablas. |
| Runtime público/identidad Android | 8 tests aprobados en Node 20.19.2 del host; runtime cliente sin Admin, API pública HTTPS, misma identidad. |
| Dockerfile real | Imagen local `hidro-totp:candidate` construida. API 200 en health/capabilities; 401 sin JWT; 403 para JWT sintético de usuario inexistente tras consultar PostgreSQL. Conexión/esquema 007 verificados. Worker, correo y nuevas activaciones apagados en ese contenedor. |
| Dependencias | `npm audit --prefix Backend --omit=dev`: cero vulnerabilidades. `body-parser` 2.3.0 → 2.4.0 elimina el aviso alto detectado al instalar las dependencias TOTP/QR. |

**Android nativo**, AVD `hm_110_debug_api35`, Android 15/API 35, APK debug
experimental en salida Gradle independiente. Un test instrumentado confirma
Keystore/GCM y cinco comprobaciones del flujo 2FA aprueban:

1. QR/activación y recuperación, sin secreto ni códigos en WebStorage; JWT cifrado.
2. Contraseña sola: desafío temporal, sin credencial nativa ni dashboard.
3. Código incorrecto rechazado; recuperación válida permite entrar.
4. Force-stop restaura sesión completa validada por API y un único Socket.IO.
5. Desactivación con contraseña/factor, logout y reapertura sin credencial.

No se afirma prueba física ni escaneo con un autenticador de un teléfono real.
La interoperabilidad se comprueba con URI estándar, librería TOTP y vector RFC;
el harness obtiene el código desde el servidor **sintético**, no desde Android.
No se construyó ni sobrescribió una release 1.1.2. Su SHA-256 sigue siendo
`a6b81541a210e79ffb6ec8a38c79b8b1260758ab45c246b81fca45ee4439ed93`.

Evidencia privada ignorada: `artifacts/totp-security/` y salidas
`artifacts/android-session-native-*`. No se publican QR, códigos, claves ni tokens.
Los primeros fallos detectaron una referencia incorrecta al cierre Socket.IO,
un formato de cifrado no canónico que debía rechazarse y fixtures que solo
admitían letras en nombres de tablas. Se corrigieron y se repitieron las pruebas
afectadas. Los validadores siguen restringidos a identificadores SQL seguros,
ahora con dígitos después del primer carácter. El helper histórico del avance 23
se ajustó igual y se verificó su sintaxis; no se rehízo su laboratorio antiguo.

## Propuesta para publicación posterior

**1.2.0 / versionCode 6**, con la misma firma y applicationId. No se cambia aún
el versionado ni la APK 1.1.2. Requiere revisión de seguridad y aprobación separada:

1. Respaldar/restaurar datos y la nueva clave de cifrado por un procedimiento
   autorizado; verificar precondiciones y aplicar solo 007 en la base confirmada.
2. Desplegar backend compatible con nuevas activaciones cerradas (`0`), sin mezclar
   instancias antiguas y nuevas. Registro OTP y worker conservan sus propias políticas.
3. Distribuir un cliente compatible, probar escaneo real, recuperación, reloj del
   teléfono, reinicio/logout y Admin; después autorizar las nuevas activaciones.
4. No volver a un backend antiguo que ignore 2FA: sería un bypass de contraseña.
   Recuperar mediante código compatible y conservar estado/clave/códigos usados;
   restaurar una base anterior también podría perder factores y consumos recientes.

Pendientes adicionales: procedimiento de recuperación si se pierden autenticador
y todos los códigos, rotación ensayada de clave, política de retención de desafíos
vencidos/hashes usados, notificaciones de cambios y soporte 2FA administrativo si
se amplía a ese rol. No se añaden envíos ni un bypass como sustituto de esas tareas.
TOTP no es resistente al phishing; esta entrega no implementa passkeys/WebAuthn.

Base de diseño: [OWASP MFA](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html),
[OTPAuth](https://github.com/hectorm/otpauth) y [QRCode](https://github.com/soldair/node-qrcode).
Vercel queda excluido para esta rama en ambas raíces y Render se consultó solo
en lectura, con autodespliegue/previews desactivados. Sin despliegues ni merge.
