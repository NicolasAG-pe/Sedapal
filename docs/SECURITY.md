# Seguridad y límites del código actual

Revisión documental de1.2.0, entrada6399d44. Esta guía no certifica configuración productiva ni sustituye una auditoría. Los informes históricos conservan su alcance.

La API valida JWT, cuenta activa y permisos usuario/admin; el suministro se contrasta con la sesión. [Backend/server.js](../Backend/server.js) y contratos de dominio son las fuentes de comportamiento. Las transacciones de recibos conservan locks, rollback y rechazo de dependencias obligatorias: [DB-01](../specs/002-compatibilidad-recibos/spec.md).

2FA/TOTP, OTP/outbox, recuperación de clave y push existen en código con flags, esquema y proveedores específicos. No afirmar que están ausentes ni que están habilitados en cada destino. [2FA](seguridad-despliegue-2fa.md), [correo](verificacion-correo.md), [outbox](correo-outbox.md), [recuperación](../Backend/password-recovery.js) y [push](android-push-firebase.md). No ejecutar workers ni envíos reales como validación documental.

Android utiliza un plugin de sesión basado en Keystore/AES-GCM; el JWT se conserva en memoria web y la restauración requiere validación de sesión. [Android](ANDROID.md). Esa protección no elimina los riesgos de inyección del cliente ni demuestra seguridad de cada uso del DOM.

No versionar `.env` privados, API keys, JWT, credenciales de proveedores, keystores, respaldos ni datos personales. Configuración pública de origen API no debe incluir secretos. Los artefactos cliente/Admin se generan separadamente; los recursos de recuperación/2FA son código público, no credenciales.

La suite segura y CI usan selección explícita, entorno limpio y datos sintéticos. El guard de red es defensa adicional, no sandbox. Los comandos históricos/live requieren revisión individual; [pruebas](TESTING.md). CI contents:read y checkout sin credenciales persistidas reducen privilegios; npm ci sin scripts no elimina toda la confianza en dependencias.

No publicar la rama hasta comprobar todas las automatizaciones externas y exclusiones de despliegue. [Auditoría de prepublicación](../specs/004-integracion-continua/prepublication.md). No se revisaron valores de secretos ni se conectó a bases reales. El análisis de calidad de otro compañero queda fuera de DOC-01.
