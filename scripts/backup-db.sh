#!/usr/bin/env bash
# ============================================================
# Hidro Mejora · Backup de PostgreSQL (formato custom)
# Uso (desde la raíz del repo, con Docker en marcha):
#   ./scripts/backup-db.sh
# Resultado:
#   backups/hidro_mejora_YYYYMMDD_HHMM.dump
# Lee credenciales del .env (nunca hardcodeadas).
# No imprime secretos. Solo informa la ruta generada.
# Restauración: ver DEPLOY.md (pg_restore).
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERROR: no existe .env en la raíz del repo." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a
. ./.env
set +a

: "${POSTGRES_USER:?Falta POSTGRES_USER en .env}"
: "${POSTGRES_DB:?Falta POSTGRES_DB en .env}"

mkdir -p backups
SALIDA="backups/hidro_mejora_$(date +%Y%m%d_%H%M).dump"

docker compose exec -T db pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  -F c > "$SALIDA"

echo "Backup generado: $SALIDA"
