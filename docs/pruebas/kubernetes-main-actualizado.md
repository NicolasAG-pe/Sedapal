# Kubernetes local desde main — 24 de octubre de 2026

Origen: `https://github.com/NicolasAG-pe/Sedapal`, commit `d6a6b83`.
Trabajo en `feature/k8s-local-actualizado`, checkout independiente en
`.local/k8s-actualizado/`. Se conserva el checkout original, incluyendo el
commit local `35410d8`. No se borraron archivos, bases ni volúmenes.

Se construyeron desde cero las imágenes `hidro-avance18-{web,admin,backend}:local`
con los tres Dockerfiles actuales. Los nombres históricos son los requeridos
por el overlay existente; las fuentes corresponden al main actualizado.
Se ejecutó `k8s/avance19/start.sh` con herramientas privadas de la PC.
El importador alternativo ya existente resolvió el índice multiarch incompleto
de PostgreSQL. Dry-run del servidor y apply correctos; cuatro Deployments Ready,
PVC `db-data` Bound, namespace y clúster exclusivos `hidro-avance19`.

Acceso local: cliente http://localhost:8084 y Admin http://localhost:8085.
Las credenciales sintéticas permanecen en el archivo privado
`artifacts/kubernetes-avance-19/state/accounts.json` del checkout independiente.
No se publican cuentas, JWT ni kubeconfig.

Pruebas comprobadas:

- `test:config`: 13/13; con NODE_PATH a las dependencias backend existentes.
- `test:documents`: 4/4; fuera del sandbox para permitir pdftotext/pdfinfo.
- `test:ui`: 1/1.
- `k8s/avance19/verify.cjs`: login, sesión, SQL real, DNS, ambos proxies, CORS,
  registro cerrado, aislamiento entre cuentas, recibos/pagos/incidencias,
  protección 401/403 de 19 rutas administrativas y Socket.IO autenticado.
- `k8s/avance19/browser.cjs`: Chromium real, siete módulos Admin, rechazo de
  usuario normal, chatbot, evento de recibo, pago por UI, navegación y logout.
- `k8s/avance19/persistence.cjs`: Pod DB nuevo, mismo PVC, login y datos
  conservados, backend recuperado sin cambiar Pod ni contador de reinicios.
- `bash -n k8s/avance19/env.sh` y `git diff --check`.

Los fallos iniciales de configuración fueron dependencias ausentes en el nuevo
checkout; los de documentos fueron permisos del sandbox. Ambos se resolvieron
al ejecutar con dependencias existentes y permisos adecuados, sin cambiar la app.
Reportes privados en `artifacts/kubernetes-avance-19/state/`: verification.json,
browser.json y persistence.json, además de capturas. No se versionan.

No se acredita producción, entrega de correo real ni restauración de backups.
Registro OTP permanece cerrado; no se accedió a Neon ni se modificaron Render,
Vercel o Android. El clúster queda activo para revisión y conserva sus datos.
El push y Draft PR quedan pendientes de confirmar el workspace Render y revisar
sus automatizaciones conforme a AGENTS.md. Las exclusiones Vercel de la nueva
rama están preparadas en ambas raíces.

## Repetición en la PC — 28 de octubre de 2026

Objetivo: comprobar que la guía se puede reutilizar y detectar lo que necesita
otro compañero antes de publicar. Mismo worktree, rama
`feature/k8s-local-actualizado`, commit base `d6a6b83` más los ajustes locales
documentados. No se reconstruyeron imágenes ni se borraron clústeres, PVC,
volúmenes o bases.

Hallazgo de entorno: el nodo `hidro-avance19-control-plane` estaba detenido
(`Exited 137`) y la PC tiene 3.7 GiB de RAM. Al arrancarlo solo, sin Compose, los
cuatro Pods quedaron `1/1 Running`; hubo errores transitorios y reinicios mientras
Docker/Kubernetes recuperaban el sandbox. `start.sh` reutilizó la configuración
sin reiniciar Pods ni regenerar Secretos.

Pruebas aprobadas en esta repetición:

- `k8s/avance19/start.sh`: herramientas privadas vía `HIDRO_KIND_BIN` y
  `HIDRO_KUBECTL_BIN`, dry-run de servidor, apply idempotente y cuatro
  Deployments Ready; PVC `db-data` Bound.
- `k8s/avance19/verify.cjs`: 14 comprobaciones OK (DNS/SQL, proxies, login,
  sesión, altas cerradas, CORS, recibos/pagos/incidencias, 19 rutas
  administrativas, Socket.IO y revisión de logs).
- `k8s/avance19/browser.cjs`: 4 comprobaciones OK con Chromium 1.64.1.
- `k8s/avance19/persistence.cjs`: Pod DB recreado, mismo PVC, datos y login
  conservados, backend sin reiniciar.
- `npm run test:config` 13/13 con dependencias de `Backend/node_modules`;
  `npm run test:ui` 2/2; `npm run test:documents` 4/4.
- `bash -n k8s/avance19/start.sh`, `git diff --check`.

No se ejecutó `otp-fixture.cjs` en esta repetición por memoria y porque es
opcional; su evidencia previa del 22 de octubre se conserva sin atribuirla a esta
fecha. Ajustes de portabilidad resultantes: requisitos de RAM/Node/puertos,
rama de clonación, recuperación del nodo detenido, rutas reales de Playwright y
mensaje explícito de `start.sh` cuando faltan imágenes. Se vuelven a comprobar
`start.sh` y el diff antes de publicar.
