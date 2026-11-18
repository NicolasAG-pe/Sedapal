# Activación de HidroBot 3.0 en Hidro-Mejora

## Instalación actual y alcance

El 18 de noviembre de 2026, `main` en GitHub incluía el PR #37 en
`24ec28d55c824a4904abbf59c88c406606398c68`. El backend live en Render era
`hidro-mejora-api`, deploy `dep-dbucg7uc6qcc73db7ma0`, commit
`94fa05fb62aa49b85e85c889def3ab22e1ac170e`. Usa Docker con raíz `Backend`,
una instancia, rama `main`, health check `/api/health` y autodespliegue y
previews desactivados. La API pública devolvió 200 y
`hidro-auth-2fa-v2` en health, 401 en sesión sin JWT y 404 en `POST /api/chat`.
El preflight de `https://localhost` devolvió 204 y autorizó ese origen.
[Render](https://dashboard.render.com/web/srv-db3f89qj9qps73fcvfbg).
[PR #37](https://github.com/NicolasAG-pe/Sedapal/pull/37).

En Vercel, Admin respondió 200 y el último deploy de producción de
`hidro-mehora-admin` estaba READY en `9556ec17`. El último intento de
`sedapal` figuraba ERROR. Android se conecta directamente a la API HTTPS
de Render y Admin no necesita otro despliegue para este cambio.
[Admin](https://hidro-mehora-admin.vercel.app).

La APK oficial 1.2.0/código 6 trae el catálogo local y carece del cliente
de chat v2. La actualización 1.2.1/código 7 incorpora el cliente al runtime
Capacitor, conserva FCM, paquete `pe.edu.hidromejora.app`, firma permanente,
API HTTPS y origen WebView `https://localhost`. Su SHA-256 es
`438713856c33bd9ffa0e6d44db063f7ac1640caf8ed3c8c21b404cb642834957`.
La candidata está compilada y queda local. La prueba de actualización en
dispositivo y la publicación se hacen en la ventana autorizada.
[APK oficial 1.2.0](https://github.com/NicolasAG-pe/Sedapal/releases/tag/v1.2.0).

## Ruta, datos y respaldo

- La entrada oficial registra `POST /api/chat` antes del parser general.
  Usa el mismo autenticador que sesión, perfil y recibos. Valida JWT, rol,
  suministro, vigencia y estado actual. Si se configuró el Auth delegado,
  chat valida la sesión con ese mismo Auth y aplica el plazo de 1,5 s.
  El Gateway de microservicios mantiene su integración de laboratorio.
- El contrato v2 acepta exclusivamente `version`, `conversationId`, `topic`
  y `style`. El cliente clasifica el texto localmente. El servicio solo envía
  a Groq el tema de catálogo, estilo, indicador de continuación y extractos
  públicos escritos previamente. El JWT, ID de conversación, ID de cuenta,
  suministro, texto libre, recibos, pagos e incidencias quedan fuera de Groq.
  La conexión a Groq usa únicamente HTTPS a `api.groq.com`, sin redirecciones
  ni herramientas externas. El catálogo de Backend y Frontend se mantiene
  idéntico mediante una prueba, ya que Render solo empaqueta `Backend/`.
- Chat limita el cuerpo a 1 KB, 60 solicitudes por IP y 12 por cuenta por
  minuto, con 8 generaciones concurrentes por proceso. El contexto conserva
  temas hasta cinco minutos en memoria, aislados por JWT y conversación. Groq
  tiene un plazo de seis segundos, aplica pausa por 429 y nunca reintenta una
  inferencia. El backend verifica el esquema y el contenido de la respuesta.
  El cliente vuelve al catálogo si cae la API, recibe una respuesta inválida
  o usa una cuenta fuera del alcance configurado. El reloj, límites y
  conversaciones se reinician con el proceso.
- Orientación generada muestra su rótulo y un enlace del catálogo local.
  Las consultas personales y las acciones de la app siguen en sus rutas
  propias. El backend registra códigos de error resumidos. La credencial
  queda en el proceso API y fuera de los workers, logs y runtime Android.

## Verificación previa

- Node 22 completó 205 pruebas de unidad y contrato. PostgreSQL 18 aislado
  completó 93 verificaciones de integración, con una omisión preexistente
  del escenario de duplicados históricos. El flujo nuevo prueba login
  y JWT emitidos por la API oficial, perfil, recibos, Gateway, v1/v2, rol,
  caducidad y revocación, cuota por cuenta y respaldo por 429. El transporte
  controlado comprueba el contenido completo del envío sin salir a Groq.
- La imagen Docker desde la raíz `Backend` arrancó con configuración
  productiva y PostgreSQL sintético. Health devolvió 200 y chat sin sesión
  devolvió 401 con CORS de la WebView.
- Compilación release, pruebas unitarias Android, lint, compilación de
  instrumentación y verificación de firma completadas. El APK contiene
  el cliente v2 y la API HTTPS oficial. La revisión del runtime verifica
  que no contiene el destino ni la clave de Groq, ni secretos de servidor.

## Variables privadas de Render

| Variable | Despliegue inicial | Comprobación limitada | Activación general |
|---|---|---|---|
| `CHAT_PROVIDER` | `local` | `groq` | `groq` |
| `CHAT_GROQ_MODEL` | `openai/gpt-oss-20b` | `openai/gpt-oss-20b` | `openai/gpt-oss-20b` |
| `CHAT_GROQ_API_KEY` | Ausente | Clave del proyecto productivo, variable secreta | Misma credencial gestionada |
| `CHAT_GROQ_CANARY_USER_ID` | Ausente | ID interno de una cuenta sintética de cliente autorizada | Ausente |
| `CHAT_GROQ_PUBLIC` | `0` | `0` | `1` |

Con `CHAT_PROVIDER=groq` se exige un único alcance válido. Una configuración
incompleta retorna al catálogo. El ID de diagnóstico se consigue leyendo
`usuario.id_usuario` al consultar sesión con la cuenta autorizada, sin
copiar ni guardar su JWT o suministro. Las variables se cargan al arrancar
la API. Guardar y desplegar el mismo SHA para aplicar los cambios en Render.

## Requisitos del operador de GroqCloud

1. El responsable mayor de edad, con autorización sobre la organización y
   el proyecto, comprueba el acuerdo aplicable, términos del modelo, la
   política de uso y la elegibilidad del público antes de habilitar acceso
   general. La aceptación corresponde al titular. [Acuerdo de Groq](https://console.groq.com/docs/legal/services-agreement).
   [Política de uso](https://console.groq.com/docs/legal/ai-policy).
2. En Groq Console, selecciona o crea un proyecto exclusivo para producción.
   Habilita el modelo GPT-OSS 20B, confirma los límites reales del proyecto y
   su organización y fija una cuota acorde con la autorización. Cuando el
   plan sea de pago, valida presupuesto y límite mensual de organización.
   Comprueba los controles de retención y habilita Zero Data Retention para
   inferencia. [Proyectos](https://console.groq.com/docs/projects).
   [Permisos por modelo](https://console.groq.com/docs/model-permissions).
   [Modelo y JSON estricto](https://console.groq.com/docs/structured-outputs).
   [Retención](https://console.groq.com/docs/your-data).
   [Límites de gasto](https://console.groq.com/docs/spend-limits).
3. Crea una clave del proyecto y guárdala directamente como secreto
   `CHAT_GROQ_API_KEY` del servicio API en Render. Conserva los demás
   secretos vigentes. Valida disponibilidad, uso y cuota en la consola del
   proyecto durante la comprobación autorizada.

## Orden de despliegue y comprobación

1. Tras aprobación del merge, verifica el SHA final de `main` y la
   configuración actual de Render. Conserva el deploy live como referencia
   de rollback, confirma que su artefacto sigue elegible y revisa de forma
   privada sus variables, workers y grupos. Mantén el hostname, Docker,
   health check, origen WebView, secretos de sesión y los flags existentes.
   La ruta oficial usa el esquema actual y no requiere migraciones ni
   ejecutar la migración 015 del esquema de microservicios.
2. Despliega el SHA aprobado manualmente en Render con `CHAT_PROVIDER=local`.
   Confirma que Render lo marca live. Comprueba health 200, CORS Android,
   401 en chat sin JWT y 200 v2 con catálogo tras login autorizado. Verifica
   sesión existente, perfil, recibos, configuración de pagos, incidencias
   y Socket.IO con la APK oficial vigente. Mantén los flujos externos
   sensibles en su estado productivo aprobado. [Despliegues Render](https://render.com/docs/deploys).
3. Con autorización de instalación, verifica que 1.2.1 actualiza 1.2.0 sin
   desinstalar, conserva sesión, usa la misma API y muestra catálogo y
   fuente oficial. Con autorización de Groq, aplica el alcance limitado
   del cuadro y comprueba un turno público con la cuenta sintética. Por
   ejemplo, «¿Cómo ahorrar agua?». Acepta si llega `mode=generated` con
   orientación coherente y fuente oficial y la consola registra el uso.
   Comprueba que una cuenta fuera del alcance obtiene catálogo. Ante 401,
   403, 429 o timeout, vuelve al catálogo y revisa permisos, modelo y cuota
   antes de aprobar la apertura.
4. Tras la aprobación de apertura general y distribución, habilita
   `CHAT_GROQ_PUBLIC=1` con el ID sintético ausente, verifica la salud y
   publica la APK firmada y su checksum por el canal oficial. Observa
   latencia, errores de chat y consumo en Render y Groq. Android 1.2.0
   seguirá ofreciendo su catálogo local hasta que se actualice.

## Reversión

- Si el problema es Groq, fija `CHAT_PROVIDER=local`, `CHAT_GROQ_PUBLIC=0`
  y despliega el mismo SHA. El código sigue atendiendo v2 desde catálogo.
  Si hay que cortar salidas antes de que termine el despliegue, el operador
  revoca la clave del proyecto. Comprueba health, sesión y modo de catálogo.
- Si falla la versión de API, el operador puede revertir al último deploy
  estable capturado antes del cambio. Verifica sus variables privadas
  antes de confirmar. Render puede recuperar las del deploy objetivo.
  La versión de referencia observada es `dep-dbucg7uc6qcc73db7ma0`.
  La APK 1.2.1 cae al catálogo local ante 404 y conserva el hostname y
  las rutas de negocio anteriores. Comprueba de nuevo health, sesión,
  recibos y Socket.IO. La reversión de la aplicación no requiere cambios
  de datos. [Rollback Render](https://render.com/docs/rollbacks).
- Si el problema está en Android, detén la distribución y conserva ambas
  APK. Para instalaciones que ya tengan código 7, una corrección requiere
  la misma firma y un código mayor. [Actualización Android](ANDROID-RELEASE.md).

## Diagnóstico de respuestas generativas

El deploy `dep-dbv378rl550s738ivrpg` estaba live en el commit
`0a850b75af5a1b417a27b215de71e529b19837e0`. El 18 de noviembre de 2026 a las
23:27:45 UTC registró `[conversation] GROQ_INVALID_OUTPUT`. El registro
histórico solo conserva ese código. El motivo exacto del turno de
producción queda por confirmar. [Servicio en Render](https://dashboard.render.com/web/srv-db3f89qj9qps73fcvfbg).

Con un transporte controlado, un HTTP 200 y JSON válido que repetía el
extracto de ahorro producía el mismo error por la frase «tu consumo».
La marca con guion en el extracto de recibos también podía provocar ese
código. El adaptador ofrecía al modelo oraciones que luego rechazaba.
Ahora envía oraciones compatibles con los mismos filtros, pide redacción
impersonal con palabras de los extractos y exige sustento en el subconjunto
realmente enviado. La APK 1.2.1 sigue aceptando el formato v2 y sus fuentes.

Al rechazar una respuesta, el backend mantiene el catálogo y registra
`[conversation] GROQ_INVALID_OUTPUT <motivo>` como máximo una vez por
minuto para cada motivo. Los motivos son constantes del código. Los
registros excluyen el texto, razonamiento, evidencia devuelta, claves
y datos de sesión.

| Motivo | Qué revisar |
|---|---|
| `HTTP_BODY`, `BODY_SIZE`, `HTTP_JSON`, `ENVELOPE` | Lectura, tamaño, JSON exterior y estructura de la respuesta HTTP |
| `FINISH_LENGTH`, `FINISH_REASON` | Truncamiento u otro motivo de finalización distinto de `stop` |
| `MESSAGE`, `MESSAGE_CONTENT`, `CONTENT_JSON` | Rol, rechazo del modelo, herramientas, tamaño o JSON del mensaje |
| `SCHEMA`, `EVIDENCE`, `TEXT_LENGTH`, `CHARACTERS` | Forma, referencias, extensión y caracteres permitidos |
| `UNSAFE_TEXT`, `GROUNDING`, `ACCOUNT_FACTS`, `SECRET_ECHO`, `CATALOG` | Contenido prohibido, palabras de los extractos, afirmaciones de cuenta, eco de clave o falta de extractos aptos |

### Comprobación tras un despliegue autorizado

1. Guarda el ID del deploy live para rollback. Despliega el SHA aprobado
   dentro de una ventana que cubra el tráfico autorizado. Si la configuración
   actual permite Groq para todos, el nuevo código recibe ese tráfico en
   cuanto el deploy se pone live.
2. Verifica `/api/health` y `/api/auth/capabilities`. Con una cuenta autorizada,
   revisa sesión, recibos y consumos mediante consultas de lectura.
3. Para la inferencia autorizada, inicia sesión en la APK 1.2.1 con la cuenta
   de validación y pregunta «¿Cómo ahorrar agua?». Confirma HTTP 200 y
   `mode=generated` en el cliente de diagnóstico autorizado, o el rótulo
   «Orientación generada» con «Consultar fuente oficial» en la APK.
4. Si aparece catálogo, revisa el motivo fijo en Render y conserva la hora.
   Con `FINISH_LENGTH`, revisa el límite de completado antes de reintentar.
   Para los demás motivos, usa la tabla y conserva el respaldo. Aplica el
   procedimiento de reversión de esta guía si falla la API.
