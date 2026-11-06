# Research — CI-01

2026-11-05. Prerrequisito satisfecho: TEST-01 cerrado en6c4c2a4. Sin workflow previo en checkout. Consulta git ls-remote de solo lectura: main remoto permanece d3d27d0, rama chore/adopcion-sdd-rpi aún no publicada. No fetch/merge ni cambios en referencias locales; no se revisa ni modifica trabajo de compañeros en otras ramas. Los63 scripts previos se conservan. Catálogo detectará pruebas añadidas/cambiadas por colaboradores y exigirá actualizar su clasificación antes de un verde nuevo.

Fuentes oficiales consultadas:

- [Checkout](https://github.com/actions/checkout): checkout por evento, historial completo necesario para contrato Android v1.0.0; persist-credentials=false evita credenciales Git persistentes.
- [Setup Node](https://github.com/actions/setup-node): Node22 explícito y package-manager-cache=false; el runtime interno de la acción es independiente del Node del proyecto.
- [PostgreSQL en Actions](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers): servicio nuevo por job Ubuntu, puertos publicados al host y healthcheck; se configura PG18 con tmpfs.
- [Sintaxis y permisos](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax): eventos PR/push, contents:read y concurrencia por ref; sin evento privilegiado ni despliegues.
- [Upload artifacts](https://github.com/actions/upload-artifact): limitar rutas a JUnit/run.json, sin fixtures, V8 crudo ni archivos ocultos.

Se verificaron refs/tags/v7 con git ls-remote oficial, sin clonar: checkout3d3c42e5aac5ba805825da76410c181273ba90b1; setup-node949feb2413d6458794dcd2491c4babbbce0c15c1; upload-artifactcf430e030ddbb5b0abf93d22962f4752f3646cd9. SHA inmutable en YAML, no referencia móvil. Acciones v7 necesitan runner GitHub-hosted actualizado; no se eligen runners propios ni acceso a infraestructura local.

No existen dependencias funcionales YAML nuevas: parser yaml2.3.4 ya instalado en el host sirve para comprobación local. Actionlint/act no disponibles, no se instalan. No se afirma validación del motor de expresiones GitHub ni ejecución remota. npm ci Backend ya se verificó offline con lockfile; root contiene herramientas Capacitor no necesarias para estas suites, por eso no se instala CLI Android en CI.

Ambos vercel.json conservan su configuración; la rama actual no tiene bloqueo explícito. Sin autorización para cambiar Vercel ni publicar: un push futuro debe revisar/bloquear previews y otras automatizaciones antes de ejecutarse, según AGENTS.md. Un workflow sin deploy no garantiza que conectores externos no desplieguen; esa condición bloquea publicación, no esta implementación local.

La disponibilidad de job.services se revisó en la [tabla de contextos](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts): el puerto dinámico se configura en steps.env, no en job.env. Se incluyó regresión negativa en el checker.
