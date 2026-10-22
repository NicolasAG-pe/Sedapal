# Kubernetes para Sedapal

**Avance 18:** base/overlays revisados para OTP/outbox; solo validación local de
archivos y SQL, sin aplicar recursos. Ver [informe](../docs/pruebas/integracion-avance-18.md).

Los cuatro YAML se basan en `compose.yaml` y los Dockerfiles actuales. Todos
los recursos deben aplicarse en el mismo namespace. No se modifica Compose.

## Prueba en esta PC

Ver [la guía local](local/README.md): herramientas instaladas dentro de
`.local/k8s/`, clúster aislado y paneles en 8082/8083. Incluye creación de
cuentas locales, verificación de API, navegador y persistencia.

## Rama y revisión

La rama dedicada ya está creada. Para volver a ella y revisar los archivos:

```bash
cd /home/saul-lab/Sedapal
git switch feature/vercel-to-k8s
mkdir -p k8s
ls -R k8s
git diff --check
```

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

## Commit y push exclusivamente de estos artefactos

```bash
cd /home/saul-lab/Sedapal
(
  set -euo pipefail
  test "$(git branch --show-current)" = feature/vercel-to-k8s
  git add -- .gitignore Backend/server.js k8s/ scripts/check-admin-local.cjs
  if git diff --cached --name-only | grep -Eqv '^(k8s/|\.gitignore$|scripts/check-admin-local\.cjs$|Backend/server\.js$)'; then
    echo 'Hay archivos ajenos a la preparación de Kubernetes en staging; revisar antes de continuar.'
    exit 1
  fi
  git diff --cached --check
  git commit -m "feat(k8s): preparar migración aislada de Sedapal con servicios y PostgreSQL 18"
  git push --set-upstream origin feature/vercel-to-k8s
)
```

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
