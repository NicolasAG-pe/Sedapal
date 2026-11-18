#!/usr/bin/env bash
# Mueve solo el puente `adb reverse` de la APK LAB entre el Gateway de demostración y el del ensayo.
# No instala ni modifica ninguna APK. Uso: adb-bridge.sh status | switch | rollback
set -euo pipefail

DEVICE_PORT=45689
DEMO_PORT=8284   # Gateway anterior: conversación simulada (artifacts/hidrobot-groq-lab/gateway-v2.cjs)
TRIAL_PORT=8285  # Gateway del ensayo que levanta e2e.py
ORIGINS=/home/nico/.local/share/hidromejora/integration-hotfix-main-ms120/artifacts/android/hidrobot3-lab-593cacd/origins.json

ready() { curl -fsS -m 3 "http://127.0.0.1:$1/ready" >/dev/null 2>&1; }

device() {
    local serials
    serials=$(adb devices | awk 'NR>1 && $2=="device" {print $1}')
    [ "$(printf '%s\n' "$serials" | grep -c .)" -eq 1 ] || { echo "Se requiere exactamente un dispositivo ADB autorizado." >&2; exit 1; }
    printf '%s' "$serials"
}

point() {
    local serial
    serial=$(device)
    adb -s "$serial" reverse "tcp:$DEVICE_PORT" "tcp:$1" >/dev/null
    echo "Puente actual: $(adb -s "$serial" reverse --list | grep "tcp:$DEVICE_PORT")"
}

case "${1:-}" in
    status)
        serial=$(device)
        echo "Dispositivo: conectado"
        adb -s "$serial" reverse --list | grep "tcp:$DEVICE_PORT" || echo "Sin puente en tcp:$DEVICE_PORT"
        for port in "$DEMO_PORT" "$TRIAL_PORT"; do
            if ready "$port"; then echo "Gateway 127.0.0.1:$port responde"; else echo "Gateway 127.0.0.1:$port NO responde"; fi
        done
        ;;
    switch)
        ready "$TRIAL_PORT" || { echo "El Gateway del ensayo no responde en 127.0.0.1:$TRIAL_PORT. Inicia e2e.py --run primero. No se cambió el puente." >&2; exit 1; }
        point "$TRIAL_PORT"
        echo "Android LAB usa el Gateway del ensayo. Para volver: $0 rollback"
        ;;
    rollback)
        if ! ready "$DEMO_PORT"; then
            echo "El Gateway anterior no responde en 127.0.0.1:$DEMO_PORT. No se cambió el puente." >&2
            echo "Reinícialo con: node artifacts/hidrobot-groq-lab/gateway-v2.cjs $ORIGINS" >&2
            exit 1
        fi
        point "$DEMO_PORT"
        echo "Android LAB vuelve al Gateway de demostración con conversación simulada."
        ;;
    *)
        echo "Uso: $0 status | switch | rollback" >&2
        exit 2
        ;;
esac
