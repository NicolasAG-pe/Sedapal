#!/usr/bin/env bash
# ============================================================
# Hidro Mejora · Backup de PostgreSQL (formato custom)
# Uso (desde la raíz del repo, con Docker en marcha):
#   ./scripts/backup-db.sh
# Resultado:
#   backups/hidro_mejora_YYYYMMDD_HHMMSS_XXXXXX.dump
# Usa credenciales del contenedor actual (nunca hardcodeadas).
# No imprime secretos. Solo informa la ruta generada.
# Restauración: ver docs/DEPLOY-VPS-HISTORICO.md (pg_restore).
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERROR: no existe .env en la raíz del repo." >&2
  exit 1
fi

umask 077
mkdir -p backups
SALIDA="$(mktemp "backups/hidro_mejora_$(date +%Y%m%d_%H%M%S)_XXXXXX.dump")"

docker compose exec -T db sh -c \
  'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F c' > "$SALIDA"

test -s "$SALIDA"
# Solo listar el archivo: no se conecta a la base ni restaura datos.
docker compose exec -T db pg_restore --list < "$SALIDA" > "$SALIDA.list"
test -s "$SALIDA.list"
sha256sum "$SALIDA" > "$SALIDA.sha256"

echo "Backup generado y reconocido por pg_restore: $SALIDA"
