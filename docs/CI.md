# Integración continua: estado y operación

[CI-01](../specs/004-integracion-continua/spec.md) está implementado y validado localmente:5/6 tareas. **No hay ejecución exitosa de GitHub Actions acreditada**. [Evidencia local](../specs/004-integracion-continua/validation.md).

El [workflow](../.github/workflows/ci.yml) usa Node22 en ubuntu-24.04: safe instala Backend con npm ci desde lock, comprueba catálogo y ejecuta npm test con reportes; integration depende de safe y crea PostgreSQL18 temporal para regresiones DB-01. No instala herramientas Android ni dependencias raíz innecesarias. Acciones oficiales por SHA; timeout10min por job y concurrencia por ref.

Eventos: PR hacia main (incluye Draft abierto/synchronize), push a chore/**, feature/**, fix/** e integration/**, y workflow_dispatch. Permisos contents:read, checkout sin credenciales persistidas; sin secrets, OIDC ni deploy. Service usa fixtures sintéticos, tmpfs y puerto loopback dinámico entregado al paso de integración. Solo sube JUnit/run.json con retención7días, no el árbol completo de artifacts.

El checker local `node scripts/check-ci.cjs --self-test` necesita un parser yaml ya disponible; no es el motor de Actions ni sustituye la ejecución remota. No se añadió esa dependencia al producto. [Pruebas y límites](TESTING.md).

La primera publicación sigue bloqueada por auditoría incompleta de Vercel/Render/apps/hooks y falta de exclusión exacta de esta rama en ambos vercel.json. Revisar [prepublication.md](../specs/004-integracion-continua/prepublication.md), que contiene evidencia, propuesta de parche **no aplicada**, puertas de autorización y procedimiento futuro. No iniciar push/PR desde esta guía.

Después de autorización y controles satisfechos, el evento push de la rama es la vía prevista para el primer run. workflow_dispatch requiere archivo presente en rama por defecto: [GitHub oficial](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow?tool=webui). No mergear para sortear este prerrequisito. Registrar run/SHA/resultados y comprobar ausencia de despliegues externos antes de cerrar CI-TASK-006.

Consolidación final: [estado y procedimiento restante](pruebas/cierre-sdd-120.md). CI-01 sigue pendiente de run remoto; entorno Node22/PG18 y automatizaciones efectivas aún bloquean publicación.
