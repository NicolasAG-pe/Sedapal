# Notifications: transporte de correo (MS-02)

Proceso Node 22 independiente, sin dependencias npm, tablas ni credenciales de
Auth. Reutiliza los adaptadores Resend/Gmail existentes. Esta etapa extrae el
transporte de correo; la API de avisos y push todavía pertenecen al backend.

## Contrato transaccional

El propietario de `correo_outbox` sigue siendo Auth (por ahora alojado en el
backend anterior). Su worker reclama el trabajo, activa el vencimiento del OTP
y confirma COMMIT **antes** de llamar a Notifications. Después actualiza el
resultado únicamente si conserva el lease. Registro/reenvío/cancelación y
verificación no cambian. Notifications nunca recibe la conexión SQL, las claves
OTP/outbox ni el JWT.

`POST /internal/v1/email/deliver` recibe versión 1, proveedor fijado, envioId
UUID, mensaje JSON serializado y deadline. HMAC SHA-256 cubre método, path,
timestamp, nonce y bytes del cuerpo. El receptor rechaza firmas/fechas inválidas,
proveedor distinto, exceso de cuerpo y repetición del nonce. Máximo 16 solicitudes
concurrentes; memoria de nonces acotada. `/live` y `/ready` son locales al proceso;
readiness no certifica disponibilidad del proveedor externo.

El cliente realiza **un intento**. No reintenta HTTP ni sigue redirecciones.
Preserva `id` o errores `transitorio/permanente/ambiguo/caducado`; timeout,
respuesta inválida o caída producen ambigüedad. El worker original decide el
reintento: Resend conserva UUID idempotente; Gmail ambiguo termina y purga payload.
El proceso no promete entrega exactamente una vez ni deduplicación durable:
la coordinación durable está en la outbox de Auth. Reiniciar borra nonces en
memoria; solo el propietario autorizado puede iniciar nuevos intentos.

Presupuesto máximo por petición: 10 segundos, acotado además por el plazo SQL
convertido a presupuesto monótono por el worker. Los nodos requieren relojes
sincronizados; desfase se rechaza conservadoramente. Logs solo de arranque/error
de configuración, sin destinatario, mensaje, OTP o claves.

## Configuración

| Proceso | Variables |
|---|---|
| Notifications | NOTIFICATIONS_INTERNAL_SECRET (nueva, mínimo 32 bytes), EMAIL_PROVIDER=resend o gmail, PORT=3104 |
| Laboratorio | NODE_ENV=test, NOTIFICATIONS_DELIVERY_MODE=stub; solo destinatarios .invalid |
| Proveedor futuro | NOTIFICATIONS_DELIVERY_MODE=provider y NOTIFICATIONS_REAL_DELIVERY_ALLOWED=1, más las credenciales propias del adaptador |
| Worker Auth opt-in | NOTIFICATIONS_URL, NOTIFICATIONS_INTERNAL_SECRET; conserva clave outbox y rol SQL propios, no necesita credencial del proveedor |
| HTTP privado de laboratorio | NOTIFICATIONS_ALLOW_LOCAL_HTTP=1, NODE_ENV distinto de production; HTTPS fuera de laboratorio, salvo loopback |

Sin NOTIFICATIONS_URL, el worker conserva el adaptador anterior. Para volver al
modo anterior: detener ordenadamente el worker, quitar URL/configuración remota,
reponer su configuración privada de proveedor y reiniciarlo. No cambiar claves
ni vaciar la outbox; no repetir Gmail ambiguo.

```sh
docker build -f Backend/services/notifications/Dockerfile -t hidro-ms120-notifications:local Backend
# Archivo privado nuevo, fuera de Git, con las variables de laboratorio anteriores.
docker run -d --name NOMBRE_EXCLUSIVO --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true --env-file ARCHIVO_PRIVADO \
  hidro-ms120-notifications:local
docker exec NOMBRE_EXCLUSIVO node -e "fetch('http://127.0.0.1:3104/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
```

Para integrarlo con el worker usar una red interna exclusiva; no publicar 3104
ni exponer esta ruta mediante el futuro gateway. Producción exige TLS o mTLS
en el canal, rotación de secreto y autorización separada del propietario.

Pruebas: `notification-transport.test.cjs` pertenece a suite segura y
`notifications-postgres.cjs` a integración PostgreSQL 18 aislada. El segundo
arranca Notifications en otro PID, prueba OTP, parada/reinicio y respuesta
Gmail perdida sin segundo intento; no llama a proveedores externos.
