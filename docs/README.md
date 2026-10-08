# Índice oficial de documentación

Documentación en español de Hidro-Mejora **v1.0.0**, contrastada con el código del tag. Los informes anteriores tienen su fecha y alcance propios.

## Visión general y producto

- [Portada del repositorio](../README.md).
- [Historial de versiones](../CHANGELOG.md).
- [Arquitectura y estructura](ARCHITECTURE.md).
- [Uso del cliente y Admin, PDF y limitaciones](MEJORA-PROFESIONAL.md).

## Desarrollo

- [Instalación y desarrollo local](LOCAL-DEVELOPMENT.md).
- [API REST y contrato Socket.IO](API.md).
- [Esquema y migraciones PostgreSQL](DATABASE.md).

## Infraestructura

- [Producción: Vercel, Render, Neon y distribución APK](DEPLOYMENT.md).

## Android

- [Entorno Android, Capacitor y desarrollo debug](ANDROID.md).
- [Firma permanente, build release, verificación y futuras actualizaciones](ANDROID-RELEASE.md).

## Seguridad

- [Autenticación, autorización, secretos y limitaciones](SECURITY.md).

## Pruebas

- [Automatización, integración, pruebas físicas y evidencia histórica](TESTING.md).

## Mantenimiento

- [Respaldo, restauración controlada, limpieza y diagnóstico](MAINTENANCE.md).

## Antecedentes históricos y académicos

- [Informe de limpieza del 7 de octubre de 2026](LIMPIEZA-SEDAPAL.md).
- [Alternativa VPS histórica](DEPLOY-VPS-HISTORICO.md).
- [Modelo Java académico](../Backend/documentacion/java-docs/README.md), independiente del backend Node y del proyecto Android.

Cada documento mantiene un tema principal. Los contratos REST y eventos se definen en API; las reglas de firma y publicación Android, en ANDROID-RELEASE. Los demás documentos enlazan a esas referencias.
