# Revisión documental de main — 2026-11-11

## Fuente y alcance

- `git ls-remote origin refs/heads/main` y GitHub confirmaron `4f15173693e1620197c5ab6f13be9c04b904f686`, merge del PR #30. Rama de trabajo: `docs/alinear-main`, en worktree aislado; conservado el cambio previo de `compose.yaml` en la copia original.
- Lectura de fuentes versionadas: manifiestos de versiones, Compose, ambas configuraciones Vercel, workflow y ejecutor local de migraciones. Sin ejecución de servicios ni acceso a datos reales.
- GitHub confirma [run 43121800154](https://github.com/NicolasAG-pe/Sedapal/actions/runs/43121800154), SHA `3484fe533c2c8378445b9432dd8cbd5a951f4262`, con ambos jobs aprobados. Consulta por `branch=main`: cero runs. No se atribuye el run al SHA del merge.

## Comprobaciones locales

- Enlaces relativos de los Markdown modificados: destinos existentes.
- `git diff --check`: aprobado.
- `python3 scripts/data-dictionary.py --check`: cinco artefactos reproducibles y vigentes.
- `python3 scripts/test-data-dictionary.py`: 9/9 aprobadas.
- Comparación estructural JSON: al retirar únicamente `docs/alinear-main: false`, ambas configuraciones Vercel son idénticas a la base; se conservan las exclusiones de main y verificación de correo.
- No se ejecutaron suites Node ni integración SQL para este cambio documental. El entorno local informa Node 20.19.2; el workflow requiere Node 22. Los resultados remotos anteriores tienen su SHA propio.

## Publicación pendiente

- Workflow versionado sin pasos de despliegue; Draft PR hacia main activa CI.
- Vercel confirma dos proyectos vinculados: `hidro-mehora-admin` y `sedapal`. Ambos archivos versionados excluyen esta rama; el conector no expone raíces ni hooks efectivos.
- Render responde sin workspace seleccionado; pendiente confirmación del espacio para consultar servicios y previews. No se cambió configuración remota.
- No se ha realizado push ni abierto PR en esta revisión. La comprobación posterior de ausencia de nuevos despliegues queda pendiente del control previo y de la publicación.
