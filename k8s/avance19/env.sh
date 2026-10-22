#!/usr/bin/env bash
# Solo se usa desde los scripts de este entorno de fixtures.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
state="$root/artifacts/kubernetes-avance-19/state"
export KUBECONFIG="$state/kubeconfig"
kind_bin="${HIDRO_KIND_BIN:-$(command -v kind || true)}"
kubectl_bin="${HIDRO_KUBECTL_BIN:-$(command -v kubectl || true)}"
[[ -n "$kind_bin" ]] || kind_bin="$root/artifacts/kubernetes-avance-19/tools/kind"
[[ -n "$kubectl_bin" ]] || kubectl_bin="$root/artifacts/integracion-18/tools/kubectl"
[[ -x "$kubectl_bin" ]] || { echo 'Configura HIDRO_KUBECTL_BIN con kubectl.' >&2; exit 1; }
