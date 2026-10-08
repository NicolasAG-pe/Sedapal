#!/usr/bin/env bash
# Selecciona Java 21 solo para este proceso, sin cambiar SDKMAN ni Java global.
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

es_java21() {
    [[ -x "$1/bin/java" ]] && "$1/bin/java" -version 2>&1 | grep -q 'version "21\.'
}

JAVA_ELEGIDO="${JAVA_HOME_21:-}"
if [[ -n "$JAVA_ELEGIDO" ]] && ! es_java21 "$JAVA_ELEGIDO"; then
    echo 'JAVA_HOME_21 debe apuntar a un JDK 21 válido.' >&2
    exit 1
fi
if [[ -z "$JAVA_ELEGIDO" ]] && es_java21 "${JAVA_HOME:-/no-java}"; then
    JAVA_ELEGIDO="$JAVA_HOME"
fi
if [[ -z "$JAVA_ELEGIDO" ]]; then
    for candidato in "$HOME"/.sdkman/candidates/java/21* /usr/lib/jvm/*21*; do
        if es_java21 "$candidato"; then JAVA_ELEGIDO="$candidato"; break; fi
    done
fi
if [[ -z "$JAVA_ELEGIDO" ]]; then
    echo 'Instala JDK 21 y configura JAVA_HOME_21 para este proyecto.' >&2
    exit 1
fi
export JAVA_HOME="$JAVA_ELEGIDO"
export PATH="$JAVA_HOME/bin:$PATH"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$RAIZ/artifacts/android/cache/gradle-user-home}"
export ANDROID_USER_HOME="${ANDROID_USER_HOME:-$RAIZ/artifacts/android/cache/android-user-home}"
mkdir -p "$GRADLE_USER_HOME" "$ANDROID_USER_HOME"
ARGUMENTOS=("$@")
SALIDA_EXPLICITA=false
for argumento in "$@"; do
    [[ "$argumento" == -PhidroBuildDir=* ]] && SALIDA_EXPLICITA=true
done
if [[ "$SALIDA_EXPLICITA" == false ]]; then
    # Cada invocación conserva el APK anterior sin sobrescribir sus outputs.
    ARGUMENTOS+=("-PhidroBuildDir=$RAIZ/artifacts/android/builds/$(date +%Y%m%d_%H%M%S)-$$/app")
fi
node "$RAIZ/scripts/configure-android-jdk.js" "$JAVA_HOME"
cd "$RAIZ/android"
exec ./gradlew "--project-cache-dir=$RAIZ/artifacts/android/cache/project" "-Dorg.gradle.java.home=$JAVA_HOME" "${ARGUMENTOS[@]}"
