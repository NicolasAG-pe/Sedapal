# Hidro-Mejora 1.2.0

Proyecto universitario de gestión de servicios de agua: cliente web de desarrollo/Android y panel administrativo independiente sobre una API compartida. No es un sistema oficial de SEDAPAL ni una pasarela bancaria.

## Estado del código y del trabajo

Android declara **1.2.0 / versionCode 6**; los manifiestos npm raíz y Backend conservan **1.0.0**. Esa diferencia no se corrige modificando versiones en este avance documental. El [historial](CHANGELOG.md) y las [reglas Android](docs/ANDROID-RELEASE.md) distinguen candidatos y releases históricas; no se afirma una nueva APK publicada ni un despliegue actual validado.

PLAN-01, PKG-01, DB-01 y TEST-01 completados localmente. CI-01 implementado, 5/6 tareas: ejecución en GitHub pendiente. DOC-01 documenta el árbol de esta rama; base histórica `d3d27d0`, referencia de entrada `6399d44`. [Especificaciones y evidencia](specs/README.md).

## Funcionalidades y arquitectura

- Cliente: cuenta, recibos/consumo, documentos referenciales, operaciones de pago, incidencias con seguimiento, cortes, atención, perfil e HidroBot local.
- Admin: gestión de usuarios/suministros, recibos, pagos, incidencias, cortes y atención, con permisos administrativos.
- Backend Node22/Express5, PostgreSQL18 y Socket.IO; frontend HTML/CSS/JavaScript y Shared; Android Capacitor7/Java21.
- OTP/outbox, 2FA, recuperación de clave y push están implementados con configuración y habilitación específicas. Su presencia en código no significa que estén activos en Docker o producción. Los pagos demostrativos no realizan cargos bancarios.

Docker: cliente Nginx y Admin Nginx → Backend interno → PostgreSQL local. Android empaqueta el cliente; Admin tiene una ruta de build independiente. Render/Vercel/Neon son destinos documentados, cuyo estado efectivo no se certifica desde el código. [Arquitectura](docs/ARCHITECTURE.md), [seguridad](docs/SECURITY.md) y [prepublicación](specs/004-integracion-continua/prepublication.md).

## Desarrollo local y pruebas

Consulta [desarrollo local](docs/LOCAL-DEVELOPMENT.md) antes de iniciar Docker: las dos copias del repositorio pueden compartir nombre Compose, puertos y volúmenes. Usa identidad y configuración nuevas para un laboratorio aislado; conserva la instalación original. `init.sql` es perfil laboratorio, no una receta de producción.

Para las suites seguras, con Node22 y sin cargar variables productivas:

```bash
npm ci --prefix Backend --ignore-scripts --no-audit --no-fund
npm run test:inventory
npm test
```

`npm run test:unit`, `npm run test:contract`, `npm run test:coverage` y `npm test -- --report` usan selección explícita. Integración PostgreSQL y E2E requieren recursos aislados y opt-in: [comandos y límites](docs/TESTING.md). Los scripts históricos no heredan automáticamente los controles nuevos.

## Organización

`Frontend/`, `Admin/` y `Shared/` contienen clientes/recursos; `Backend/` API, workers y pruebas; `Base-de-Datos/` esquema y migraciones; `android/` proyecto nativo; `scripts/` builds y validación. `artifacts/` son salidas locales ignoradas. La constitución única está en `.specify/memory/constitution.md` y el ciclo SDD + RPI en `specs/`.

[Índice técnico](docs/README.md), [API](docs/API.md), [PostgreSQL](docs/DATABASE.md), [Android](docs/ANDROID.md), [SDD + RPI](docs/SDD-RPI.md) y [CI](docs/CI.md). No publicar esta rama hasta completar la auditoría de automatizaciones; no se hizo push, PR ni despliegue en DOC-01.

Diccionario de datos DD-01: [metadatos completos](docs/base-de-datos/diccionario-de-datos.md), [DER Mermaid](docs/base-de-datos/diagrama-entidad-relacion.md), [perfiles](docs/base-de-datos/perfiles-esquema.md) y [Excel](docs/base-de-datos/diccionario-de-datos.xlsx). Generación estática verificable desde SQL versionado; sin validación nueva contra PostgreSQL.
