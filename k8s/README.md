# Kubernetes para Sedapal

Kubernetes es una **opción de ejecución local** mantenida en `main`, adicional a
Docker Compose y a los despliegues de Render, Vercel y Neon. No sustituye esos
servicios ni comparte sus volúmenes, secretos, bases o puertos. Los manifiestos
se basan en `compose.yaml` y los Dockerfiles actuales; todos los recursos deben
aplicarse en el mismo namespace. No se modifica Compose.

- **Flujo local validado:** [avance19](avance19/README.md). Clúster kind
  `hidro-avance19`, namespace `hidro-avance19`, puertos 8084/8085. Incluye
  arranque, verificación HTTP, Chromium, persistencia y OTP simulado opcional.
- **Guía histórica del compañero:** [local](local/README.md). Clúster
  `sedapal-test` y puertos 8082/8083; se conserva como referencia y no es el
  flujo que se mantiene para `main`.
- **Manifiestos y overlays:** `base/` (producción), `local/` (clúster
  histórico), `mail/` (worker opcional) y `avance19/` (entorno local aislado).

Docker Compose sigue siendo el entorno rápido de desarrollo en 8080/8081.
Kubernetes local usa otro clúster, namespace, PVC y secretos aleatorios; puede
convivir con Compose, aunque en equipos de 4 GiB conviene ejecutar solo uno.
Render, Vercel y Neon no leen estos manifiestos ni los Secretos del clúster.

## Inicio rápido local

Requisitos, límites y detalles en [avance19/README.md](avance19/README.md).
Desde la raíz del clon, con Docker activo:

```bash
export HIDRO_KIND_BIN=/ruta/kind
export HIDRO_KUBECTL_BIN=/ruta/kubectl
docker build -f Backend/Dockerfile -t hidro-avance18-backend:local Backend
docker build -f Frontend/Dockerfile -t hidro-avance18-web:local .
docker build -f Admin/Dockerfile -t hidro-avance18-admin:local .
docker pull postgres:18
bash k8s/avance19/start.sh
node k8s/avance19/verify.cjs
```

Cliente en http://localhost:8084 y Admin en http://localhost:8085. Las pruebas
opcionales (`browser.cjs`, `persistence.cjs`, `otp-fixture.cjs`) se ejecutan en
serie después del verificador. No se usan `.env`, Neon, Render, Vercel ni correo
real.

Para **detener sin perder datos** (no borra el clúster ni el PVC):

```bash
docker stop hidro-avance19-control-plane
```

Para **recuperar** tras reiniciar la PC o una parada por memoria:

```bash
docker start hidro-avance19-control-plane
bash k8s/avance19/start.sh
node k8s/avance19/verify.cjs
```

El nodo kind no arranca solo. `start.sh` comprueba que el contenedor esté en
marcha, espera hasta 60 s a que Kubernetes marque el nodo Ready y, si está
detenido, indica cómo arrancarlo sin borrar datos. La guía detalla cómo
diagnosticar Pods transitorios y por qué no hay que eliminar el clúster para
liberar memoria.

## Estado y alcance

El soporte local forma parte de `main` a partir de la integración del PR #21,
con los archivos de `k8s/avance19/`. Las herramientas, imágenes, kubeconfig,
cuentas sintéticas y reportes son privados de cada equipo: `.local/` y
`artifacts/` están ignorados por Git. No se comparten secretos entre laptops.

## Construir y publicar las imágenes

Reemplazar el registro y la etiqueta. Requiere acceso al registro mediante
`docker login`. Los tres builds mantienen los contextos usados en Compose.

```bash
export REGISTRY=ghcr.io/TU_ORGANIZACION
export TAG=k8s-v1
docker build -f Frontend/Dockerfile -t "$REGISTRY/sedapal-web:$TAG" .
docker build -f Admin/Dockerfile -t "$REGISTRY/sedapal-admin:$TAG" .
docker build -f Backend/Dockerfile -t "$REGISTRY/sedapal-backend:$TAG" Backend
docker push "$REGISTRY/sedapal-web:$TAG"
docker push "$REGISTRY/sedapal-admin:$TAG"
docker push "$REGISTRY/sedapal-backend:$TAG"
for app in web admin backend; do
  sed -i "s|REGISTRO/sedapal-${app}:VERSION|${REGISTRY}/sedapal-${app}:${TAG}|g" "k8s/${app}-deployment.yaml"
done
```

Si se usa el overlay mail, actualizar también la imagen de
`k8s/mail/worker-deployment.yaml` al mismo digest/etiqueta del backend, o crear
un overlay superior con `images` que transforme ambas referencias. No dejar el
placeholder del worker. Si el registro es privado, configurar también
imagePullSecrets en los Pods.
Los recursos son una base inicial: ajustar memoria, CPU y almacenamiento con
mediciones de la aplicación.

## Preparar Kubernetes (opcional, no ejecutado automáticamente)

Revisar el contexto antes de crear recursos. Se necesita una StorageClass
predeterminada o un PV compatible para el PVC de 10 GiB.

Crear las credenciales una sola vez. No repetir con nuevas contraseñas sobre
una base inicializada: las variables POSTGRES_* no cambian sus credenciales.
El usuario inicial de la imagen oficial es administrador; para producción,
provisionar un usuario con permisos limitados para la API.

```bash
kubectl config current-context
kubectl create namespace sedapal --dry-run=client -o yaml | kubectl apply -f -
# No activar set -x: contiene valores secretos en memoria.
(
  set -euo pipefail
  umask 077
  secret_file="$(mktemp)"
  trap 'rm -f "$secret_file"' EXIT
  db_password="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
  auth_secret="$(od -An -N48 -tx1 /dev/urandom | tr -d ' \n')"
  printf 'POSTGRES_DB=sedapal\nPOSTGRES_USER=sedapal\nPOSTGRES_PASSWORD=%s\nAUTH_TOKEN_SECRET=%s\n' \
    "$db_password" "$auth_secret" > "$secret_file"
  kubectl -n sedapal create secret generic sedapal-secrets --from-env-file="$secret_file"
)
# Primero sustituir todas las imágenes REGISTRO/...:VERSION.
kubectl kustomize k8s/base --load-restrictor LoadRestrictionsNone > /tmp/sedapal-reviewed.yaml
kubectl -n sedapal apply --dry-run=server -f /tmp/sedapal-reviewed.yaml
kubectl -n sedapal apply -f /tmp/sedapal-reviewed.yaml
kubectl -n sedapal rollout status deployment/db --timeout=180s
kubectl -n sedapal rollout status deployment/backend --timeout=180s
kubectl -n sedapal rollout status deployment/web --timeout=180s
kubectl -n sedapal rollout status deployment/admin --timeout=180s
kubectl -n sedapal get pods,services,pvc
```

Prueba local (cada comando en una terminal distinta):

```bash
kubectl -n sedapal port-forward service/web 8080:80
kubectl -n sedapal port-forward service/admin 8081:80
```

Abrir http://localhost:8080 y http://localhost:8081. Los Nginx existentes
redirigen /api/ y /socket.io/ al Service backend:3000. Para publicación,
configurar Ingress/TLS y actualizar CORS_ALLOWED_ORIGINS con los orígenes reales.

La readiness de la API usa /api/health, que consulta la BD. Kubernetes no
reproduce depends_on: la aplicación debe tolerar reconexiones y los servicios
pueden tardar en quedar disponibles durante el arranque.

## Datos

El ConfigMap db-init se genera desde Base-de-Datos/init.sql (fuente única) con
Kustomize; su hash actualiza la referencia del volumen. Se ejecuta solo sobre
un volumen vacío y ya incluye el esquema 003–006. No aplicar YAML sueltos de
k8s/: no contienen el ConfigMap generado.
No se usa el volumen de Compose. Para migrar datos reales, planificar backup
con pg_dump y restauración con pg_restore/psql en un volumen de destino limpio;
no mezclar el esquema inicial con un dump completo. Esta preparación no realiza
la migración ni configura alta disponibilidad, backups o recuperación.

## Verificación antes de publicar

Kubernetes local no cambia el código de la aplicación ni los despliegues. Antes
de abrir un cambio que afecte `k8s/`, ejecutar las pruebas disponibles:

```bash
cd /home/saul-lab/Sedapal
HIDRO_KUBECTL=/ruta/kubectl npm run test:k8s
npm run test:config
npm run test:ui
npm run test:documents
git diff --check
git status --short
```

`test:k8s` renderiza base/local/mail y valida SQL en una base sintética nueva; no
accede a un contexto ni ejecuta `apply`. Para el entorno local completo, usar la
guía de [avance19](avance19/README.md). Revisar que `.local/`, `artifacts/`,
`*.env`, kubeconfig, capturas y reportes no estén preparados para el commit. No
publicar contraseñas, JWT, API keys ni credenciales de fixtures.

## Contrato OTP, sesión Android y worker (avance 18)

La base y el overlay local mantienen `EMAIL_REGISTRATION_ENABLED=0`: alta y
reenvío responden 503 aun si accidentalmente se proporcionan claves. Login,
`/api/auth/session`, consulta/confirmación pendiente y negocio conservan contrato.
No basta con `/api/auth/capabilities`: no acredita correo disponible ni worker.
La readiness `/api/health` comprueba conectividad SQL, no migraciones ni entrega.
CORS incluye `https://localhost` para Capacitor; configurar además los orígenes
públicos exactos, sin comodines. API y Socket.IO mantienen una réplica: escalar
requiere evaluar adaptador compartido/sticky sessions y límites distribuidos.

`mail/` es una preparación opcional: agrega `email-worker` con **cero réplicas**,
misma imagen backend y comando `node workers/email-outbox.cjs --run`. La API
sigue con altas cerradas. No expone puerto ni inventa un healthcheck HTTP para
un proceso sin servidor. Supervisar reinicios, edad/estados/leases de cola y
aceptación del proveedor; SIGTERM permite terminar el trabajo actual.

Secretos privados externos, nunca literales en YAML:

| Secret / claves | Destino |
| --- | --- |
| sedapal-secrets: POSTGRES_DB/USER/PASSWORD, AUTH_TOKEN_SECRET | DB y API; conservar identidad JWT existente |
| sedapal-mail-secrets: RESEND_FROM, EMAIL_OTP_SECRET, EMAIL_OUTBOX_KEY | API; claves OTP/outbox exclusivas y diferentes del JWT |
| sedapal-mail-secrets: EMAIL_WORKER_DATABASE_URL, RESEND_API_KEY, EMAIL_OUTBOX_KEY | Worker; URL de rol específico con permisos de docs/correo-outbox.md |
| sedapal-secrets: POSTGRES_DB | Nombre esperado obligatorio del worker |

El worker no recibe la clave JWT ni el HMAC OTP; la API no necesita RESEND_API_KEY.
La clave outbox debe permanecer idéntica en ambas instancias y durante recuperación.
Validar dominio/remitente, permisos SQL, TLS del proveedor y destino exacto antes de
habilitar worker o cambiar el cierre de altas. Un canario real requiere autorización
independiente; aceptación no equivale a entrega. No se envió correo en este avance.

### PVC existentes y recuperación

El init no actualiza un PVC inicializado. Antes de usar esta API con históricos:
backup/ensayo de restauración y revisión de migraciones pendientes; aplicar solo
003, 004, 005 y 006 que correspondan, en orden, por operador autorizado. 005 exige
`Base-de-Datos/checks/005_integridad_recibos.sql` y ventana sin escritores. Nunca
reconciliar duplicados borrando datos automáticamente. No hay Job/initContainer
que ejecute migraciones repetidamente. Si falta esquema, detener la transición,
conservar volumen/claves y corregir hacia adelante. No recrear credenciales de un
PVC ni restaurar un dump encima del init. Backup, HA, Ingress/TLS, NetworkPolicy,
rol SQL mínimo, imágenes inmutables y recursos necesitan validación operativa.

### Validación sin clúster

Con kubectl/Kustomize, módulo Node `yaml` de herramientas (o HIDRO_YAML_MODULE)
y PostgreSQL de fixtures nuevo:

```sh
HIDRO_KUBECTL=/ruta/kubectl HIDRO_EMAIL_TEST_DB_PORT=PUERTO npm run test:k8s
```

Solo ejecuta `kubectl kustomize --load-restrictor LoadRestrictionsNone` sobre
fuentes confiables del repositorio y SQL en una base sintética nueva. No accede
a un contexto ni ejecuta apply. Revisa base/local/mail, referencias de ConfigMap,
PVC, proxies, cierre de altas y worker. Las tres pruebas no certifican admisión, redes, storage o Pods en ejecución.
Además se validaron 31 recursos renderizados con kubeconform 0.8.0, modo estricto,
esquemas Kubernetes 1.37.0: 31 válidos, cero omitidos. Esta validación de esquema
no sustituye un dry-run contra el API server ni comprueba políticas del destino. Referencia del generador:
[Kustomize oficial](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/).

## Seguimiento — avance 19

La [validación funcional local](../docs/pruebas/kubernetes-integracion-avance-19.md)
ejecutó realmente Web/Admin/backend/PostgreSQL en un kind exclusivo, con pruebas
de negocio, persistencia y OTP simulado. Ver [guía para otra laptop](avance19/README.md).
No utiliza el clúster sedapal-test ni acredita operación productiva.
