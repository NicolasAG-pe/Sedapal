#!/usr/bin/env bash
# Solo clúster local sedapal-test. No usa ni cambia ~/.kube/config.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"
export PATH="$root/.local/k8s/bin:$PATH"
export KUBECONFIG="$root/.local/k8s/state/kubeconfig"
command -v kind >/dev/null
command -v kubectl >/dev/null
docker info >/dev/null
mkdir -p .local/k8s/state
if ! kind get clusters | grep -qx sedapal-test; then
  kind create cluster --name sedapal-test --config k8s/local/kind.yaml --kubeconfig "$KUBECONFIG" --wait 180s
fi
kube() { kubectl --context kind-sedapal-test -n sedapal "$@"; }
for app in web admin backend; do
  case "$app" in
    web) file=Frontend/Dockerfile; context=. ;;
    admin) file=Admin/Dockerfile; context=. ;;
    backend) file=Backend/Dockerfile; context=Backend ;;
  esac
  docker build -f "$file" -t "sedapal-$app:local" "$context"
done
kind load docker-image --name sedapal-test sedapal-web:local sedapal-admin:local sedapal-backend:local
kube create namespace sedapal --dry-run=client -o yaml | kube apply -f -
if ! kube get secret sedapal-secrets >/dev/null 2>&1; then
  (
    umask 077
    secret_file="$(mktemp "$root/.local/k8s/state/secrets.XXXXXX")"
    trap 'rm -f "$secret_file"' EXIT
    printf 'POSTGRES_DB=sedapal\nPOSTGRES_USER=sedapal\nPOSTGRES_PASSWORD=%s\nAUTH_TOKEN_SECRET=%s\n' \
      "$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')" \
      "$(od -An -N48 -tx1 /dev/urandom | tr -d ' \n')" > "$secret_file"
    kube create secret generic sedapal-secrets --from-env-file="$secret_file"
  )
fi
# El overlay solo referencia los cuatro manifiestos del repositorio.
kubectl kustomize k8s/local --load-restrictor LoadRestrictionsNone > .local/k8s/state/rendered.yaml
kube apply --dry-run=server -f .local/k8s/state/rendered.yaml
kube apply -f .local/k8s/state/rendered.yaml
# La etiqueta local se reutiliza: recrear los Pods para usar el build nuevo.
kube rollout restart deployment/backend deployment/web deployment/admin
for app in db backend web admin; do
  kube rollout status "deployment/$app" --timeout=300s
done
kube get pods,services,pvc
printf '\nUsuario: http://localhost:8082\nAdministración: http://localhost:8083\n'
