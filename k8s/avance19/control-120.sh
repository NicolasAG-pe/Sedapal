#!/usr/bin/env bash
# Solo el clúster existente; nunca crea recursos, aplica esquemas ni lee .env.
set -euo pipefail
source "$(dirname "$0")/env.sh"
[[ $# == 1 && "$1" =~ ^(start|stop|status)$ ]] || { echo 'Uso: control-120.sh start|stop|status' >&2; exit 2; }
node=hidro-avance19-control-plane
[[ "$(docker inspect -f '{{index .Config.Labels "io.x-k8s.kind.cluster"}}' "$node")" == hidro-avance19 ]] || exit 1
[[ -s "$state/local-120-guard.json" && -s "$KUBECONFIG" ]] || { echo 'Falta el estado privado validado de la actualización 1.2.0.' >&2; exit 1; }
guard() {
  node - "$state/local-120-guard.json" "$node" <<'JS'
const fs=require('node:fs'),{execFileSync:e}=require('node:child_process');const g=JSON.parse(fs.readFileSync(process.argv[2]));const d=JSON.parse(e('docker',['inspect',process.argv[3]],{encoding:'utf8'}))[0];if(d.Id!==g.nodeContainerId)throw Error('Contenedor distinto del validado; detener sin recrear.');
JS
}
kube() { bash "$root/k8s/avance19/kube.sh" --request-timeout=15s "$@"; }
check_pvc() {
 local uid;uid="$(kube get pvc db-data -o jsonpath='{.metadata.uid}')"
 node -e 'const fs=require("fs"),g=JSON.parse(fs.readFileSync(process.argv[1]));if(g.pvcUID!==process.argv[2])throw Error("PVC distinto; no continuar");' "$state/local-120-guard.json" "$uid"
}
guard
case "$1" in
 status)
  if [[ "$(docker inspect -f '{{.State.Running}}' "$node")" != true ]]; then echo 'hidro-avance19 detenido; datos/PVC conservados.'; exit 0; fi
  check_pvc;kube get deployment/backend deployment/web deployment/admin deployment/db pvc/db-data
  ;;
 start)
  node - "$root" <<'JS'
const fs=require('fs'),os=require('os');const free=fs.statfsSync(process.argv[2]);const mem=Number(fs.readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+)/m)[1])*1024;if(Number(free.bavail)*Number(free.bsize)<768*1024**2||mem<1536*1024**2)throw Error('Recursos insuficientes; no borrar ni detener otros entornos.');
JS
  if [[ "$(docker inspect -f '{{.State.Running}}' "$node")" != true ]]; then docker start "$node" >/dev/null; fi
  ready=0
  for _ in $(seq 1 90); do
   if kube get node "$node" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null | grep -qx True; then ready=1;break;fi
   sleep 2
  done
  [[ "$ready" == 1 ]] || { echo 'API del clúster no está Ready; conservarlo y revisar.' >&2;exit 1; }
  check_pvc
  for app in db backend web admin; do kube scale deployment/"$app" --replicas=1;kube rollout status deployment/"$app" --timeout=180s;done
  echo 'Cliente http://localhost:8084 · Admin http://localhost:8085'
  ;;
 stop)
  if [[ "$(docker inspect -f '{{.State.Running}}' "$node")" != true ]];then echo 'Ya está detenido.';exit 0;fi
  check_pvc
  for app in web admin backend;do
   kube scale deployment/"$app" --replicas=0
   kube wait --for=delete pod -l app="$app" --timeout=120s
  done
  kube exec deployment/db -- sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c CHECKPOINT'
  kube scale deployment/db --replicas=0;kube wait --for=delete pod -l app=db --timeout=120s
  docker stop --time=90 "$node"
  echo 'Clúster detenido sin borrar contenedor, PVC, secretos ni datos.'
  ;;
esac
