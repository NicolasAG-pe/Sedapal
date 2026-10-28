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
El 28 de octubre se publicó la rama y se abrió el
[PR #21](https://github.com/NicolasAG-pe/Sedapal/pull/21) hacia `main`. El merge
sigue pendiente de autorización y de confirmar el autodespliegue de Render; las
exclusiones Vercel están en ambas raíces.

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

## Integración en `main` y revisión del PR #21 — 28 de octubre de 2026

Objetivo del PR: que Kubernetes local sea una opción mantenida dentro de `main`,
sin sustituir Compose, Render, Vercel ni Neon, y sin cambios de código de la
aplicación. Base del PR: `main` en `d6a6b83`. La rama solo modifica guía,
portabilidad de scripts, exclusión Vercel y evidencia; no toca manifiestos de
negocio, backend, Frontend, Admin, Compose ni `init.sql`.

### Compatibilidad revisada

- **Compose:** sigue en 8080/8081 con su volumen `postgres_data` y `.env`.
  Kubernetes local usa 8084/8085, namespace y PVC propios; no comparte red,
  volumen ni secretos.
- **Render/Vercel/Neon:** no hay `render.yaml` en el repositorio. Los manifiestos
  locales no contienen `DATABASE_URL` de Neon ni credenciales de esas
  plataformas. `vercel.json` y `Backend/vercel.json` mantienen `main: false` y
  excluyen la rama del PR.
- **Imágenes:** el overlay local reutiliza los nombres históricos
  `hidro-avance18-*:local`; no publica en un registro ni altera imágenes de
  producción.
- **Datos:** PostgreSQL es un PVC del clúster kind; no se monta ni se consulta
  la base de Compose o Neon. El init solo corre en un PVC vacío.

### Pruebas ejecutadas en esta revisión

| Suite | Resultado |
| --- | --- |
| `k8s/avance19/start.sh` (reutilización) | 4 Deployments Ready, PVC Bound, sin reinicios por el apply |
| `k8s/avance19/start.sh` (nodo detenido y reinicio) | Mensaje claro con el nodo parado; tras `docker start`, espera Ready y recupera sin perder PVC |
| `k8s/avance19/verify.cjs` | 14/14 |
| `k8s/avance19/browser.cjs` | 4/4 con Chromium 1.64.1 |
| `k8s/avance19/persistence.cjs` | OK, Pod DB recreado y datos conservados |
| `npm run test:k8s` | 3/3 (render base/local/mail y SQL sintético) |
| `npm run test:config` | 13/13 |
| `npm run test:ui` | 2/2 |
| `npm run test:documents` | 4/4 |
| `npm run test:chatbot` | 4/4 |
| `npm run test:email` | 36/36 |
| `npm run test:email:contract` | 5/5 |
| `npm run test:email:outbox` | 25/25 |
| `npm run test:receipts` | 21/21, 1 omitida por diseño |
| `npm run test:android:transition` | 18/18 |
| `npm run test:android:otp` | 18/18 |
| `npm run test:android:session` | 10/10 |
| `npm run test:android:upgrade` | 3/3 |
| `node --test scripts/test/android-release-signing.test.cjs` | 7/7 |
| `npm run test:email:schema`, `test:email:api` | OK |

Las suites que requieren PostgreSQL usaron un contenedor `postgres:18`
temporal con `--tmpfs`, base `hm_email_test`, usuario fixture y puerto solo en
127.0.0.1. Se retiró el contenedor temporal al terminar; no se usó Compose, Neon
ni el volumen de producción. Las pruebas de OTP simulado del clúster no se
repitieron en esta sesión.

### Hallazgos y correcciones

- `browser.cjs` fallaba con `MODULE_NOT_FOUND` si no se definía Playwright. Ahora
  explica qué instalar y qué variables exportar, sin cambiar el flujo cuando sí
  está disponible.
- `k8s/README.md` todavía indicaba cambiar a `feature/vercel-to-k8s` y hacía
  `push` con una guardia de esa rama. Se reescribió para `main`: inicio rápido,
  parada, recuperación y verificación previa.
- `k8s/local/README.md` se marcó como guía histórica; el flujo mantenido es
  `avance19`.
- `start.sh` ya explicaba las imágenes faltantes; se mantiene y se probó de nuevo.
- Al arrancar el nodo y ejecutar `kubectl wait` de inmediato, el API server
  devolvió `Forbidden` de forma transitoria. `start.sh` ahora detecta un nodo
  detenido con un mensaje claro y reintenta la comprobación de Ready hasta 60 s;
  la recuperación inmediata pasó sin intervención manual.
- El nodo kind detenido por memoria se recuperó sin borrar PVC ni datos.

### Verificación desde un clon independiente

Se clonó la rama del PR en un directorio nuevo, sin `.local/` ni `artifacts/`
provenientes del checkout de desarrollo. Solo se copiaron el kubeconfig y las
cuentas sintéticas de la misma PC, que son estado privado esperado. Desde ese
clon:

- `start.sh` renderizó y reutilizó el clúster y las imágenes del host.
- `verify.cjs` pasó 14/14 y `browser.cjs` 4/4.
- Se detuvo el nodo, `start.sh` avisó correctamente; tras `docker start`
  recuperó el nodo, aplicó sin cambios y `verify.cjs` volvió a pasar 14/14.
- `persistence.cjs` recreó el Pod DB y conservó datos y login.

No se probó la creación de un clúster nuevo en otra PC ni la descarga desde
cero; esa parte depende de las herramientas y la red del compañero y queda
cubierta por la guía de requisitos, no por esta ejecución.

### Dictamen

El PR es **apto para revisión y merge** desde el punto de vista funcional: es
documental, no altera la aplicación ni los despliegues, y las pruebas locales
pasan. Antes del merge queda una comprobación externa: confirmar en Render si un
push/merge a `main` dispara autodespliegue; el repositorio no contiene esa
configuración. Vercel está excluido para `main` y para la rama. No se ejecutó el
merge, no se desplegó y no se accedió a Neon.
