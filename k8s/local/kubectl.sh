#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
exec "$root/.local/k8s/bin/kubectl" --kubeconfig "$root/.local/k8s/state/kubeconfig" --context kind-sedapal-test -n sedapal "$@"
