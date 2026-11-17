# Hidro-Mejora 1.2.0

Hidro-Mejora es un proyecto académico independiente de la Universidad Norbert Wiener orientado a la gestión de servicios de agua. Busca facilitar la consulta de información y la atención de operaciones e incidencias mediante una aplicación para usuarios y un panel administrativo. No tiene vínculo oficial con SEDAPAL ni es una pasarela bancaria.

## Funcionalidades principales

- Usuarios: cuenta y perfil, recibos y consumo, documentos referenciales, operaciones de pago, incidencias con seguimiento, cortes, atención e HidroBot local.
- Administración: gestión de usuarios y suministros, recibos, pagos, incidencias, cortes y atención, con permisos administrativos.

La disponibilidad y las pruebas de cada capacidad dependen del entorno y la configuración. Consulta [pruebas](docs/TESTING.md) y las [evidencias históricas](docs/README.md#referencias-especializadas-e-históricas).

## Componentes

- **Aplicación Android para usuarios:** empaqueta el cliente y permite acceder a las funciones de usuario.
- **Panel administrativo web:** interfaz independiente para la gestión administrativa.
- **Backend/API y PostgreSQL:** API compartida, servicios de dominio y almacenamiento de datos.

La presentación de feria se centra en Android y el panel administrativo web. El cliente web del repositorio se utiliza para desarrollo y pruebas.

## Arquitectura y tecnologías

Android utiliza Capacitor 7 y Java 21; las interfaces usan HTML, CSS y JavaScript. El backend utiliza Node.js 22, Express 5 y Socket.IO, con PostgreSQL 18. Docker Compose proporciona un entorno local con cliente web, Admin, API y base de datos en redes separadas.

Consulta [arquitectura](docs/ARCHITECTURE.md), [versiones de herramientas](docs/VERSIONES.md) y [seguridad](docs/SECURITY.md).

## Estructura del repositorio

| Carpeta | Contenido |
|---|---|
| `Frontend/` | Cliente web y recursos de la aplicación de usuario. |
| `Admin/` | Panel administrativo web. |
| `Backend/` | API, servicios, workers y pruebas. |
| `Shared/` | Recursos y módulos compartidos por las interfaces. |
| `Base-de-Datos/` | Esquema, migraciones y perfiles de datos. |
| `android/` | Proyecto nativo Android. |
| `scripts/` | Herramientas de compilación, mantenimiento y pruebas. |
| `docs/` | Guías técnicas y evidencias. |
| `specs/` | Especificaciones y trazabilidad SDD. |

## Instalación y ejecución

Para un laboratorio nuevo, consulta primero [desarrollo local](docs/LOCAL-DEVELOPMENT.md): describe requisitos, configuración, puertos y arranque aislado. No reutilices credenciales ni volúmenes de una instalación existente; `init.sql` corresponde a un perfil de laboratorio, no a producción. Para compilar Android, consulta la [guía Android](docs/ANDROID.md).

## Pruebas y documentación técnica

Para las suites seguras, con Node 22 y sin cargar variables productivas:

```bash
npm ci --prefix Backend --ignore-scripts --no-audit --no-fund
npm run test:inventory
npm test
```

La integración PostgreSQL y las pruebas E2E requieren recursos aislados y activación expresa: [comandos y límites](docs/TESTING.md). Los scripts históricos no heredan automáticamente los controles nuevos.

[Índice técnico](docs/README.md) · [API](docs/API.md) · [PostgreSQL y diccionario](docs/DATABASE.md) · [CI](docs/CI.md) · [Especificaciones e informes históricos](specs/README.md) · [Reglas de trabajo](AGENTS.md)

## Estado actual y limitaciones

- Android declara **1.2.0 / versionCode 6**; los manifiestos npm raíz y Backend declaran **1.0.0**. Consulta el [historial](CHANGELOG.md) y las [reglas de release Android](docs/ANDROID-RELEASE.md).
- Los pagos son demostrativos y no realizan cargos bancarios.
- OTP/outbox, 2FA, recuperación de clave y push requieren configuración y habilitación específicas; su presencia en el código no implica que estén activos en Docker o producción.
- La documentación no certifica una nueva APK publicada ni el estado actual de los despliegues en Render, Vercel o Neon.
- La [ejecución CI documentada](https://github.com/NicolasAG-pe/Sedapal/actions/runs/43121800154) corresponde al commit integrado indicado en [CI](docs/CI.md); no valida por sí sola producción.
