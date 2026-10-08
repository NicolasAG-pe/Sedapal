#!/usr/bin/env bash
# Genera únicamente los archivos de runtime y la configuración pública.
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"
node scripts/build-web.js android
