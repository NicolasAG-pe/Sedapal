#!/usr/bin/env bash
# Mueve solo el puente `adb reverse` de la APK LAB entre el Gateway de demostración y el del ensayo.
# No instala ni modifica ninguna APK. Uso: adb-bridge.sh status | switch | rollback
set -euo pipefail

DEVICE_PORT=45689
DEMO_PORT=8284   # Gateway anterior: conversación simulada (artifacts/hidrobot-groq-lab/gateway-v2.cjs)
TRIAL_PORT=8285  # Gateway del ensayo que levanta e2e.py
ADB=${HIDRO_ADB:-adb}
if [[ -z ${HIDRO_ADB:-} && -x $HOME/Android/Sdk/platform-tools/adb ]]; then
    ADB=$HOME/Android/Sdk/platform-tools/adb
fi

ready() { curl --noproxy '*' -fsS -m 3 "http://127.0.0.1:$1/ready" >/dev/null 2>&1; }

device() {
    local serials
    serials=$("$ADB" devices | awk -v serial="${ANDROID_SERIAL:-}" 'NR>1 && $2=="device" && (!length(serial) || $1==serial) {print $1}')
    [ "$(printf '%s\n' "$serials" | grep -c .)" -eq 1 ] || { echo "Selecciona un dispositivo ADB autorizado con ANDROID_SERIAL." >&2; exit 1; }
    printf '%s' "$serials"
}

point() {
    local serial
    serial=$(device)
    "$ADB" -s "$serial" reverse "tcp:$DEVICE_PORT" "tcp:$1" >/dev/null
    "$ADB" -s "$serial" reverse --list | awk -v device="tcp:$DEVICE_PORT" -v target="tcp:$1" '
        NF>=2 && $(NF-1)==device && $NF==target {print "Puente actual: "$0; found=1}
        END {exit !found}'
}

case "${1:-}" in
    status)
        serial=$(device)
        echo "Dispositivo: conectado"
        "$ADB" -s "$serial" reverse --list | awk -v device="tcp:$DEVICE_PORT" 'NF>=2 && $(NF-1)==device {print; found=1} END {exit !found}' || echo "Sin puente en tcp:$DEVICE_PORT"
        for port in "$DEMO_PORT" "$TRIAL_PORT"; do
            if ready "$port"; then echo "Gateway 127.0.0.1:$port responde"; else echo "Gateway 127.0.0.1:$port NO responde"; fi
        done
        ;;
    switch)
        ready "$DEMO_PORT" && ready "$TRIAL_PORT" || { echo "Se requieren ambos Gateway listos en 8284 y 8285. El puente conserva su destino." >&2; exit 1; }
        point "$TRIAL_PORT"
        echo "Android LAB usa el Gateway del ensayo. Para volver: $0 rollback"
        ;;
    rollback)
        point "$DEMO_PORT"
        if ready "$DEMO_PORT"; then
            echo "Android LAB vuelve al Gateway de demostración con conversación simulada."
        else
            echo "Puente restaurado. El Gateway 127.0.0.1:$DEMO_PORT no responde. Restablece el servicio de demostración." >&2
        fi
        ;;
    *)
        echo "Uso: $0 status | switch | rollback" >&2
        exit 2
        ;;
esac
