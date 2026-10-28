# Hidro-Mejora 1.2.0 — guía de la candidata LAB

**Preparada para autorizar una prueba física posterior. No instalada en ningún
celular, no release ni aprobación productiva.** Dependiente del Draft PR #20.

## Candidata exacta

- Nombre: **Hidro-Mejora LAB**, con franja acuática «LAB · 1.2.0 · Datos sintéticos».
- Paquete independiente: `pe.edu.hidromejora.app.lab120`.
- Versión: `1.2.0-lab.1`, código 5, minSdk23/targetSdk35, Capacitor7.
- APK local privada:
  `/home/nico/.local/share/hidromejora/android-lab-120/worktree/artifacts/android-physical-lab-xm6xsg/app/outputs/apk/lab/app-lab.apk`.
- SHA-256 APK:
  `554b7d9faa94afa58bea550dda2dcd398b9f1e429ba42d5e64001aea5cffff04`.
- Certificado de desarrollo LAB, SHA-256:
  `a197ef7a048250edf8d1a27d6d74dc633eea2928365ec71618376d389eb2f4bd`.

La clave de firma LAB y su configuración están fuera de Git, en el directorio
privado del laboratorio con modo600. Conservarlas para futuras actualizaciones
LAB; nunca reemplazarlas por la firma permanente. Un conflicto de firma debe
investigarse, sin desinstalar la oficial ni borrar sus datos. El FileProvider,
UID, almacenamiento y alias Keystore usan el paquete propio. La coexistencia
física con la oficial queda pendiente, no se simula como prueba completada.

## Antes de autorizar la instalación

Solicitar únicamente:

1. Marca/modelo, versión Android y parche de seguridad.
2. Versión de Android System WebView/Chrome y espacio libre aproximado.
3. Confirmación de si la aplicación oficial está instalada y si ya existe alguna
   candidata con nombre LAB; no pedir credenciales ni datos de esa instalación.
4. Disponibilidad de cable USB de datos y aceptación de activar temporalmente
   depuración USB, autorizando solo esta computadora Debian.
5. Alias del equipo de prueba y autorización explícita de instalar **este hash**.

No se necesita IMEI, número telefónico, datos personales, tokens ni cuenta real.
El serial ADB se seleccionará localmente cuando exista autorización; no se
publica en el PR. No operar todos los dispositivos ni usar ADB sin `-s`.

## Preparar la conexión privada

Esta candidata funciona **solo conectada por USB**. No sirve con la IP Wi-Fi del
PC ni con Render/Neon. La API es Node local, PostgreSQL exclusivamente sintético.
No se modifica Kind, Docker Compose existente, firewall ni router.

Desde el worktree persistente:

```bash
cd /home/nico/.local/share/hidromejora/android-lab-120/worktree
docker start hm-physical-120-pg
node scripts/android-physical-lab-server.cjs --start
```

La API escucha exclusivamente en `127.0.0.1:45679`; PostgreSQL, en
`127.0.0.1:45680`. No volver a ejecutar `--init`: el estado y volumen ya existen.
Al reanudar, no se vacía ni se reinicializa ninguna base. No leer `.env` de
producción. El panel Admin de laboratorio puede abrirse localmente, sin usar el panel de
producción ni alterar los puertos existentes:

```bash
API_BASE_URL=http://127.0.0.1:45679 node scripts/build-web.js admin
python3 -m http.server 45681 --bind 127.0.0.1 --directory artifacts/web/admin
```

Abrir `http://127.0.0.1:45681` y usar únicamente la cuenta sintética Admin.
Detener ese servidor con Ctrl+C al terminar. Las cuentas sintéticas y contraseñas se consultan solo localmente en
`/home/nico/.local/share/hidromejora/android-lab-120/private/lab-accounts.json`.

**Solo después de autorización física**, en otra terminal:

```bash
# Elegir localmente el serial autorizado; nunca dejar selección implícita.
HM_LAB_PHONE='SERIAL_AUTORIZADO'
HM_LAB_APK='/home/nico/.local/share/hidromejora/android-lab-120/worktree/artifacts/android-physical-lab-xm6xsg/app/outputs/apk/lab/app-lab.apk'
sha256sum "$HM_LAB_APK"
adb -s "$HM_LAB_PHONE" get-state
adb -s "$HM_LAB_PHONE" shell pm path pe.edu.hidromejora.app.lab120
# Si existe el paquete LAB, detenerse y revisar versión/certificado antes de actualizar.
adb -s "$HM_LAB_PHONE" reverse tcp:45679 tcp:45679
adb -s "$HM_LAB_PHONE" reverse --list
adb -s "$HM_LAB_PHONE" install "$HM_LAB_APK"
```

Comprobar el hash y certificado con `apksigner verify --print-certs` antes de la
instalación. Sin `-r` en una instalación inicial. No usar comandos sobre
`pe.edu.hidromejora.app`, ni intentar resolver errores cambiando firmas.

El tramo HTTP queda en loopback y en el cable ADB autorizado; no es TLS de
extremo a extremo ni un túnel de Internet. El debug habilita inspección desde
una computadora autorizada: no usar equipos compartidos ni datos reales.
Al desconectar USB el backend deja de estar disponible, como está previsto.

## Recorrido físico propuesto

Usar solo cuentas/datos sintéticos; anotar Android/WebView, resultado y captura
sin contraseñas. Primero login, restauración de sesión, Omitir tutorial y cinco
cierres/reaperturas rápidos. Verificar replay y cambiar entre dos cuentas.

Luego Inicio, recibos/PDF/selector de archivos, incidencias/foto/ubicación y
seguimiento, avisos internos y Socket.IO. Probar Atrás, teclado, rotación,
recorte/barras del sistema, zoom/TalkBack, bloqueo/desbloqueo y recuperación
tras retirar y reconectar USB. Usar imágenes sintéticas, no la galería privada.

El laboratorio parte de cuentas sintéticas, sin historial financiero inventado;
los estados vacíos son válidos. Para probar documentos crear un recibo sintético
con el Admin auténtico en laboratorio; no marcarlo como dinero bancario recibido.
Las demostraciones siguen identificadas como tales; Yape/revisión manual están
deshabilitados en esta candidata de backend. No realizar transferencias reales.

FCM real y registro nativo permanecen desactivados para este nuevo paquete; las
notificaciones internas y Socket.IO se conservan. No copiar el SDK JSON del
paquete oficial a LAB. Un piloto FCM para LAB requeriría registrar expresamente
otra app en el mismo proyecto y autorización independiente; no está hecho.

OTP/recuperación no mandan correo. Solo si se quiere recorrerlos, usar correos
`@example.invalid` y ejecutar localmente:

```bash
node scripts/android-lab-private-operations.cjs simulate-mail
```

El adaptador local usa los procesadores originales y guarda los códigos en un
archivo privado `operation-*/simulated-mail.json`, sin imprimirlos. Su estado
«aceptado» representa **aceptación simulada local**, nunca entrega de correo.
No hay worker continuo ni claves de proveedor; nunca se usa una dirección real.
2FA TOTP puede probarse localmente con identidad sintética, conservando sus
códigos de recuperación en privado. No inscribir cuentas reales.

## Recuperación y conservación

Antes de un recorrido con cambios sintéticos:

```bash
node scripts/android-lab-private-operations.cjs backup
# Comprobación opcional: crea y restaura en OTRA base nueva, conserva la original.
node scripts/android-lab-private-operations.cjs verify-restore
```

Los dumps, hash/resultados y copia del estado para la base restaurada quedan
privados. El verificador no cambia el destino del backend. Para una recuperación
operativa detener primero la API y revisar la copia `restored-backend-state.json`;
una sustitución del estado actual debe conservarlo con otro nombre y ser revisada
explícitamente antes de reanudar. No restaurar sobre una base existente, no usar
Neon y no borrar volumen, respaldos o evidencias. No copiar claves a Git.

Si falla la conexión: comprobar proceso API, contenedor LAB, autorización USB y
regla reverse del dispositivo seleccionado. Repetir la conexión no autoriza
repetir operaciones de negocio. Ante firma distinta, detenerse y conservar datos.

## Cierre y desinstalación segura posterior

Cerrar sesión LAB; detener la API con Ctrl+C y el contenedor con
`docker stop hm-physical-120-pg` si no lo usa otra prueba. No usar `down -v`, prune,
rm, clear ni comandos globales. Guardar capturas, hashes y resultados.

Después del ensayo físico autorizado, retirar solo su regla reverse:

```bash
adb -s "$HM_LAB_PHONE" reverse --remove tcp:45679
```

Desactivar depuración USB y revocar la autorización de esta computadora desde
Opciones de desarrollador. Para retirar la candidata, respaldar primero el
laboratorio y pedir autorización de borrar **solo sus datos locales LAB**:

```bash
# Únicamente cuando se autorice su desinstalación:
adb -s "$HM_LAB_PHONE" uninstall pe.edu.hidromejora.app.lab120
```

La desinstalación elimina el Keystore y datos locales LAB; no toca la aplicación
oficial ni la base PostgreSQL. Estas instrucciones no autorizan ejecutarla hoy.

## Límites de preparación

Android15 probado en emulador; 13/14, equipos ARM físicos, cámara/visor reales,
TalkBack, batería/Doze y comportamiento OEM siguen pendientes. No se promete
recepción FCM en esta candidata desactivada ni acceso por red móvil. Informes,
logs, APK y capturas actuales: `artifacts/android-physical-preparation/`,
`physical-native-8o6z1W/` y `android-physical-lab-xm6xsg/`, privados y fuera de Git.

Referencias primarias: [variantes Android](https://developer.android.com/build/build-variants),
[acceso a servidores locales por USB](https://developer.chrome.com/docs/devtools/remote-debugging/local-server).
