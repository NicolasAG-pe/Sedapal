#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/env.sh"
for arg in "$@"; do
  case "$arg" in --context*|--kubeconfig*|--namespace*|-n|--all-namespaces|-A) echo 'No se permite cambiar el destino del wrapper avance19.' >&2; exit 1;; esac
done
exec "$kubectl_bin" --kubeconfig "$KUBECONFIG" --context kind-hidro-avance19 --namespace hidro-avance19 "$@"
