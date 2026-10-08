# Hidro-Mejora

Hidro-Mejora es un proyecto universitario de gestión y consulta de servicios de agua. Centraliza recibos, consumo, registros de pago, incidencias, cortes y atención, con una aplicación Android para clientes y un panel web independiente para administradores.

Su objetivo es facilitar el seguimiento del suministro y la comunicación entre el cliente y el administrador. No es un sistema oficial de SEDAPAL ni una pasarela bancaria.

## Versión y acceso

Versión distribuida: **v1.0.0**, Android 6.0 o superior.

- [Panel administrativo](https://hidro-mehora-admin.vercel.app).
- [API pública / estado del servicio](https://hidro-mejora-api.onrender.com/api/health).
- [GitHub Release v1.0.0](https://github.com/NicolasAG-pe/Sedapal/releases/tag/v1.0.0).
- [Descargar APK firmada](https://github.com/NicolasAG-pe/Sedapal/releases/download/v1.0.0/hidro-mejora-v1.0.0-release.apk).
- [Historial de versiones](CHANGELOG.md) y [firma, checksum y actualizaciones](docs/ANDROID-RELEASE.md).

## Funcionalidades

- Cliente: registro e inicio de sesión, dashboard, recibos/consumo, copias PDF, pagos y constancias, incidencias con fotografía/ubicación, cortes, atención, notificaciones, perfil, contraseña, tutorial e HidroBot.
- Admin: resumen, usuarios, ubicación del suministro desde el detalle del usuario, recibos, pagos, incidencias/fotografías, cortes, atención y cuenta administrativa.
- API compartida: autenticación JWT, roles `usuario`/`admin`, aislamiento por suministro y avisos Socket.IO.

Los pagos registran operaciones del prototipo sin cargos bancarios. Los PDF son referenciales. HidroBot utiliza reglas locales; las notificaciones no son push. Más detalles en la [guía del producto](docs/MEJORA-PROFESIONAL.md).

## Arquitectura y tecnologías

Producción: **Android → Render → Neon** y **Admin Vercel → Render → Neon**. El frontend de cliente se empaqueta en Android y no se publica como web de usuarios.

Desarrollo: dos clientes Nginx en Docker → backend compartido → PostgreSQL local. La base local y Neon son independientes, sin sincronización automática.

HTML, CSS y JavaScript sin framework; Node 22, Express 5, Socket.IO 4, PostgreSQL 18, jsPDF, Capacitor 7, Java 21 y Docker Compose. Consulta [arquitectura](docs/ARCHITECTURE.md) y [despliegue](docs/DEPLOYMENT.md).

## Estructura

```text
Sedapal/
├── Frontend/         # Cliente y fuente Android
├── Admin/            # Panel administrativo HTML/CSS/JS
├── Backend/          # API, tiempo real y pruebas
├── Shared/           # Utilidades, iconos y estilos
├── Base-de-Datos/    # init.sql y migraciones
├── android/          # Proyecto nativo Capacitor
├── scripts/          # Build, respaldo y verificaciones
├── artifacts/        # Salidas locales ignoradas
├── backups/          # Respaldos privados ignorados
├── docs/             # Documentación técnica
├── compose.yaml
├── capacitor.config.js
├── vercel.json
├── package.json
└── package-lock.json
```

## Inicio rápido local

Requisitos mínimos: Git, Docker Engine y Docker Compose v2. Node 22/npm para herramientas y pruebas; Java 21/Android SDK solamente para compilar Android.

En un clon nuevo, crea la configuración local a partir del ejemplo y completa las variables privadas antes de levantar servicios. En una instalación existente, conserva su `.env`.

```bash
cp -n .env.example .env
docker compose up -d
docker compose ps
curl --fail http://localhost:8080/api/health
```

- Cliente de desarrollo: <http://localhost:8080>.
- Admin de desarrollo: <http://localhost:8081>.
- Parada segura: `docker compose stop`.
- Dependencias para herramientas: `npm ci` y `npm ci --prefix Backend`.

**No elimines el volumen PostgreSQL ni ejecutes `docker compose down -v`.** Una base nueva se inicializa con el esquema, sin cargar automáticamente cuentas ni respaldos. Las instrucciones completas están en [desarrollo local](docs/LOCAL-DEVELOPMENT.md).

## Documentación

El [índice oficial](docs/README.md) organiza la documentación por lector. Referencias principales:

- [API REST y Socket.IO](docs/API.md), [base de datos](docs/DATABASE.md) y [seguridad](docs/SECURITY.md).
- [Android](docs/ANDROID.md) y [release permanente](docs/ANDROID-RELEASE.md).
- [Pruebas](docs/TESTING.md) y [mantenimiento](docs/MAINTENANCE.md).

Los antecedentes VPS, de limpieza y del modelo Java académico están identificados como históricos; no sustituyen las guías vigentes.
