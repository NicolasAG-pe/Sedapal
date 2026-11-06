# CI-01 — auditoría previa a publicación

Fecha: 2026-11-05. Árbol inicial limpio, HEAD `6399d44`, rama `chore/adopcion-sdd-rpi`, origin `https://github.com/NicolasAG-pe/Sedapal.git`. Siete commits locales sobre `origin/main=d3d27d068a53dff8e536d690e615f858722157bb`. Consulta GitHub de main coincide con esa revisión. No fetch, push, PR ni cambios remotos.

**Dictamen: publicación NO habilitada.** CI-01 conserva 5/6 tareas; ningún run de GitHub acreditado. E = lectura estática; P = comprobación ejecutada; N = destino no comprobado. La auditoría incompleta no prueba ausencia de automatizaciones.

## Controles observados y pendientes

| Sistema | Evidencia comprobada | Pendiente antes de publicar |
|---|---|---|
| GitHub Actions (E/P local) | Un workflow local, Node22, ubuntu-24.04, safe→integration; PR hacia main, push chore/feature/fix/integration, manual; contents:read, acciones por SHA, checkout sin credenciales persistidas | Settings Actions: política de acciones, disponibilidad runner, permisos efectivos, artifacts y límites; workflows/reglas organizativas y apps/webhooks que reaccionen a push/checks |
| Dependencias/BD (E) | npm ci Backend desde lock, sin lifecycle scripts; PG18 nuevo con tmpfs, fixtures sintéticos y puerto loopback dinámico; runner limpia entorno y verifica destino | Descarga efectiva de acciones/npm/imagen, interpolación de puerto, health, ejecución, reportes y retirada del service en GitHub |
| Vercel local (E) | Ambos vercel.json excluyen varias ramas y main; NO incluyen chore/adopcion-sdd-rpi | Añadir exclusión exacta en ambos archivos en avance autorizado; verificar raíces reales y reglas efectivas |
| Vercel remoto (lectura) | Conector repoUrl devuelve proyectos hidro-mehora-admin y sedapal; get_project devuelve framework express y nodeVersion24.x para ambos | La proyección no expone rootDirectory, enlace Git ni hooks. Discrepancia con framework:null estático local: verificar Dashboard, no inferir configuración activa. Node24 del proyecto remoto no sustituye Node22 del workflow |
| Render (N) | Sin render.yaml versionado; informes anteriores no demuestran ajustes actuales | get_selected_workspace y list_services sin workspace devolvieron INVALID_ARGUMENT; list_workspaces permite descubrir contexto pero no se seleccionó ni modificó. Verificar servicios vinculados, rama, autoDeployTrigger, previews/Blueprints y hooks/API |
| Otros mecanismos (N) | El workflow local no llama proveedores ni usa secrets, OIDC, environments, correo live o Neon | Inventario completo de GitHub Apps, webhooks, integrations y automatizaciones externas con acceso de propietario; no se consultaron valores de secretos |

La consulta de workflows remotos mediante el conector GitHub no admite ese endpoint. Acceso al repositorio no acredita acceso a settings, webhooks ni inventario completo de integraciones. Los dos proyectos Vercel descubiertos tampoco prueban que no existan conexiones en otras cuentas/equipos.

## Exclusión específica propuesta — NO aplicada

En **vercel.json y Backend/vercel.json**, añadir únicamente dentro de `git.deploymentEnabled`:

```json
"chore/adopcion-sdd-rpi": false
```

Parche JSON Patch equivalente para cada archivo:

```json
[{"op":"add","path":"/git/deploymentEnabled/chore~1adopcion-sdd-rpi","value":false}]
```

Conservar main y todas las otras entradas. La simulación en memoria debe demostrar que ninguna otra clave cambia. Según la [referencia oficial de Vercel](https://vercel.com/docs/project-configuration/git-configuration), las ramas no especificadas permiten despliegue por defecto y una regla true coincidente prevalece; revisar también patrones efectivos. Esta exclusión se refiere al disparador Git, no certifica bloqueo de hooks/CLI/API ni de otros proyectos/raíces.

En Render, comprobar que ningún servicio siga esta rama y que no se creen previews para ella. Auto-deploy y previews son mecanismos separados: [deploys](https://render.com/docs/deploys), [preview environments](https://render.com/docs/preview-environments) y [Blueprint](https://render.com/docs/blueprint-spec). No hay aquí evidencia de una exclusión nativa por rama equivalente a Vercel. Si la configuración actual exige apagar globalmente un servicio o cambiar reglas de otras ramas, detenerse y pedir autorización específica; no alterar main ni servicios de compañeros. Un mensaje skip no sustituye un inventario completo de disparadores.

## Colaboración

PR abierto [#26](https://github.com/NicolasAG-pe/Sedapal/pull/26), rama fix/sonarqube-integral: solo se consultaron metadatos y nombres de archivos. Coinciden con el diff acumulado de esta rama `CHANGELOG.md`, `Frontend/Dockerfile` y `Frontend/Dockerfile.dockerignore`. Hay riesgo de solapamiento, no conflicto de merge demostrado. No se examinó ni modificó su análisis. Coordinar integración futura, conservar ambas correcciones, regenerar inventario tras cambios en tests y revalidar contratos. No merge/rebase realizado.

## Procedimiento futuro con puertas de autorización

1. Obtener evidencia saneada y fechada de **todos** los servicios conectados: cuenta/proyecto/raíz/rama, auto-deploy/previews, hooks presentes (sin URL/token) y apps/webhooks. Confirmar mecanismos que reaccionan a push, PR y checks. Si el inventario queda incompleto, NO publicar.
2. Autorizar y aplicar el parche local específico de Vercel; demostrar preservación de main/otras ramas y confirmar raíces/configuración efectiva de ambos proyectos. Resolver cualquier mecanismo Render/externo con exclusión de esta rama; cambios remotos requieren permiso explícito separado.
3. Revisar estado remoto nuevamente y solapamientos, diff completo de los commits salientes, secretos y exclusiones; comprobar catálogo y checker CI. No ejecutar migraciones, envíos reales ni incorporar credenciales de proveedores. Revisar también settings Actions sin revelar secretos.
4. Solo con todas las puertas satisfechas y autorización expresa para el SHA final: primer push normal de chore/adopcion-sdd-rpi a origin, **sin PR, merge ni despliegue**. Su evento push debe ser la primera vía prevista de CI. No usar force.
5. Observar Actions y proveedores tras el push: verificar ausencia de builds/previews/deploys, no solo éxito del job. Si aparece un efecto externo inesperado, detener nuevas publicaciones y comunicarlo; no revertir servicios automáticamente.
6. Registrar URL/run ID/SHA, Node22 real, resultados safe/integration, recursos PG18, permisos y artifacts saneados. Un fallo remoto mantiene CI-TASK-006 pendiente. Solo marcarla tras ambos jobs correctos y evidencias revisadas.

`workflow_dispatch` necesita el archivo en la rama por defecto según [GitHub](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow?tool=webui). No se presupone que esté disponible para el primer push de una rama que aún no se ha integrado en main. No mergear para habilitarlo en este avance.

Solicitud futura sugerida: «Autorizo completar los controles pendientes y aplicar únicamente las exclusiones de despliegue de chore/adopcion-sdd-rpi. Solo cuando todos los servicios estén comprobados, autorizo publicar el SHA revisado mediante push normal y verificar GitHub Actions y ausencia de despliegues; sin PR, merge ni publicación de aplicaciones». Si no se pueden preservar otras ramas, solicitar una autorización distinta antes de cambiar settings.

## Seguimiento acelerado — 2026-11-05, entrada 7b2c773

Autorización vigente: ajustes locales mínimos, commits independientes; sin publicación ni cambios remotos. Aplicada exclusión exacta de chore/adopcion-sdd-rpi en ambos vercel.json. Validación JSON antes/después: al retirar esa única entrada nueva, los objetos son idénticos; main y otras ramas conservados. La propuesta anterior queda como antecedente.

Consultas nuevas en lectura: PR26 abierto, head 34b5ca901208e07d6f440022bb9eeceb37557e55 y base d3d27d0; 18 archivos. Intersección con nuestra rama: CHANGELOG.md, Frontend/Dockerfile y Frontend/Dockerfile.dockerignore; sin merge/rebase ni modificación del PR. El incremento de catálogo no modifica sus archivos de prueba, pero su integración futura exige regenerar inventario.

Vercel get_git_deployment_context/get_project confirma proyectos hidro-mehora-admin y sedapal vinculados al repo, Node24 remoto; respuesta sin raíces, hooks ni reglas efectivas. La exclusión local no acredita un bloqueo completo del proveedor. Render list_workspaces descubre un workspace; get_selected_workspace devuelve INVALID_ARGUMENT, sin workspace seleccionado. La skill render-monitor/references/render-access.md exige identificación por el usuario antes de consultar servicios; no se infiere ni cambia contexto. Auto-deploy, previews y hooks siguen N. Apps/webhooks y políticas Actions siguen pendientes de acceso adecuado. No se consultaron secretos.

CI-TASK-006 permanece pendiente: no push, run remoto ni cierre de CI-01. No pedir permisos entre tareas locales; resolver contexto Render/configuración remota y autorización de publicación en un avance futuro.
