# Gmail API para OTP — preparación, sin activación productiva

El worker admite `EMAIL_PROVIDER=gmail`; Resend continúa como valor predeterminado.
No se ha activado Gmail, registro OTP ni worker en Render y no se enviaron correos reales.
No se consultó ni modificó Neon en esta preparación. Gmail no necesita un dominio
comprado para enviar desde la cuenta Gmail autorizada a Gmail, Outlook o Hotmail;
siguen aplicándose cuotas, políticas antispam y la posibilidad de rechazo del destinatario.

## Estado de Google Cloud

La cuenta remitente fue confirmada expresamente por el propietario. La CLI
administrativa está autenticada con esa misma cuenta y un único **My First Project**
activo fue identificado por su ID. Gmail API ya figuraba habilitada; no se repitió
la habilitación ni se crearon recursos adicionales.

Google tokeninfo comprobó la identidad de la sesión Cloud existente y su email
verificado. El email, el identificador Google inmutable y el proyecto se guardaron
solo en `~/.config/hidro-mejora/gmail/authorized-sender.json` (0600, carpeta 0700),
sin guardar ese access token ni ampliar permisos del futuro cliente Gmail.
El conector Gmail pertenece a otra cuenta y no se usa como remitente ni se reutilizan
sus tokens. Las identidades privadas no se publican en esta guía.

La CLI está en `~/.local/share/hidro-mejora/google-cloud-sdk/bin/gcloud`, con
configuración privada separada en `~/.config/hidro-mejora/google-cloud/`, sin cambios
al PATH/Debian y con estadísticas desactivadas. No hace falta repetir el login.

**Punto de parada: cliente OAuth de escritorio y consentimiento.** No hay navegador
conectado que el agente pueda controlar ni un JSON de cliente descargado disponible.
No se pudo crear/comprobar la pantalla OAuth o el cliente y todavía no existen tokens
Gmail del backend. Para automatizar las pantallas hace falta conectar el navegador
con Google Cloud a la sesión; el propietario realiza el consentimiento y cualquier
aceptación de políticas. No se usa el cliente del SDK Cloud, un cliente IAP ni una
cuenta de servicio como sustituto del cliente Gmail del proyecto.

Si el propietario prefiere completar solo la preparación inicial en su navegador:

1. Abrir [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com),
   elegir el proyecto existente **My First Project** y comprobar su ID;
   la habilitación de Gmail API ya está comprobada, no repetirla.
   No crear otro proyecto, habilitar facturación ni contratar servicios.
2. [Google Auth Platform](https://console.cloud.google.com/auth/overview): nombre
   `Hidro-Mejora OTP`, soporte/contacto del propietario. Para Gmail personal,
   audiencia **Externa / Testing** y agregar únicamente la cuenta remitente como
   usuario de prueba. Los destinatarios de OTP no necesitan ser usuarios de prueba OAuth.
3. **Acceso a los datos → Añadir o quitar permisos**: exclusivamente
   `https://www.googleapis.com/auth/gmail.send`. No `gmail.readonly`, `gmail.modify`,
   `gmail.compose`, `mail.google.com`, `openid` ni permisos de perfil adicionales.
4. **Clientes → Crear cliente → Aplicación de escritorio**; nombre
   `Hidro-Mejora OTP local`. Descargar JSON y guardarlo privadamente con modo `0600`
   en la carpeta `~/.config/hidro-mejora/gmail/` (modo `0700`). No crear cuenta de
   servicio ni delegación de dominio para una cuenta Gmail personal.

Los nombres de botones deben contrastarse con la pantalla real antes de operar.
La guía no certifica que esas acciones ya se hayan ejecutado.

## Autorización local automatizada, sin enviar

La carpeta privada anterior y la identidad autorizada están preparadas, todavía sin tokens Gmail.
También existe `worker.env` privado (0600), fijado al remitente confirmado y con
registro/worker en 0; no se carga automáticamente. `authorize.sh` privado (0700)
ejecuta el flujo con esa cuenta una vez guardado el JSON oficial como `desktop.json`. Una vez disponible
el JSON oficial del cliente de escritorio:

```sh
node scripts/gmail-oauth.cjs \
  --client-file "$HOME/.config/hidro-mejora/gmail/desktop.json" \
  --sender 'REMITENTE_AUTORIZADO@gmail.com' \
  --output "$HOME/.config/hidro-mejora/gmail/credentials.json"
```

El programa genera un enlace oficial de Google y espera el consentimiento en un
listener temporal `127.0.0.1`, puerto aleatorio, con `state` y PKCE S256. Nunca pide
la contraseña, imprime tokens ni registra el callback/código. Abre ese enlace,
selecciona la cuenta remitente y concede exclusivamente **Enviar correo**.
No solicita permisos del conector Gmail ni reutiliza sus credenciales.

Comprueba audience y scope con tokeninfo por HTTPS/Authorization. Exige un email
Google que coincida con el remitente o, si Google omite email con `gmail.send`, un
subject idéntico a la identidad Google previamente comprobada y guardada en el
archivo privado. La pista `login_hint` o mirar manualmente la pantalla no sustituyen
esa verificación. Si no hay identidad comprobable, se detiene sin guardar el refresh
token; no se solicita lectura del buzón, perfil ni scopes adicionales para forzarlo.

Cuando existe `authorized-sender.json`, también exige que el JSON de escritorio
corresponda al proyecto autorizado antes de abrir la autorización. El worker solo
acepta credenciales marcadas como identidad verificada por tokeninfo y remitente
exacto. El envío usa además `users/REMITENTE/messages/send`, no `users/me`.

El resultado guarda exclusivamente el refresh token y configuración del cliente
necesaria en `credentials.json` (modo `0600`); los access tokens solo viven en memoria.
Rechaza archivos legibles por grupo/otros, de otro propietario, enlaces simbólicos
y clientes web. No sobrescribe credenciales anteriores. La carpeta queda fuera de Git;
`.env.*` y `artifacts/` también están ignorados. No incluir estos archivos en Docker,
el runtime web, Admin, Android, GitHub o informes.

**Testing no es operación estable:** Google puede caducar el refresh token a los
siete días. Revisar publicación/verificación aplicables a scopes sensibles antes
de operar sin supervisión; Gmail Send es sensible, no un scope de lectura restringido.
El cambio de contraseña, revocación o cuotas también pueden impedir renovar/enviar.

## Configuración futura del backend y worker

API (construye el mensaje y cifra la outbox; no necesita tokens Gmail):

```dotenv
EMAIL_PROVIDER=gmail
GMAIL_SENDER=REMITENTE_AUTORIZADO@gmail.com
EMAIL_REGISTRATION_ENABLED=0
# Conservar EMAIL_OTP_SECRET, EMAIL_OUTBOX_KEY y JWT existentes.
```

Worker futuro, independiente y todavía desactivado:

```dotenv
EMAIL_PROVIDER=gmail
GMAIL_SENDER=REMITENTE_AUTORIZADO@gmail.com
GMAIL_CREDENTIALS_FILE=/ruta/privada/credentials.json
EMAIL_WORKER_ENABLED=0
# EMAIL_WORKER_DATABASE_URL, EMAIL_WORKER_EXPECTED_DATABASE y EMAIL_OUTBOX_KEY
# se preparan privadamente para el destino autorizado; no usar Neon en pruebas.
```

Solo después de revisión, autorización de despliegue/configuración y aprobación de
un correo de prueba se puede habilitar un worker canario. No ejecutar ahora
`worker --once` con credenciales/base reales. El helper OAuth no envía mensajes.
No migrar la base ni cambiar el registro OTP para preparar Gmail. Para el primer
código real faltan cliente OAuth/consentimiento, token y remitente confirmados,
y aprobación explícita del destinatario y envío; se puede mantener cerrado el
registro público durante ese canario.

## Duplicados, recuperación y compatibilidad

- Outbox transaccional, AES-GCM, UUID, reenvíos, límites e intervalo OTP de cinco
  minutos conservados; sin nuevas columnas o migraciones.
- El sobre cifrado de los nuevos eventos Gmail congela proveedor y mensaje.
  Los eventos Resend anteriores siguen con el mismo formato. Un worker de otro
  proveedor se detiene sin cambiar ni enviar ese evento; no hay fallback automático.
  Actualizar primero el código del worker y revisar/drenar la cola antes de cambiar
  proveedor. No mezclar un worker antiguo con mensajes Gmail.
- Gmail recibe MIME multipart UTF-8 y `raw` base64url, un solo destinatario por OTP.
  El Message-ID estable sirve para trazabilidad, **no garantiza idempotencia**.
- Una única petición Gmail por intento. Timeout, red, 408/5xx, respuesta de aceptación
  inválida y lease recuperado pasan a `ambiguo`, retiran el payload y no se reenvían.
  Puede perderse un envío si el proceso murió antes de llamar a Gmail; se prefiere
  esa incertidumbre a duplicar. El usuario puede solicitar un nuevo código dentro
  de los límites normales; no se crea un nuevo envío automáticamente.
- Rechazos explícitos 429/cuota y 401 (token denegado) se programan para reintento
  limitado por la misma outbox y vencimiento; 400/403 permanentes terminan. Fallos de
  refresh anteriores al POST de envío pueden reintentarse, pues todavía no se envió.
  `invalid_grant` requiere revisar consentimiento, sin bucles de renovación infinita.
- Resend conserva su clave idempotente y su política anterior; no se modifica su
  contrato ni se transforma aceptación por el proveedor en entrega garantizada.

## Evidencia y límites

**54 comprobaciones aprobadas, cero fallidas** en la integración inicial; el
endurecimiento posterior de identidad aprobó **16 comprobaciones focalizadas**
OAuth/Gmail y worker independiente con Node22/PostgreSQL18 aislados. También se
construyó la imagen `hidro-gmail-otp:local` y se comprobó `worker --help` con red
desactivada. Pruebas focalizadas en Node22/PostgreSQL18 nuevos y aislados, datos sintéticos y
proveedores simulados. Gmail, Outlook y Hotmail se prueban como direcciones de MIME,
no como entregas reales. Incluyen OAuth/PKCE/callback, 0600, no exposición de tokens,
scope mínimo, rechazo de inyección, cuotas, timeout/JSON/5xx, proveedor congelado,
lease/crash sin segundo envío y regresión de Resend/HTTP/OTP/outbox. El flujo registro → outbox Gmail → worker
independiente simulado → confirmación OTP se probó completo, sin RESEND_API_KEY. Resultados y
logs locales en `artifacts/gmail-api/`; no publicar credenciales ni reportes privados.

El primer ensayo detectó inferencia incompatible de un parámetro SQL al actualizar
la marca de ambigüedad; se corrigió usando un parámetro booleano separado. También
se ajustó el laboratorio: un contenedor con red interna no publicó el puerto; el
runner Node22 comparte su namespace local, sin salida externa ni montar `.env` reales.
No son errores observados en producción. No se repiten pruebas Android nativas ni
se afirma funcionamiento real en Google sin consentimiento y canario aprobado.

Fuentes oficiales: [scopes](https://developers.google.com/workspace/gmail/api/auth/scopes),
[envío MIME](https://developers.google.com/workspace/gmail/api/guides/sending),
[OAuth de escritorio](https://developers.google.com/identity/protocols/oauth2/native-app),
[caducidad de refresh tokens](https://developers.google.com/identity/protocols/oauth2#expiration),
[errores Gmail](https://developers.google.com/workspace/gmail/api/guides/handle-errors).
