# Plan — CI-01

Constitution Check: TEST-01 cerrado; alcance .github/workflows y documentación/herramienta local de validación. Sin producción, secretos ni publicación: conforme antes/después del diseño.

Un workflow, jobs safe e integration (needs:safe), Ubuntu24.04 GitHub-hosted. Node22, npm ci --prefix Backend --ignore-scripts --no-audit --no-fund. Checkout seguro con tags para contrato Android; integración no requiere historia completa. Sin caché adicional ni instalación de herramientas Android/navegador. PR tomain y push chore/feature/fix/integration; concurrencia cancela ejecuciones anteriores de la misma ref. Sin filtros paths que dejen checks requeridos pendientes por cambios solo documentales.

PG18 service con tmpfs, healthcheck y puerto aleatorio en127.0.0.1. Variables solo sintéticas; runner de TEST-01 valida rol/base/version y limpia entorno antes de ejecutar tests. Artifacts solo JUnit/run.json; nunca fixtures de firma o coverage cruda. Timeout10min por job y retención7días.

Comprobar YAML mediante parser existente y validaciones semánticas locales (permisos/eventos/SHA/comandos/rutas/service). No sustituye actionlint, políticas o motor de GitHub. No repetir suites sin cambios: TEST-01 acredita npm test e integración y npm ci. Verificar de nuevo selección/inventario después de añadir el workflow. Registrar remoto pendiente y commit local independiente. No hay cambios Render/Vercel ni permiso de push; automatizaciones externas deben revisarse antes de futura publicación.
