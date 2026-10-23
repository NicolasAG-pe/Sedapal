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

El propietario proporcionó el JSON oficial de escritorio en
`~/.config/hidro-mejora/gmail-oauth.json`. Se comprobó el tipo `installed`, proyecto
esperado y permisos 0600, sin copiar secretos al repositorio. No se crea otro cliente.
La audiencia, estado Testing y usuario de prueba se administran en Google Auth Platform;
no se certifican aquí pantallas que no pudieron inspeccionarse con el navegador.

## Autorización local automatizada, sin enviar

La configuración local permanece fuera de Git. `worker.env` privado (0600)
fija el remitente y la ruta de credenciales, con registro/worker en 0; no se carga
ni inicia automáticamente. Los lanzadores privados usan un único helper corregido.

```sh
node scripts/gmail-oauth.cjs \
  --client-file "$HOME/.config/hidro-mejora/gmail-oauth.json" \
  --sender 'REMITENTE_AUTORIZADO@gmail.com' \
  --output "$HOME/.config/hidro-mejora/gmail/credentials.json"
```

El programa genera un enlace oficial de Google y espera el consentimiento en un
listener temporal `127.0.0.1`, puerto aleatorio, con `state` y PKCE S256. Nunca pide
la contraseña, imprime tokens ni registra el callback/código. Abre ese enlace,
selecciona la cuenta remitente y concede exclusivamente **Enviar correo**.
No solicita permisos del conector Gmail ni reutiliza sus credenciales.

Comprueba audience y permiso exacto con tokeninfo por HTTPS/Authorization. Si
Google omite `email` y `sub`, conserva el grant válido: `gmail.send` permite enviar,
no obliga a devolver identidad. No consulta `getProfile` ni `userinfo` y no solicita
otros scopes. Si Google aporta una identidad contradictoria con el remitente o
subject fijado, la rechaza. `login_hint` y el remitente configurado no son prueba
automática de identidad.

Guarda access token, refresh token, caducidad y cliente en `credentials.json` (0600).
El estado de identidad se distingue mediante `account_verified=false` y
`account_check=scope_only`; también se registra, sin secretos, en
`credentials.json.identity.json` (0600). La sesión Cloud y la autorización Gmail son
distintas: comprobar la cuenta Cloud no demuestra la identidad del token Gmail.

Si la salida ya existe, intenta renovarla sin abrir consentimiento. La renovación
comprueba cliente y alcance mediante tokeninfo, conserva el refresh token cuando
Google no entrega otro y actualiza los archivos de forma atómica. Un fallo deja
intacta la credencial anterior; no solicita consentimiento repetidamente. Un token
revocado/caducado requiere revisar el error y autorizar de nuevo conscientemente.

Cuando existe `authorized-sender.json`, exige que el JSON de escritorio corresponda
al proyecto y remitente autorizados. El backend local puede cargar credenciales con
identidad no disponible sin presentarlas como verificadas. Todo envío futuro usa
`users/REMITENTE/messages/send`, no `users/me`; la prueba de entrega y del remitente
permanece pendiente de un canario expresamente autorizado.

Rechaza archivos legibles por grupo/otros, de otro propietario, enlaces simbólicos
y clientes web. No sobrescribe tokens durante el consentimiento; la renovación de
un archivo válido reemplaza atómicamente su contenido. La carpeta queda fuera de Git;
`.env.*` y `artifacts/` también están ignorados. No incluir credenciales en Docker,
el runtime web, Admin, Android, GitHub o informes. El helper no inicia el worker,
no abre PostgreSQL y no realiza peticiones de envío Gmail.

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
código real hacen falta renovación comprobada, selección de la cuenta autorizada
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

El consentimiento real se completó con el cliente de escritorio existente; la
renovación real y tokeninfo aprobaron audience y permiso exacto. Ambos tokens están
solo en configuración privada 0600, con identidad automática no disponible indicada
aparte. Se comprobó la carga de `worker.env` y de las credenciales con el módulo real
del backend local; el worker con bandera 0 rechaza arrancar antes de abrir PostgreSQL.
Un chequeo auxiliar inicialmente esperaba el texto interno del error, pero la CLI
lo sanea: se corrigió el chequeo para verificar el rechazo y el mensaje público real.
No hubo fallo de la aplicación ni intento de envío por esa comprobación.

La corrección de conservación y renovación aprueba **17 pruebas focalizadas** con
Node.js 22 y proveedor simulado: callback sin identidad, ambos tokens privados, metadata separada,
PKCE/state, audience/scope, renovación sin consentimiento y preservación ante error.
La renovación real y el resultado del consentimiento se comprueban privadamente;
las pruebas simuladas no demuestran la autorización real ni la entrega de un correo.

**54 comprobaciones aprobadas, cero fallidas** en la integración inicial; el
endurecimiento anterior de identidad aprobó **16 comprobaciones focalizadas**
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


## Worker compartido autorizado en Render Free

El propietario autorizó el 23/10/2026 ejecutar el worker existente como proceso
separado dentro del contenedor de la API, aceptando compartir reinicios y suspensión
por inactividad. Esta decisión sustituye la propuesta previa de dos servicios
independientes; no crea un servicio de pago ni modifica Kubernetes.

`node start.cjs` es el PID1. Sin opt-in conserva API sola. Con
`EMAIL_WORKER_SHARED_CONTAINER=1` y `EMAIL_WORKER_ENABLED=1`, prepara una copia efímera
privada del secret file, inicia el worker por IPC y espera que valide base y tabla
outbox. Solo entonces inicia la API. La API hija no recibe las rutas/variables de
credenciales del worker. Ambos comparten la confianza del contenedor; no constituye
una separación de privilegios del sistema operativo.

Una salida inesperada de cualquier hijo cierra al otro y termina el contenedor con
error. Render puede reiniciarlo; el supervisor no reintenta envíos por su cuenta.
SIGTERM drena API/Socket.IO y PostgreSQL, permite finalizar el trabajo en curso y
cierra ambos; a los 25 segundos fuerza únicamente sus hijos propios si no terminaron.
API y worker separados/Kubernetes conservan su uso anterior mediante comando explícito.

Variables adicionales, solo privadas en el servidor:

```dotenv
EMAIL_WORKER_SHARED_CONTAINER=1
EMAIL_WORKER_ENABLED=1
EMAIL_REGISTRATION_ENABLED=1
EMAIL_REGISTRATION_ALLOWED_EMAIL=CORREO_CANARIO_AUTORIZADO
```

La restricción del canario bloquea otros registros antes de abrir SQL y otros envíos
antes de renovar o llamar a Gmail. También limita reenvíos. No revela el correo
permitido al cliente y no amplía los permisos OAuth. Una vez confirmados recepción,
verificación y login desde la APK con datos móviles, el propietario autoriza quitar
esa restricción mediante configuración y un despliegue controlado del mismo código.
Hasta entonces no se anuncia el registro general como habilitado.

Validación nueva: 58 comprobaciones con Node22/PostgreSQL18 y proveedor simulado,
incluyendo procesos reales, OTP, login, caídas de cada hijo, recuperación sin nuevo
POST Gmail, configuración incompleta, timeout, SIGTERM y aislamiento del canario.
La imagen final pasó arranque/readiness/health, SIGKILL del worker, reinicio del
contenedor y cierre SIGTERM con exit0. Se conservan todos los volúmenes de prueba.
No se extrapolan esas pruebas a recepción física de correo ni a Android real.


El primer despliegue real del supervisor detectó ELOOP al abrir el secret file
proyectado por Render. Se corrigió el adaptador del montaje: solo para entradas
inmediatas del directorio de secretos gestionado por la plataforma se resuelve el
enlace, exigiendo destino dentro del mismo volumen, directorio protegido y propietario
confiable. La apertura final conserva O_NOFOLLOW. Enlaces arbitrarios, escapes y
raíces escribibles por terceros se rechazan. El lector de credenciales del worker
sigue exigiendo archivo regular 0600 y no se modifica. Las 59 pruebas posteriores
incluyen estos casos y las regresiones del supervisor, OTP y outbox.
