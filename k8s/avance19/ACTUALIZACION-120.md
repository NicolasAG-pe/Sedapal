# Actualización local de Hidro-Mejora 1.2.0

Base oficial de la aplicación: `6894b3e3fde8c6600a87816ad8675c0446b676d5` (main, PR24). Este perfil reutiliza exclusivamente el clúster existente `hidro-avance19` y conserva su PVC. No modifica Compose, LAB ni plataformas productivas.

`Dockerfile.120` reutiliza las bases locales ya instaladas. Antes de construir hay que cotejar `Backend/package.json` y `package-lock.json` con la base de backend; si difieren, este atajo no es válido. No instala dependencias ni descarga imágenes. Las bases carecen de variables de credenciales. El cliente incluye los siete módulos compartidos de la versión oficial, incluidos recuperación y seguimiento.

La conexión privada usa una copia0600 del kubeconfig local, con endpoint loopback y verificaciónTLS, en el estado ignorado de este worktree. No modifica el kubeconfig global. El controlador comprueba la identidad del contenedor y del PVC, reutiliza recursos y nunca crea un clúster ni aplica migraciones.

`local-120.patch.json` cierra registro/correo, recuperación, inscripción2FA, Yape y entregaFCM reales; fuerza PostgreSQL interno por `db:5432`, sin DATABASE_URL externo. Las interfaces y operaciones demostrativas permanecen disponibles. Los secretos locales existentes no se regeneran ni se sustituyen por secretos productivos.

Antes de actualizar el esquema: detener escritores del namespace, respaldo local privado, SHA-256, listado del archivo y restauración en un PostgreSQL aislado sin red usando la imagen18 ya disponible. Ensayar007,008,011,012,013,014 y comprobar filas/columnas originales, fotografías/documentos y secuencias; después aplicar solo esa ruta sobre hm_avance19. No aplicar009/010 ni init.sql a la base existente. Ante cualquier diferencia, no ejecutar la migración sobre el PVC original.

Control desde el worktree persistente validado:

```bash
bash k8s/avance19/control-120.sh status
bash k8s/avance19/control-120.sh stop
bash k8s/avance19/control-120.sh start
```

`stop` cierra web/Admin/API, hace checkpoint de PostgreSQL, detiene su Deployment y finalmente el contenedor del nodo, conservando PVC, datos, Secretos e imágenes. `start` comprueba recursos, arranca solo ese contenedor existente, espera la API y recupera db/backend/web/admin. No reconstruye imágenes ni reaplica el overlay histórico. No detener Docker global ni ejecutar down/prune/delete.

La guía histórica de avance19 sigue disponible para instalaciones anteriores. Para la candidata1.2.0 utilizar este controlador y el estado de su worktree; el start.sh histórico puede seleccionar imágenes antiguas.

Actualización ejecutada y comprobada el 29/10/2026. Los cuatro deployments están
1/1 y el apagado/encendido conservó los hashes de las 26 tablas y diez secuencias.
Ver [informe y evidencias](../../docs/pruebas/kubernetes-local-120.md).

Imágenes instaladas, con `imagePullPolicy: Never`:

| Deployment | Imagen local |
| --- | --- |
| web | `hidro-avance19-web:1.2.0-6894b3e` |
| admin | `hidro-avance19-admin:1.2.0-6894b3e` |
| backend | `hidro-avance19-backend:1.2.0-6894b3e` |
| db | `postgres:18` existente, PostgreSQL18.6 |

Cliente: <http://localhost:8084>. Admin: <http://localhost:8085>.
API por los mismos proxies: `/api/health`; PostgreSQL permanece interno.
Usar las cuentas locales existentes; el estado privado conserva los fixtures sin
publicar sus contraseñas. Este perfil web no habilita recepción FCM nativa.

Desde cualquier directorio de esta laptop:

```bash
bash /home/nico/.local/share/hidromejora/k8s-120/worktree/k8s/avance19/control-120.sh status
bash /home/nico/.local/share/hidromejora/k8s-120/worktree/k8s/avance19/control-120.sh stop
bash /home/nico/.local/share/hidromejora/k8s-120/worktree/k8s/avance19/control-120.sh start
```

No se reaplicó el overlay completo ni su ConfigMap de inicialización: se
actualizaron únicamente las imágenes y la política cerrada del backend en los
deployments existentes. Las migraciones ya están aplicadas; encender no las repite.
Conservar este worktree y su estado privado. No reemplazar el kubeconfig global ni
usar `kind create/delete`, `docker compose down`, `prune` o eliminación del PVC.

Pruebas dirigidas reproducibles (crean registros **sintéticos adicionales** y
necesitan el clúster encendido):

```bash
# Reutilizar las herramientas ya instaladas; no ejecutar npm ci ni descargar navegadores.
NODE_PATH=/home/nico/.local/share/hidromejora/release-120/worktree/Backend/node_modules \
  node k8s/avance19/verify-120.cjs
HIDRO_PLAYWRIGHT_MODULE=/home/nico/Escritorio/Uni/Cursos/Software/Sedapal/artifacts/vercel-validation/tools/node_modules/playwright \
PLAYWRIGHT_BROWSERS_PATH=/home/nico/Escritorio/Uni/Cursos/Software/Sedapal/artifacts/vercel-validation/browsers \
  node k8s/avance19/browser-120.cjs
```

Si se necesita recuperar datos, conservar el estado actual y examinar primero la
restauración aislada que quedó detenida. No restaurar encima del PVC ni volver al
backend anterior automáticamente. El respaldo privado y sus hashes están
identificados en el informe; ninguna contraseña ni archivo de respaldo está en Git.
