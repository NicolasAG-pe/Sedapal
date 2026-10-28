#!/usr/bin/env bash
# Crea/reutiliza exclusivamente hidro-avance19. No construye imágenes ni cambia Compose.
set -euo pipefail
source "$(dirname "$0")/env.sh"
[[ -x "$kind_bin" ]] || { echo 'Configura HIDRO_KIND_BIN con kind.' >&2; exit 1; }
cd "$root"
umask 077
mkdir -p "$state"
missing_images=()
for app in web admin backend; do
  docker image inspect "hidro-avance18-$app:local" >/dev/null 2>&1 || missing_images+=("hidro-avance18-$app:local")
done
docker image inspect postgres:18 >/dev/null 2>&1 || missing_images+=("postgres:18")
if ((${#missing_images[@]})); then
  echo 'Faltan imágenes requeridas: '"${missing_images[*]}" >&2
  echo 'Construirlas desde la raíz del checkout antes de arrancar:' >&2
  echo '  docker build -f Backend/Dockerfile -t hidro-avance18-backend:local Backend' >&2
  echo '  docker build -f Frontend/Dockerfile -t hidro-avance18-web:local .' >&2
  echo '  docker build -f Admin/Dockerfile -t hidro-avance18-admin:local .' >&2
  echo '  docker pull postgres:18' >&2
  exit 1
fi
if docker inspect hidro-avance19-control-plane >/dev/null 2>&1 && \
   [[ "$(docker inspect -f '{{.State.Running}}' hidro-avance19-control-plane)" != "true" ]]; then
  echo 'El nodo hidro-avance19-control-plane está detenido. Arrancarlo sin borrar datos:' >&2
  echo '  docker start hidro-avance19-control-plane' >&2
  echo 'Después repetir este script.' >&2
  exit 1
fi
if ! "$kind_bin" get clusters | grep -qx hidro-avance19; then
  "$kind_bin" create cluster --name hidro-avance19 --config k8s/avance19/kind.yaml --kubeconfig "$KUBECONFIG" --retain --wait 180s
fi
[[ -s "$KUBECONFIG" ]] || { echo 'No existe kubeconfig privado del avance19; revisar manualmente, sin usar otro contexto.' >&2; exit 1; }
# El API server puede tardar en autorizar lecturas justo después de arrancar el nodo.
node_ready=""
for _ in $(seq 1 30); do
  if "$kubectl_bin" --kubeconfig "$KUBECONFIG" --context kind-hidro-avance19 \
      get node hidro-avance19-control-plane -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' \
      2>/dev/null | grep -qx True; then
    node_ready=1
    break
  fi
  sleep 2
done
[[ -n "$node_ready" ]] || { echo 'El nodo hidro-avance19 no está Ready; revisar Docker y kubectl get nodes.' >&2; exit 1; }
# Docker/containerd puede guardar solo la plataforma local de un índice multiarch.
# Si kind exige blobs ausentes de otras plataformas, importar solo la disponible.
for image in hidro-avance18-web:local hidro-avance18-admin:local hidro-avance18-backend:local postgres:18; do
  if ! docker exec hidro-avance19-control-plane crictl inspecti "$image" >/dev/null 2>&1; then
    if ! "$kind_bin" load docker-image --name hidro-avance19 "$image"; then
      platform="$(docker image inspect "$image" --format '{{.Os}}/{{.Architecture}}')"
      docker image save "$image" | docker exec --privileged -i hidro-avance19-control-plane ctr --namespace=k8s.io images import --platform "$platform" --snapshotter=overlayfs -
    fi
  fi
done
kube() { bash "$root/k8s/avance19/kube.sh" "$@"; }
"$kubectl_bin" --kubeconfig "$KUBECONFIG" --context kind-hidro-avance19 create namespace hidro-avance19 --dry-run=client -o yaml | "$kubectl_bin" --kubeconfig "$KUBECONFIG" --context kind-hidro-avance19 apply -f -
if ! kube get secret sedapal-secrets >/dev/null 2>&1; then
  if kube get pvc db-data >/dev/null 2>&1; then
    echo 'PVC existente sin Secret: recuperar credenciales, no regenerarlas.' >&2; exit 1
  fi
  node - <<'JS' | kube create -f -
const crypto=require('node:crypto');const secret={apiVersion:'v1',kind:'Secret',metadata:{name:'sedapal-secrets'},type:'Opaque',stringData:{POSTGRES_DB:'hm_avance19',POSTGRES_USER:'hm_fixture',POSTGRES_PASSWORD:crypto.randomBytes(32).toString('hex'),AUTH_TOKEN_SECRET:crypto.randomBytes(48).toString('hex')}};process.stdout.write(JSON.stringify(secret));
JS
fi
"$kubectl_bin" kustomize k8s/avance19 --load-restrictor LoadRestrictionsNone > "$state/rendered.yaml"
kube apply --dry-run=server -f "$state/rendered.yaml"
kube apply -f "$state/rendered.yaml"
for app in db backend web admin; do kube rollout status "deployment/$app" --timeout=180s; done
kube get pods,deployments,services,pvc
printf '\nCliente: http://localhost:8084\nAdmin: http://localhost:8085\n'
