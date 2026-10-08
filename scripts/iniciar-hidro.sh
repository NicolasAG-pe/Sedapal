#!/bin/bash
set -euo pipefail

echo "========================================"
echo "      INICIANDO HIDRO-MEJORA"
echo "========================================"

# Nos aseguramos de estar en la carpeta del proyecto
cd "$(dirname "$0")/.."

echo ""
echo "[1/2] Iniciando Docker..."
docker compose up -d

echo ""
echo "[2/2] Esperando a Hidro-Mejora..."

for i in {1..30}; do
    if curl --fail --silent --max-time 2 http://localhost:8080/api/health > /dev/null; then
        echo "Hidro-Mejora está funcionando."
        echo "Local: http://localhost:8080"
        exit 0
    fi

    sleep 1
done

echo 'La API no respondió a tiempo. Consulta docker compose ps y docker compose logs backend.' >&2
exit 1
