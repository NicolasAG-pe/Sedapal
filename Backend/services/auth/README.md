# Auth: proceso independiente (MS-03)

Proceso Node 22 independiente que conserva como unidad el dominio Auth:
login/registro de correo, JWT de sesión, OTP, 2FA, recuperación de contraseñas,
revocación y autorización por rol/suministro. Reutiliza los módulos de dominio
del monolito tal como `server.js` los compone (`two-factor`, `email-registration`,
`password-recovery`, `totp-crypto`, `outbox-crypto`, `email-provider`); NO importa
`server.js` y no expone rutas de Billing/Operations/Notifications/Realtime.

## Contrato

Las 27 rutas públicas son exactamente las del dominio Auth en el monolito:
mismos métodos, paths, JSON, códigos HTTP y límites (`/api/auth/*`, `/api/me/perfil`,
`/api/perfil/:suministro`, `PATCH /api/admin/usuarios/:id/estado`,
`PATCH /api/admin/suministros/:id/ubicacion`, más `/live` y `/ready`). La prueba
de inventario compara la lista completa y rechaza rutas ajenas.

La autenticación sigue siendo fail-closed: cada petición JWT relee
`usuarios`, `suministros` y `usuario_2fa` (`permiteSesion`) en PostgreSQL, igual
que el monolito. Los hooks de cierre de sockets (`cerrarSocketsUsuario`,
`cerrarSocketsSuministro`, `emitirPerfil`) son inyectables; por defecto solo
registran un log JSON (integración con Realtime pendiente de gateway).

Contrato interno `POST /internal/v1/auth/introspect`: Bearer original → identidad
vigente tras releer PostgreSQL. Firma HMAC SHA-256 sobre
`POST\nPATH\ntimestamp\nnonce\ncuerpo` con el mismo esquema de
`notification-transport`, cabeceras `X-Hidro-Time/Nonce/Signature`, ventana de
30 segundos, memoria de nonces acotada (10000) y cuerpo máximo 4096 bytes.
Nunca devuelve `clave_hash`, OTP, correo ni material de cifrado; los BIGINT de
PostgreSQL se normalizan a número en un único punto del contrato.

El consumidor usa `createIntrospector`: un único intento, sin redirecciones,
presupuesto de 5 segundos y lectura acotada a 1024 bytes. Sin confirmación
devuelve `null` y el consumidor aplica fail-closed por sí mismo (nunca autoriza
por ausencia). El estado vigente es de Auth: no hay caché permisiva.

`/live` comprueba el proceso; `/ready` ejecuta `SELECT 1 … LIMIT 0` sobre las
11 tablas Auth y reporta `degraded` si el esquema o los permisos fallan. No
certifica disponibilidad de proveedores externos.

## Configuración

| Proceso | Variables |
|---|---|
| Servicio Auth | AUTH_TOKEN_SECRET (obligatorio desde el arranque, mínimo 16 bytes), DATABASE_URL o variables de base, PORT=3100 |
| Introspección | AUTH_INTERNAL_SECRET (mínimo 32 bytes) exclusiva: rechaza igualdad con AUTH_TOKEN_SECRET, EMAIL_OTP_SECRET o EMAIL_OUTBOX_KEY |
| Consumidores futuros | AUTH_INTROSPECTION_URL, AUTH_INTERNAL_SECRET; HTTPS fuera de laboratorio, salvo loopback |
| HTTP privado de laboratorio | AUTH_ALLOW_LOCAL_HTTP=1 con NODE_ENV distinto de production |
| Correo (igual que el monolito) | EMAIL_PROVIDER, credenciales del adaptador, EMAIL_REGISTRATION_ENABLED, EMAIL_REGISTRATION_ALLOWED_EMAIL; sin ellas el registro queda cerrado y la recuperación degradada |

Arranque más estricto que el monolito: sin `AUTH_TOKEN_SECRET` el proceso no
inicia. Logs JSON solo de arranque/error de configuración; nunca JWT, OTP,
contraseñas, correo ni cuerpos. Puerto no publicado: este endpoint es interno.

## Ejecución local

```sh
docker build -f Backend/services/auth/Dockerfile -t hidro-ms120-auth:local Backend
# Archivo privado nuevo, fuera de Git, con DATABASE_URL sintético y AUTH_TOKEN_SECRET nuevo.
docker run -d --name NOMBRE_EXCLUSIVO --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true --env-file ARCHIVO_PRIVADO \
  hidro-ms120-auth:local
docker exec NOMBRE_EXCLUSIVO node -e "fetch('http://127.0.0.1:3100/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
```

Sin base de datos, `/ready` responde 503 `degraded` y `/live` 200: es el
comportamiento esperado. Para integrarlo con consumidores usar una red interna
exclusiva; no publicar 3100 ni exponer la introspección mediante el futuro
gateway. Producción exige TLS o mTLS en el canal, rotación de secreto y
comprobación de audiencia.

## Rollback

El servicio no altera esquema, migraciones ni roles; el monolito `server.js`
permanece intacto en esta rama. Para volver al modo anterior basta detener el
servicio y no usarlo: ninguna ruta ni variable del backend cambia. Los
consumidores que aún no existen dependen de la introspección; hasta que el
gateway la adopte, ningún cliente público depende de este proceso.

Pruebas: `auth-service.test.cjs` pertenece a la suite segura (inventario de
rutas, paridad de `requiereAuth`/JWT, introspección fail-closed, hooks, salud,
configuración). `auth-service-postgres.cjs` es integración PostgreSQL 18 aislada:
OTP → outbox → entrega simulada → verificación → login → sesión → 2FA completa →
introspección → cambio de contraseña → revocación admin → reinicio conservando
revocación; no llama a proveedores externos.
