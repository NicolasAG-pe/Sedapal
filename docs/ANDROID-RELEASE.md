# APK release de Hidro-Mejora

Distribución directa por APK. No se genera AAB ni se publica en Google Play.
Se conserva Capacitor 7, Java 21 y `pe.edu.hidromejora.app`.
La primera release es `versionCode 2`, `versionName 1.0.0`.
Fuente del versionado: [android/app/build.gradle](../android/app/build.gradle); entorno nativo: [ANDROID](ANDROID.md).

## Publicación y validación de v1.0.0

Publicada el 8 de octubre de 2026, tag `v1.0.0`, commit `135cb54173ee60e2f528738805564773e3c32e8b`.

- [GitHub Release](https://github.com/NicolasAG-pe/Sedapal/releases/tag/v1.0.0).
- [Descarga directa de la APK](https://github.com/NicolasAG-pe/Sedapal/releases/download/v1.0.0/hidro-mejora-v1.0.0-release.apk).
- Artefacto publicado: `hidro-mejora-v1.0.0-release.apk`, **3.389.545 bytes**. Este tamaño identifica esa APK, no todos los builds futuros.

La APK `hidro-mejora-v1.0.0-release.apk` fue instalada y validada en un teléfono
físico por el propietario: instalación, login, perfil, dashboard, recibos, PDF,
pagos, incidencias, fotografía, ubicación, cortes, atención, notificaciones,
logout, botón Atrás y Socket.IO/tiempo real con Admin, todos correctos.

SHA-256 del APK validado:

```text
577ac34bef2c8c6b3cec7954fd860cf78809ab58bfb66f424bcdbaf5202d23d5
```

Compatibilidad: Android 6.0 (API 23) o superior. La distribución es por APK
firmada; el archivo binario se adjunta a GitHub Releases y no se versiona en Git.

## Identidad de firma permanente

La clave permanente reside en un directorio privado externo al repositorio.
La ubicación convencional del directorio es `~/.config/hidro-mejora/signing/`;
el archivo concreto se proporciona mediante `HM_RELEASE_STORE_FILE`.
Es PKCS12, RSA de 3072 bits, SHA256withRSA, con validez de 10000 días.
El directorio tiene permisos 700 y los archivos 600. Nunca limpiar ese directorio,
recrear la clave ni utilizar la firma debug para releases.

`~/.config/hidro-mejora/signing/release.env` contiene exclusivamente:

- `HM_RELEASE_STORE_FILE`: ruta absoluta del keystore externo.
- `HM_RELEASE_STORE_PASSWORD`: contraseña privada del keystore.
- `HM_RELEASE_KEY_ALIAS`: alias privado existente.
- `HM_RELEASE_KEY_PASSWORD`: contraseña privada de la clave.

El script lee este archivo sin ejecutarlo ni imprimirlo. Se puede elegir otro
archivo privado externo con `HM_RELEASE_ENV_FILE`, o proporcionar las cuatro
variables en el entorno. No pasar secretos como argumentos `-P` ni activar
`set -x`. No copiar credenciales al repositorio, logs, tickets o GitHub.

[android/release-certificate.sha256](../android/release-certificate.sha256) contiene únicamente el fingerprint público
SHA-256 del certificado. Es la referencia pública para comparar la firma de la APK
y es distinto del SHA-256 del archivo APK indicado arriba. Se puede versionar: no contiene la clave privada.
Gradle verifica ese fingerprint, la validez del certificado y el acceso a la
clave antes de compilar release. No cambiar el fingerprint para aceptar otra
clave: se perdería la compatibilidad de actualización de los APK distribuidos.

## Compilar

Desde Sedapal:

```bash
npm ci
npm run android:release
```

El proceso selecciona Java 21 sin cambiar Java global, configura la API y
Socket.IO en `https://hidro-mejora-api.onrender.com`, genera un runtime nuevo
exclusivamente desde Frontend, verifica que no haya código Admin y sincroniza
Capacitor. Después ejecuta `assembleRelease`, `testReleaseUnitTest`, `lintRelease`
y la compilación de los tests instrumentales debug. No modifica PostgreSQL.

No ejecutar un `cap sync` local/emulador entre la generación del runtime de
producción y la compilación release. Utilizar siempre el script completo.
Las variables de desarrollo de `.env.android` permanecen independientes.

La APK se guarda en `artifacts/android/hidro-mejora-v1.0.0-release.apk`, junto
con su checksum. Cada build usa una salida nueva bajo `artifacts/android/builds/`.
Los logs locales ocultan los valores de firma. Si la APK de esa versión ya
existe, el script se detiene; no la sobrescribe. Una compilación exitosa no
sustituye las verificaciones del artefacto ni la prueba de la release en celular.

Para una actualización, incrementar `versionCode` y ajustar `versionName` en
`android/app/build.gradle`; conservar applicationId y exactamente la misma clave.
Por ejemplo, la próxima corrección puede ser código 3, versión 1.0.1.
Conservar APK distribuidos, SHA-256 y fingerprint público del certificado.

## Verificar antes de distribuir

- Ejecutar las pruebas JavaScript/configuración y la regresión de Perfil.
- Revisar pruebas unitarias Android y el informe lint generado.
- Verificar la firma con `apksigner verify --verbose --print-certs`.
- Comparar el SHA-256 del certificado con `android/release-certificate.sha256`.
- Revisar applicationId, versiones y `debuggable=false` en el manifiesto del APK.
- Comprobar runtime completo, sin Admin ni secretos; API/Socket.IO deben usar Render.
- No deben existir destinos API a 127.0.0.1, 10.0.2.2 o Cloudflare.
- `https://localhost` es el origen interno seguro de Capacitor; no es el backend.
- Comprobar checksum del APK y probar login, Perfil, PDF, permisos, Atrás y tiempo real
  en un teléfono físico con la release, no solo con el build debug.

## Cierre y publicación de futuras versiones en GitHub

Después de compilar, verificar e instalar la release en un dispositivo físico:

1. Revisar cambios y secretos; versionar solo configuración, scripts, documentación y fuentes legítimas. No incluir la APK, keystore, archivos privados ni respaldos en el commit.
2. Actualizar [CHANGELOG](../CHANGELOG.md), versionCode/versionName y la evidencia de validación de la nueva versión. No reemplazar los datos históricos de v1.0.0 con resultados de otro artefacto.
3. Crear el commit, subirlo y vincular el tag de la nueva versión exactamente a ese commit validado. No mover un tag distribuido para ocultar un cambio posterior.
4. Crear una GitHub Release con título Hidro-Mejora y versión; incluir compatibilidad, versionCode, alcance y SHA-256 real. Adjuntar solamente la APK firmada correspondiente.
5. Comprobar el asset publicado, descarga, tamaño y checksum desde una copia descargada; conservar APK anteriores e identidad de firma.

La documentación posterior puede avanzar en main sin modificar el tag ni la APK distribuida. GitHub Releases no actualiza automáticamente las instalaciones del celular.

## Primera instalación y futuras actualizaciones

La APK debug existente usa otro certificado y no puede actualizarse directamente
con esta release. Para pasar a release, el propietario debe retirar la debug e
instalar la release. Eso elimina el almacenamiento local de la debug; los datos
remotos de Neon permanecen. No desinstalar automáticamente ni modificar Neon.

Una vez instalada la primera release, las próximas APK firmadas con la misma
clave y con versionCode mayor se instalan como actualizaciones conservando el
almacenamiento de la aplicación. El sistema no añade un actualizador automático:
la distribución e instalación siguen siendo manuales.

## Respaldo seguro de la clave

Respaldar TODO `~/.config/hidro-mejora/signing/`: keystore, archivo privado de
credenciales y fingerprint. La clave y sus contraseñas son necesarias para
continuar distribuyendo actualizaciones. La clave debug no permite recuperarla.

Ejemplo de archivo cifrado con GnuPG, fuera del repositorio. Solicita una
contraseña de respaldo de forma interactiva; no escribirla en el comando:

```bash
umask 077
mkdir -p "$HOME/.config/hidro-mejora/recovery"
chmod 700 "$HOME/.config/hidro-mejora/recovery"
HIDRO_SIGNING_BACKUP="$HOME/.config/hidro-mejora/recovery/signing-$(date +%Y%m%d_%H%M%S).tar.gpg"
(set -o pipefail; tar -C "$HOME/.config/hidro-mejora" -cf - signing |
  gpg --symmetric --cipher-algo AES256 --output "$HIDRO_SIGNING_BACKUP")
```

Guardar al menos una copia cifrada en un medio independiente del equipo.
Guardar la contraseña de respaldo en un gestor de contraseñas separado y
comprobar que se puede descifrar/listar el archivo antes de darlo por válido:

```bash
(set -o pipefail; gpg --decrypt "$HIDRO_SIGNING_BACKUP" | tar -tf -)
```

Para comprobar una recuperación completa, extraer en un directorio privado
nuevo (700), no sobre la clave activa. Reaplicar 600 a los archivos, verificar
que el certificado coincide con el fingerprint público y comprobar la apertura
del keystore sin imprimir alias ni contraseñas. Si la ruta cambia al recuperar,
ajustar SOLO `HM_RELEASE_STORE_FILE` en la configuración privada.
Nunca subir el backup, el keystore o las credenciales a GitHub.

Cobertura de pruebas y distinción entre ejecución y compilación: [TESTING](TESTING.md).

Documentación Android: [firma](https://developer.android.com/studio/publish/app-signing)
y [versionado](https://developer.android.com/studio/publish/versioning).
