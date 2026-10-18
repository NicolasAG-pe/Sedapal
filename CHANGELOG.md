# Historial de versiones

Este archivo registra cambios publicados y comprobados. Para futuras versiones, añadir una entrada nueva arriba con su fecha y cambios relevantes, sin repetir los manuales.

## En desarrollo — verificación de correo

### 18 de octubre de 2026 — OTP vigente cinco minutos

- Vigencia del OTP reducida de 600 a 300 segundos; textos del correo y del cliente
  actualizados a cinco minutos, junto con las pruebas y documentación afectadas.
- Validación: `npm run test:email` y `git diff --check`.

### 18 de octubre de 2026 — impedir previews automáticas

- La auditoría remota detectó que la integración Vercel existente creaba previews
  automáticamente al hacer push, pese a que no se ejecutaron comandos de despliegue.
  En `a7ebcae`, la preview Admin terminó y la del proyecto `sedapal` falló por
  buscar `Backend/scripts/build-web.js` desde una raíz de proyecto incompatible.
- Despliegues Git deshabilitados para `feature/verificacion-correo` en la raíz
  y en `Backend/vercel.json`; regla persistente para revisar automatizaciones
  antes del primer push de futuras ramas. No se reintenta el build de la preview.
- Configuración JSON y diff revisados; auditoría final registrada en el PR.

### 18 de octubre de 2026 — cliente web/Android y validación completa

- Pantalla de verificación con entrada OTP, errores accesibles, reenvío con
  cuenta regresiva y protección contra doble envío. Confirmar retorna al login.
- Recuperación temporal del registro tras recargar con `sessionStorage`, sin
  guardar contraseñas ni códigos; limpieza al confirmar, reiniciar o iniciar sesión.
- Harness de cliente/admin adaptado al nuevo contrato, con proveedor simulado
  exclusivamente en pruebas y bases sintéticas nuevas por ejecución.
- Chromium: 25 comprobaciones aprobadas; sin errores JavaScript ni recursos
  fallidos. Pantalla OTP validada a 360, 390, 412, 768 y 1366 píxeles, incluyendo
  accesibilidad de campos y controles sin desbordamiento horizontal.
- Runtimes web y Android generados y verificados sin código administrativo ni
  secretos del servidor; pruebas de configuración, OTP/Resend y firma aprobadas.
- Configuración, límites, compatibilidad con APK previa y pasos pendientes de
  autorización documentados. Sin merge ni cambios en Neon; previews automáticas
  detectadas posteriormente y registradas en la entrada de auditoría.

### 18 de octubre de 2026 — API de registro y confirmación

- Registro devuelve una solicitud pendiente (202); solo la confirmación válida
  crea usuario y suministro juntos (201). No se emite JWT antes de confirmar.
- Rutas de confirmación y reenvío; vencimiento, intentos persistentes, límites por
  IP/correo/suministro y bloqueos PostgreSQL para solicitudes concurrentes.
- Reenvío invalida el código anterior sin reiniciar intentos; consumo único y
  limpieza del hash de contraseña pendiente tras confirmar o sustituir solicitud.
- Fallos de envío revierten la transacción. Configuración ausente devuelve 503,
  sin permitir registros sin verificación. Cuentas previas conservan su acceso.
- API HTTP real probada con Resend simulado y PostgreSQL nuevo: caducidad,
  concurrencia, reintentos de código, límites, conflictos, login y bloqueo admin.
  Pruebas unitarias y regresión de configuración aprobadas.

### 18 de octubre de 2026 — proveedor Resend

- Adaptador HTTPS de Resend con correo de verificación en texto y HTML accesible,
  timeout de 10 segundos por intento y un reintento para fallos transitorios.
- Cuerpo y clave de idempotencia conservados durante el reintento; errores
  permanentes sin reintento y mensajes sin datos sensibles del proveedor.
- Variables privadas exclusivamente en el backend; ejemplos vacíos y paso de
  configuración en Docker Compose. No se envían correos reales en las pruebas.
- Pruebas simuladas de envío, idempotencia, configuración, cuota, red y timeout.

### 18 de octubre de 2026 — esquema y códigos OTP

- Esquema inicial y migración aditiva `003_verificacion_correo.sql` para registros
  pendientes, historial de envíos y fecha de verificación. Sin ejecución en Neon.
- Códigos criptográficos de seis dígitos, HMAC SHA-256 ligado a la solicitud,
  comparación de tiempo constante y rechazo de formatos o secretos inválidos.
- Política: vigencia de 10 minutos, 5 intentos, 60 segundos entre envíos y hasta
  3 envíos por hora. El registro pendiente vence en una hora.
- Pruebas unitarias de generación, aislamiento por solicitud/secreto y entradas
  inválidas; regresión de configuración. Pruebas PostgreSQL en bases nuevas:
  migración repetible, conservación de cuenta previa y restricciones del esquema.

### 18 de octubre de 2026 — flujo de revisión

- Reglas persistentes de Git, seguridad y revisión incremental en `AGENTS.md`.
- Plan de verificación de correo con Resend y decisiones de seguridad documentados
  en `docs/verificacion-correo.md`.
- Validación: estado inicial limpio, rama existente comprobada y pruebas de
  configuración ejecutadas antes del commit. Sin cambios en producción.

## v1.0.0

Publicada el 8 de octubre de 2026. Referencia: [Release v1.0.0](https://github.com/NicolasAG-pe/Sedapal/releases/tag/v1.0.0), commit `135cb54173ee60e2f528738805564773e3c32e8b`.

- Primera APK release firmada permanentemente, versión Android `1.0.0`, `versionCode 2`.
- Aplicación Android exclusiva para clientes, con recibos, consumo, registros de pago, PDF, incidencias y atención.
- Panel administrativo independiente publicado en Vercel.
- Backend Node.js/Express publicado en Render y PostgreSQL de producción en Neon.
- API REST compartida con 41 rutas, incluidas 19 administrativas.
- Actualización en tiempo real mediante Socket.IO, con polling y WebSocket.
- Autenticación JWT, cuentas activas y autorización por roles `usuario`/`admin`.
- Distribución directa de la APK mediante GitHub Releases; sin publicación en Google Play.

La instalación y los flujos principales de la APK release fueron validados en un teléfono físico por el propietario. La infraestructura local Docker permanece independiente de producción.
