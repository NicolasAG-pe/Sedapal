#!/usr/bin/env bash
# Crea/reutiliza exclusivamente hidro-avance19. No construye imágenes ni cambia Compose.
set -euo pipefail
source "$(dirname "$0")/env.sh"
[[ -x "$kind_bin" ]] || { echo 'Configura HIDRO_KIND_BIN con kind.' >&2; exit 1; }
cd "$root"
umask 077
mkdir -p "$state"
for app in web admin backend; do docker image inspect "hidro-avance18-$app:local" >/dev/null; done
if ! "$kind_bin" get clusters | grep -qx hidro-avance19; then
  "$kind_bin" create cluster --name hidro-avance19 --config k8s/avance19/kind.yaml --kubeconfig "$KUBECONFIG" --retain --wait 180s
fi
[[ -s "$KUBECONFIG" ]] || { echo 'No existe kubeconfig privado del avance19; revisar manualmente, sin usar otro contexto.' >&2; exit 1; }
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
