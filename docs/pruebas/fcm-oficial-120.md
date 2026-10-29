# FCM oficial 1.2.0 — preparación y puertas de publicación

## Diagnóstico comprobado

La candidata oficial anterior conserva el plugin Capacitor 7 y el manifiesto push, pero se compiló sin la configuración privada Google Services y sin `HM_PUSH_ANDROID_ENABLED=1`. El indicador nativo devuelve `configured=false`. Render mantiene el registro y las entregas cerrados, y su supervisor original inicia únicamente API y correo. No es una prueba de fallo de recepción de Firebase.

## Cambio acotado

- `npm run android:fcm:release -- --config /ruta/privada/google-services.json` reutiliza el constructor release, la configuración validada del piloto y el certificado permanente. Requiere otro worktree y conserva 1.2.0/código6, paquete original y API HTTPS productiva. La copia local Google Services es efímera e ignorada por Git; el original privado permanece.
- El supervisor inicia opcionalmente el worker existente con `PUSH_WORKER_SHARED_CONTAINER=1`, `PUSH_WORKER_ENABLED=1` y `PUSH_ENABLED=1`. Espera readiness y detiene sus propios hijos ante fallos; no reinicia envíos dentro del proceso. No hay un servicio Render adicional.
- El proceso push recibe solo variables push y NODE_ENV; la API y el worker de correo no reciben la clave privada FCM. La API conserva únicamente la clave de cifrado de tokens necesaria para el registro.
- La identidad debe coincidir exactamente con la cuenta dedicada declarada y el proyecto. Se conserva el scope `firebase.messaging`, el adaptador HTTP v1 y el cifrado GCM de tokens. El rol remoto debe verificarse antes de activar envíos: solo `cloudmessaging.messages.create`.
- Se añade prioridad Android alta a mensajes genéricos visibles, sin datos personales. El toque continúa resolviendo el evento mediante REST autorizado, sin confiar en el contenido de FCM.

No hay migraciones, cambios de versión, cambios en Kubernetes ni reconstrucción del panel Admin. No se cambian JWT, Gmail ni PostgreSQL.

## Credencial y límites de Render Free

La identidad OIDC administrada de Render exige un workspace Pro. Free puede utilizar el secreto privado de una cuenta dedicada, únicamente si el propietario autoriza expresamente la creación de la clave. El secreto de runtime `PUSH_SERVICE_ACCOUNT_JSON` se materializa como copia efímera 0600 en directorio 0700 y se retira al terminar el contenedor. No debe ser build arg ni archivo del repositorio. La alternativa temporal del piloto caduca y no resuelve el envío continuo.

Free suspende el servicio tras 15 minutos sin tráfico entrante. El worker compartido procesa la cola cuando el servicio está activo; no garantiza ejecución de vencimientos a una hora exacta mientras duerme. No se configura un servicio de pago ni un mecanismo de tráfico artificial. Durante las pruebas `PUSH_REMINDERS_ENABLED=0`; la programación automática debe quedar explícitamente resuelta antes de anunciar recordatorios desatendidos.

Referencias: [OIDC Render](https://render.com/docs/oidc), [límites Free](https://render.com/docs/free), [prioridad Android](https://firebase.google.com/docs/cloud-messaging/android-message-priority).

## Prueba física pendiente y control de envíos

Dispositivo USB identificado como POCO M4 Pro, Android13/API33. Preflight de solo lectura: paquete oficial, 1.2.0/código6 y certificado permanente coincidentes con la candidata anterior. Se conserva una copia privada de la APK instalada. La actualización posterior con Firebase fue aceptada mediante `adb install -r` con código6 igual: UID y primera instalación se conservaron. Sin desinstalación ni borrado de datos; continuidad visible de sesión/datos y recepción todavía por comprobar.

La actualización permitida es `adb -s <POCO_AUTORIZADO> install -r <NUEVA_APK_FIRMADA>`, tras verificar nuevamente paquete, versión y firma. Nunca `uninstall`, `pm clear`, `-d`, `-g` ni una firma debug. Comprobar UID, primera instalación y continuidad visible de datos/sesión después del reemplazo. Una negativa del instalador se informa sin forzarla.

Antes del único envío autorizado: consentimiento en la aplicación, permiso Android, canal `hm_updates`, registro FCM auténtico, exactamente un destinatario identificado y ninguna entrega previa pendiente. Worker continuo y recordatorios apagados durante la prueba. Título `Hidro-Mejora`; texto `Tu incidencia tiene una actualización.`. Una sola invocación HTTP v1, sin reintento automático ante fallo o ambigüedad. Conservar evidencia privada de aceptación, bandeja real, toque y consulta REST autorizada. Reutilizar regresiones sintéticas para cambio de cuenta/revocación; no fingir una segunda entrega física.

Un mensaje recibido en bandeja con la app en segundo plano prueba ese estado. El cierre normal se apoya adicionalmente en la ruta estándar notification+data del SDK; no se declara recepción en otro estado físico si no se probó. Forzar detención y restricciones del fabricante pueden impedir entregas hasta reabrir la app.

## Verificación dirigida

- 19 pruebas unitarias iniciales aprobadas: credenciales temporales/dedicadas, permisos de archivo, supervisor y configuración del piloto.
- 17 regresiones PostgreSQL aprobadas: registro/consentimiento, cifrado, preferencias, separación de suministros, revocación, concurrencia, caducidad, eventos y convivencia del correo.
- Prueba nueva de procesos auténticos push/API con PostgreSQL sintético aprobada: readiness anterior a health y cierre coordinado por caída del worker. El primer intento detectó una carrera del harness entre spawn y listen; se corrigió la espera de health sin cambiar su aserción.
- 11 comprobaciones adicionales aprobadas de firma/configuración release, identidad Android y constructor privado. Nueva compilación release aprobada: JUnit 4/4, lint sin errores y compilación de fuentes instrumentales. Recursos Firebase y flag nativo verificados en la APK; prueba física de recepción todavía pendiente.

## Puertas abiertas

1. El propietario autorizó una única clave dedicada. Creación verificada: una clave USER_MANAGED activa, cuenta con solo envío FCM, archivo0600/directorio0700 fuera del repositorio y permisos del operador para revocación/rotación comprobados. Sin cambios de roles, APIs ni facturación.
2. APK Firebase firmada verificada: 1.2.0/código6, paquete y certificado permanentes, sin debug ni secretos de servidor. SHA-256 `e2072839b0005e0d4c8835a30a7b693aab6679cfa4e45bdd7e42ea26c5a243a5`.
3. Reemplazo físico aceptado; falta comprobar sesión/datos visibles y recepción real del único mensaje.
4. Revisión final del diff/secretos, PR, integración y despliegue exacto; no atribuir una aprobación de colaborador que no exista.
5. Release v1.2.0 con APK nueva y hash propio solo después de las puertas críticas. Los envíos y recordatorios siguen desactivados durante esta preparación.

## Envío único y recuperación de credencial

El worker admite `deliveryId` explícito y `singleAttempt:true` únicamente con ese identificador válido. En esta modalidad no reclama otras entregas, no reintenta fallos transitorios y una segunda ejecución no vuelve a enviar. Prueba PostgreSQL añadida y 15 regresiones del worker aprobadas; total acumulado49 comprobaciones dirigidas. No cambia el comportamiento normal de la cola.

La prueba usa el mismo adaptador/worker desde el operador controlado, mientras el worker continuo de Render permanece apagado. El envío real se protege además con un marcador persistente creado antes de llamar a HTTP v1. No se usa el CLI global `--once`, que podría reclamar otro trabajo.

Revocación: apagar entregas/worker y desplegar esa configuración, deshabilitar o eliminar exclusivamente el identificador de la clave dedicada con IAM, verificar su estado y conservar la evidencia sin revelar el JSON. Rotación futura: bajo autorización, crear sustituta de la misma cuenta/rol, guardar como secreto privado, desplegar y comprobar OAuth sin enviar avisos; retirar la clave anterior. Nunca rotar JWT/Gmail/PostgreSQL ni reutilizar una identidad administrativa. Los tokens OAuth emitidos pueden permanecer válidos hasta su vencimiento; detener el worker contiene el envío inmediatamente. No se ha ejecutado una rotación ni revocación real de la única clave activa.
