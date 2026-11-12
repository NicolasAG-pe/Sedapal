# Integración continua: estado y operación

Referencia: `main` en `4f15173`, comprobada el 2026-11-11. La [ejecución 43121800154](https://github.com/NicolasAG-pe/Sedapal/actions/runs/43121800154), correspondiente a `3484fe5` de `correcciones` integrado mediante el PR #30, terminó con éxito en sus dos jobs: **Unitarias y contratos (Node 22)** e **Integración sintética (PostgreSQL 18)**. No se encontró un run con `head_branch=main` en la consulta de esta revisión; la evidencia corresponde al commit de la rama integrada.

El [workflow](../.github/workflows/ci.yml) usa Node 22 en ubuntu-24.04. `safe` instala Backend mediante `npm ci` desde lockfile, comprueba el catálogo y ejecuta `npm test -- --report`. `integration` depende de `safe` y crea PostgreSQL 18 temporal. No instala herramientas Android. Acciones fijadas por SHA, timeout de 10 minutos por job y concurrencia por referencia.

Eventos: PR hacia `main` (incluidos Draft abiertos y sincronizados), push a `chore/**`, `feature/**`, `fix/**` e `integration/**`, y `workflow_dispatch`. Una rama `docs/**` se verifica al abrir o actualizar su PR; su push no coincide con esos patrones. Permisos `contents: read`, checkout sin credenciales persistidas, sin pasos de despliegue. PostgreSQL usa fixtures sintéticos, tmpfs y puerto loopback dinámico. Solo se publican JUnit/run.json con retención de siete días.

El checker local `node scripts/check-ci.cjs --self-test` requiere un parser YAML disponible; no sustituye Actions. [Comandos y límites de pruebas](TESTING.md).

Antes de publicar una rama o un Draft PR, comprobar las automatizaciones externas y excluir la rama en ambos archivos Vercel cuando corresponda. El workflow no despliega, pero proveedores conectados pueden reaccionar al mismo evento. Seguir [AGENTS.md](../AGENTS.md) y [despliegue](DEPLOYMENT.md); no hacer merge ni desplegar sin autorización explícita.

Los informes [CI-01](../specs/004-integracion-continua/validation.md), [auditoría de prepublicación](../specs/004-integracion-continua/prepublication.md) y [cierre SDD](pruebas/cierre-sdd-120.md) conservan el estado histórico de sus sesiones. Sus pendientes no describen por sí solos el estado remoto actual ni se cierran retroactivamente con un run de otro SHA.
