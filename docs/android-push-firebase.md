# Incorporación posterior de Firebase y pruebas físicas

Esta guía **no autoriza crear proyectos, activar push ni publicar una APK**. Integración de laboratorio desactivada por defecto. No se reutilizó el proyecto Google de Gmail como Firebase por suposición.

1. El propietario debe identificar y autorizar un proyecto Firebase existente. No habilitar facturación ni otros productos. Registrar Android exactamente como `pe.edu.hidromejora.app`, conservando la firma permanente; no crear otra aplicación Hidro-Mejora ni otro keystore. Seguir la [guía oficial Capacitor 7](https://capacitorjs.com/docs/v7/apis/push-notifications).
2. Guardar el google-services.json autorizado en un directorio privado fuera del repo, permisos 600. Solo al preparar una compilación autorizada colocar una copia temporal en `android/app/google-services.json`, ignorada por Git. No subirla ni adjuntarla al PR. Una compilación normal sin archivo debe seguir funcionando. Para habilitar el bridge de registro en esa compilación es necesario también `HM_PUSH_ANDROID_ENABLED=1`; no usarlo ahora con una configuración inventada.
3. La credencial de servidor debe permanecer fuera de Android, Frontend, Git y Vercel. Usar una cuenta de servicio limitada al proyecto autorizado y al envío FCM; revisar el permiso `cloudmessaging.messages.create` y el [rol FCM API Admin documentado](https://docs.cloud.google.com/iam/docs/roles-permissions/firebasecloudmessaging), evitando Owner/Editor generales. El adaptador actual admite archivo de servicio privado externo 600 y OAuth `https://www.googleapis.com/auth/firebase.messaging`; revisar preferencia por identidad administrada en una infraestructura que la permita, sin contratar servicios para este avance.
4. Preparar respaldo/restauración y revisar dependencias 007–012 antes de solicitar cualquier migración productiva. No ejecutar init.sql sobre datos existentes. La app, el centro y Socket.IO siguen operando con push cerrado; el alta de dispositivos solo se habilita después de aprobar esquema/configuración.
5. Preparar en un servidor autorizado las variables de `Backend/.env.example`: PUSH_ENABLED, PUSH_WORKER_ENABLED, PUSH_TOKEN_KEY independiente, PUSH_PROVIDER=fcm, PUSH_FIREBASE_PROJECT_ID, PUSH_SERVICE_ACCOUNT_FILE, PUSH_DATABASE_URL y PUSH_EXPECTED_DATABASE. PUSH_REAL_DELIVERY_ALLOWED permanece 0 hasta autorizar un envío. PUSH_REMINDERS_ENABLED permanece 0; no programar cron ni supervisor productivo desde esta rama.
6. Antes de un piloto real, revisar exclusivamente la cola push y sus TTL/asociaciones. No reactivar trabajos ambiguos automáticamente ni reenviar históricos. No mezclar cola de correo, recuperación de contraseña o pagos con push. [HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api) y [errores/reintentos](https://firebase.google.com/docs/cloud-messaging/error-codes).

## Prueba física posterior (requiere autorización)

No instalar ni reemplazar APK oficiales ahora. Primero conectar por USB y ejecutar solo `adb devices`; comprobar modelo y versión con comandos de lectura, sin enviar tokens a la terminal. Cuando exista autorización para una candidata y datos de laboratorio:

- Abrir Cuenta → Notificaciones de Hidro-Mejora. Comprobar explicación y que no apareció permiso al login. Denegar y verificar centro; después conceder voluntariamente desde el control o ajustes Android.
- Revisar canal en Ajustes sin fotografiar identificadores privados. Registrar dispositivo sin mostrar token en consola/logcat. Confirmar asociación cifrada al usuario/suministro del laboratorio.
- Enviar un único aviso genérico controlado y registrar por separado: aceptación HTTP v1, recepción visible, apertura y consulta backend autorizada. Probar primer plano, HOME/segundo plano y proceso cerrado normalmente. No llamar «FCM aprobado» a un callback/intent inyectado localmente.
- Pulsar aviso de recibo/incidencia/corte. Verificar que abre la sección correcta y vuelve a consultar datos. Probar cuenta distinta y logout: ningún aviso debe abrir datos de la cuenta anterior.
- Desactivar, cambiar de cuenta, revocar JWT y probar sin internet/reconexión. Confirmar retirada remota cuando vuelva la conexión; una revocación offline no puede comunicarse inmediatamente al servidor.
- Probar Android 13/14/15 y políticas reales del fabricante. Force-stop, Doze, batería y espacio privado pueden impedir o retrasar avisos; no prometer entrega con app forzada a detenerse. Consultar [factores de entrega Android](https://firebase.blog/posts/2024/07/understand-fcm-delivery-rates/). FCM no es un canal de emergencia garantizado.
- Capturar solo mensajes genéricos y datos de laboratorio; conservar evidencia privadamente. Comprobar SDK privado y campos del token sin imprimir sus valores. Mantener OTP, 2FA, PDF, pagos y sesión segura en las regresiones.

## Claves y operación

No rotar ninguna clave productiva existente. Para una futura rotación de PUSH_TOKEN_KEY: detener worker, retirar/cancelar asociaciones antiguas de forma autorizada o recifrarlas mediante procedimiento probado, introducir una clave nueva independiente y requerir re-registro voluntario/controlado. La clave_id impide descifrar con otra clave a ciegas. Conservar respaldo cifrado y revisar exposición en copias. No reutilizar claves JWT/TOTP/correo/recuperación.

Ningún proyecto, servicio de pago, credencial real o entrega remota se creó durante este avance.
