# Avance 20 — publicación de la rama integrada

Fecha: 22 de octubre de 2026. Rama: `integration/avance-18`.
Base conservada: `d23f44f06d36d366da9fea314db953ab26be0166` (avance 19),
con `ae4eda0` (avance 18) y ambos historiales originales como ancestros.
No se fusiona esta rama en main ni se crea un Pull Request.

## Comprobación previa a publicación

El árbol estaba limpio antes de preparar las exclusiones y la guía. La auditoría
anterior revisó los seis commits locales pendientes y sus árboles: 309 blobs
únicos, 279 de texto, sin APK, bases, keystores, archivos .env privados o artifacts
versionados. Las coincidencias de credenciales eran fixtures sintéticos.
La revisión del nuevo diff no añade secretos, datos de usuario ni artefactos.

GitHub no devuelve workflows Actions ni webhooks de repositorio. El único PR
abierto es el Draft #1 de `feature/verificacion-correo`, que no se modifica.
Se guarda una instantánea local ignorada de las referencias para contrastar
que el push afecte exclusivamente a la rama integrada.

## Vercel — sin modificar servicios

El contexto Git del conector confirma dos proyectos vinculados a
`NicolasAG-pe/Sedapal`: `hidro-mehora-admin` y `sedapal`.
La vista de proyecto no expone `rootDirectory`; se inspeccionaron los logs de
sus últimos builds Git, del commit `049ca5f` en main:

| Proyecto | Evidencia de raíz en último build | Estado previo |
| --- | --- | --- |
| hidro-mehora-admin | Genera el runtime en `/vercel/path0/artifacts/web/admin` | READY |
| sedapal | Busca `/vercel/path0/Backend/scripts/build-web.js` | ERROR |

La evidencia sitúa las ejecuciones en raíz y `Backend`, respectivamente; no
equivale a una lectura directa del ajuste `rootDirectory` del panel. El error
histórico de `sedapal` no se corrige ni provoca un build como parte de esta tarea.

Ambos archivos, `vercel.json` y `Backend/vercel.json`, contienen ahora:

```json
{
  "git": {
    "deploymentEnabled": {
      "feature/verificacion-correo": false,
      "integration/avance-18": false
    }
  }
}
```

Se comprobaron sintaxis y estructura mediante Node: retirando únicamente la
nueva entrada, cada JSON es idéntico al del commit base. Se conservan los demás
campos y el comportamiento de main/otras ramas. La regla impide el despliegue
Git de esta rama, no los despliegues manuales ni los de otros proveedores.
[Referencia de Vercel](https://vercel.com/docs/project-configuration/git-configuration).
Antes de publicar, la consulta de despliegues de esta rama devuelve cero.

## Render — consulta autorizada de solo lectura

Workspace confirmado por el propietario: `wDeco's workspace`.
Se consultaron lista de servicios incluyendo previews, detalle e historial de
despliegues. El único servicio devuelto es `hidro-mejora-api`, del mismo repositorio:

| Ajuste | Valor observado |
| --- | --- |
| branch | main |
| rootDir | Backend |
| autoDeploy | no |
| autoDeployTrigger | off |
| previews.generation | off |
| pullRequestPreviewsEnabled | no |
| Último despliegue | `864e0e1818ac9a61dd8305411deb63b5b944bfe2`, trigger API, 8 de octubre |

Publicar una rama distinta no actualiza main; además, ambos mecanismos
automáticos de este servicio están apagados. No se consultaron variables
secretas ni se cambiaron servicios, configuraciones o datos.
[Autodespliegue Render](https://render.com/docs/deploys) y
[vistas previas](https://render.com/docs/service-previews).

## Verificación y alcance

- JSON/exclusiones de rama y comparación exacta con base: aprobados.
- `git diff --check`: aprobado antes del commit.
- Sintaxis Bash de env/start/kube: aprobada; scripts sin cambios.
- Guía revisada con clon independiente, imágenes, PostgreSQL y verificación
  básica: `k8s/avance19/README.md`. No requiere archivos privados de otra laptop.
- No se repiten pruebas funcionales, builds Docker ni Android: el código y los
  manifiestos Kubernetes quedan idénticos al avance 19; solo cambia su README.
- No se ejecuta kubectl/kind, migraciones, envío de correo, despliegues ni borrados.

La publicación autorizada se limita a un push normal de `integration/avance-18`.
Después se contrasta HEAD con la referencia remota, las otras ramas con la
instantánea previa y los despliegues GitHub/Vercel/Render con el estado anterior.
El SHA resultante y las comprobaciones posteriores se entregan en el cierre;
este documento no anticipa que un push o una prueba aún no ejecutados hayan pasado.
