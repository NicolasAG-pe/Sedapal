# Preparación Firebase FCM 1.2.0

Base comprobada: PR #18, commit `1fbaffaf3fc904877a34f088e480c2fcac0261db`, publicado
y árbol original limpio. Rama `feature/firebase-fcm-piloto-120`, worktree separado.
El PR #17 es ancestro y su implementación se conserva. Sin merges ni cambios en
las ramas anteriores.

Este documento conserva los resultados de la preparación inicial. El único envío
remoto autorizado posteriormente se documenta por separado en
[`firebase-fcm-envio-unico-120.md`](firebase-fcm-envio-unico-120.md), sin ampliar su
autorización a otros mensajes o escenarios.

## Resultado comprobado

El JSON descargado coincide con el proyecto HidroMejora-Push-Dev y la app Android
autorizada. No se publican sus valores, App ID completo, API keys ni Sender ID.
Copia privada externa 600/directorio 700; JSON de compilación ignorado y retirado
después del build. No hay un nuevo proyecto Firebase.

APK debug independiente compilada con el flag Firebase solo en ese proceso.
Plugin oficial Capacitor 7 existente, sin cambios de dependencias ni Gradle. Se
comprobó el manifest final: `POST_NOTIFICATIONS`, target API35, app depurable y
receptor FCM. `BuildConfig.HM_PUSH_CONFIGURED=true` en la candidata; otra compilación
normal sin JSON ni flag pasó y devuelve `false`.

Identidad dedicada preparada en Firebase/IAM: un permiso de envío y un permiso de
obtención de tokens ligado al operador sobre esa cuenta, con vencimiento de siete
días. IAM e IAM Credentials habilitadas, facturación desactivada, cero claves
USER_MANAGED y cero tokens OAuth del remitente acuñados. No se usa la cuenta
administrativa automática como remitente. Detalle operativo en
[`docs/firebase-fcm-piloto.md`](../firebase-fcm-piloto.md).

Cambios remotos comprobados de nuevo en solo lectura antes de publicar:

| Recurso | Cambio durante la preparación |
| --- | --- |
| Cuenta de servicio `hm-fcm-pilot-120` | Nueva identidad dedicada habilitada, sin claves USER_MANAGED |
| Rol personalizado `hmFcmPilotSender` | Creado con `cloudmessaging.messages.create` y asignado solo a la cuenta dedicada en el proyecto autorizado |
| Rol personalizado `hmFcmPilotTokenMinter` | Creado con `iam.serviceAccounts.getAccessToken`, asignado al operador solo sobre esa cuenta |
| Condición del operador | Vence el `2026-11-03T03:39:32.179Z`; no se concedió obtención de tokens a nivel de proyecto |
| APIs IAM e IAM Credentials | `iam.googleapis.com` e `iamcredentials.googleapis.com` habilitadas |
| FCM HTTP v1 / facturación | FCM ya habilitada, sin cambio; facturación desactivada y sin cuenta vinculada |

No se reutilizó la cuenta Firebase Admin SDK como remitente, no se crearon claves
privadas permanentes y no se enviaron mensajes. La auditoría local en
`artifacts/firebase-remote-audit.json` conserva solo metadatos seleccionados;
no contiene tokens, claves ni la identidad personal del operador.

## Pruebas

| Grupo | Resultado |
| --- | --- |
| Push, esquema 012, seguimiento 013, credenciales temporales y validador SDK | 32 aprobadas, cero fallidas |
| Regresión OTP, 2FA, recuperación, sesión, documentos, HidroBot, configuración, push e incidencias E2E/Socket.IO | 101 aprobadas, cero fallidas |
| Gradle candidato Firebase | assembleDebug, assembleDebugAndroidTest, testDebugUnitTest y lintDebug aprobados |
| JUnit | 4 aprobadas; lint: cero errores y 16 advertencias preexistentes |
| Compilación normal sin configuración Firebase | assembleDebug aprobado; flag nativo false |
| Android 15/API35, AVD nuevo exclusivo | 8 comprobaciones, cero errores; incluye Keystore instrumental 1/1 y registro FCM real |
| Android 13/API33 y 14/API34 | Pendientes: descarga/preparación de imágenes oficiales abortada por falta de espacio; no se declaran probados |
| Entrega FCM real / recepción / apertura remota | No ejecutadas; requieren autorización explícita |

Los dos grupos Node enumeran archivos distintos. JUnit, instrumentación y
comprobaciones funcionales se reportan por separado, sin sumar ejecuciones repetidas.
Cada suite usa nuevas bases sintéticas en el contenedor exclusivo del piloto;
011/012/013 se comprueban solo allí. Se conservan datos de laboratorio y originales.

En Android 15 se comprobó: login sin prompt ni alta automática; denegación; permiso
concedido desde Cuenta; registro **real** mediante SDK/plugin originales; token
cifrado AES-GCM en PostgreSQL y ausente de logcat; canal; restauración Keystore;
desactivación con retiro de ciphertext; cambio de usuario sin heredar consentimiento;
registro voluntario de segunda cuenta y logout con revocación. No se inyectaron
callbacks ni tokens sintéticos en esta prueba de registro. No hubo mensajes enviados.
No se afirma comprobación física de Android 13/14/15 ni recepción remota.

Los flags de entrega, worker y recordatorios se fijaron a cero en el harness. La API
ofrece registro por proveedor mock; ningún worker entrega mensajes. Las pruebas
HTTP v1/OAuth de Node usan transporte simulado y fixtures sin credenciales reales.

## Evidencia local y fallos resueltos

Evidencia privada del worktree: `artifacts/fcm-backend.log`, `fcm-regression.log`,
`fcm-native-api35.log`, `fcm-default-off.log`, `fcm-build-ZQJg0L/` y
`android-session-native-mahu8a/result.json`. Capturas y APK solo locales.

Las primeras ejecuciones dentro del sandbox no pudieron conectar servicios o
iniciar procesos; se repitieron con acceso al laboratorio. El primer harness nativo
encontró el tutorial abierto al navegar a Cuenta: ahora espera su apertura y lo
cierra con «Omitir», como las pruebas previas, sin desactivar funciones del producto.
La repetición aprobó y conservó la aserción de un solo socket. El AVD nuevo necesitó
disco fuera de `/tmp`; no se tocaron emuladores anteriores. La instalación adicional
de imágenes 13/14 no se completó por espacio y queda pendiente, sin borrar datos.

APK oficiales 1.1.1 y 1.1.2: SHA-256 comprobados contra las referencias previas, sin
cambios. El checkout original permanece limpio. No se leen `.env` productivos, no
se accede a Neon y no se modifican servicios/configuraciones remotas de
Render/Vercel/Kubernetes. La configuración Vercel
de ambos directorios excluye la nueva rama. GitHub: cero workflows y webhooks;
consulta Vercel de la rama antes del push: cero despliegues. Workspace de Render
confirmado por el propietario y consultado solo en lectura: servicio en `main`,
`autoDeploy=no`, generación de previews `off`; último despliegue del 23 de octubre,
sin publicaciones de esta rama. No se cambió configuración remota para publicar.

## Archivos modificados

- Backend: `push-provider.js`, nuevo `push-credentials.js`, ayuda de
  `workers/push.cjs`, `test/push-credentials.cjs`, puerto opcional solo en
  `test/email-api.cjs` y `.env.example` sin valores privados.
- Laboratorio Android: `scripts/build-android-fcm-lab.cjs`,
  `scripts/test/android-fcm-registration-native.cjs`, extensión opt-in de
  `scripts/test/android-session-native.cjs` y `scripts/test/firebase-lab.cjs`.
- Publicación/documentación: `.gitignore`, `package.json`, ambos `vercel.json`,
  `CHANGELOG.md`, esta guía y `docs/firebase-fcm-piloto.md` (17 archivos en total).

## Siguiente avance

Obtener aprobación para **un único mensaje** con la identidad dedicada y token OAuth
de 15 minutos, después de revisar el Draft PR dependiente de #18.
Verificar bandeja, toque y autorización REST, diferenciando aceptación de recepción.
No generar claves permanentes, activar facturación, desplegar ni aplicar SQL productivo.
