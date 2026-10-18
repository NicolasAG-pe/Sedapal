# Historial de versiones

Este archivo registra cambios publicados y comprobados. Para futuras versiones, añadir una entrada nueva arriba con su fecha y cambios relevantes, sin repetir los manuales.

## En desarrollo — verificación de correo

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
