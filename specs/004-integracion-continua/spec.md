# Feature Specification — CI-01

Branch: chore/adopcion-sdd-rpi |2026-11-05| Estado: implementado y validado localmente; ejecución remota pendiente, ver validation.md.
Constitución: [única](../../.specify/memory/constitution.md).

US1(P1): colaborador recibe validación de PR/desarrollo sin publicar producto.
- AC-CI-01: YAML parseable, rutas válidas y acciones oficiales fijadas por SHA; Node22 y npm ci por lockfile Backend sin scripts de instalación.
- AC-CI-02: job seguro ejecuta catálogo y npm test con contratos PKG-01; job dependiente ejecuta integración DB-01 con PostgreSQL18 nuevo, tmpfs y healthcheck.
US2(P1): propietario conserva aislamiento, permisos mínimos y credenciales privadas.
- AC-CI-03: solo contents:read, checkout sin credenciales persistidas, sin secretos/OIDC/environments/publish/deploy; PR normal, no pull_request_target/workflow_run, no runners propios.
- AC-CI-04: PG solo fixture nuevo; sin Neon, montajes host, proveedores reales ni Android. Artefactos solo JUnit/metadatos; no archivos privados/V8/fixtures. Sin configuración de despliegue modificada.
US3(P2): equipo distingue validación local y estado remoto.
- AC-CI-05: comandos llamados comprobados, validación local documentada con límites y estado remoto pendiente; no afirmar CI verde sin run real.

FR-CI-001:eventos PR/main y push en desarrollo. FR-CI-002:dos jobs dependientes. FR-CI-003:reproducibilidad mediante lock y Node22. NFR-CI-001:sin nueva dependencia del producto ni cambio funcional. NFR-CI-002:compatibilidad con colaboradores sin alterar sus ramas o protección de main. Cierre de implementación local no equivale a aceptación de ejecución remota; esa tarea permanece pendiente hasta autorización de publicación.
