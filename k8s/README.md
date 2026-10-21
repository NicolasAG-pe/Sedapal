# Kubernetes para Sedapal

Los cuatro YAML se basan en `compose.yaml` y los Dockerfiles actuales. Todos
los recursos deben aplicarse en el mismo namespace. No se modifica Compose.

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

Si el registro es privado, configurar también imagePullSecrets en los Pods.
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
kubectl -n sedapal apply --dry-run=server -f k8s/
kubectl -n sedapal apply -f k8s/
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

El ConfigMap db-init contiene una copia de Base-de-Datos/init.sql. Se ejecuta
solo sobre un volumen vacío; mantener esta copia sincronizada si cambia el SQL.
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
  git add -- k8s/
  if git diff --cached --name-only | grep -qv '^k8s/'; then
    echo 'Hay archivos ajenos a k8s/ en staging; revisar antes de continuar.'
    exit 1
  fi
  git diff --cached --check
  git commit -m "feat(k8s): preparar migración aislada de Sedapal con servicios y PostgreSQL 18"
  git push --set-upstream origin feature/vercel-to-k8s
)
```
