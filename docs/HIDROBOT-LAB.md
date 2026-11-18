# HidroBot 3.0 en el laboratorio

El cliente Android o web resuelve las consultas de cuenta con los datos del suministro de la sesión. La explicación de un recibo concreto, sus montos, consumo, vencimiento, incidencias y cortes se conserva en el dispositivo. La orientación pública también funciona sin el servicio.

Con el laboratorio habilitado, el flujo público es Android/Web → Gateway → conversación → catálogo Sedapal → proveedor simulado. El cliente envía solo un código de tema y un identificador aleatorio de conversación. Al proveedor le llegan el código del artículo, las variantes admitidas y si es una continuación. Devuelve una variante, y la aplicación muestra el texto y la fuente de su propio catálogo. Por ahora no hay generación libre de texto.

## Contrato de conversación v1

`POST /api/chat` requiere el bearer de una sesión activa de cliente. Cuerpo de ejemplo:

```json
{"version":1,"conversationId":"6c287f16-c231-4122-be7d-5449ff72cc09","topic":"saving"}
```

La respuesta tiene `version` y `mode` (`simulated`, `fallback` o `clarification`). Cuando hay un artículo, incluye `topic` y `variant`. El modo `gemini` identifica el adaptador cuando se inyecta de forma explícita. La continuación usa el tema `more`. Los estados 400, 401, 403, 413, 429 y 503 distinguen entrada inválida, falta de acceso, tamaño, cuota e indisponibilidad. Los errores y las respuestas se entregan con `Cache-Control: no-store`.

El servicio valida cada petición con Auth y separa el contexto por huella de sesión e identificador de conversación. Guarda hasta cuatro referencias de temas públicos por conversación durante cinco minutos en memoria. El máximo es 1.000 conversaciones. El navegador olvida el contexto al limpiar el chat o cambiar de sesión. Se aceptan hasta 12 solicitudes por minuto por sesión y 60 por IP, con cuerpos de hasta 1 KiB. Hay un tope de ocho operaciones simultáneas del proveedor y un plazo de 750 ms. El chat responde con conocimiento local cuando el proveedor o el transporte fallan.

## Habilitar en un LAB

El transporte y el destino del Gateway vienen desactivados. En un LAB con dependencias ya instaladas y su archivo de entorno existente:

```sh
HM_CHAT_LAB=1 API_BASE_URL= node scripts/build-web.js web
docker compose --env-file .env.services -f compose.services.yaml -f compose.conversation.yaml config --services
```

El build web de ejemplo genera `artifacts/web/client`. Para servirlo en la extensión del LAB, selecciona esa ruta como raíz del cliente de prueba. El Compose base utiliza `artifacts/microservices/web`.

Cuando decidas habilitar la extensión en ese LAB, inicia únicamente el servicio nuevo y aplica el destino de conversación al Gateway. El cambio de entorno recrea el Gateway. Conserva los contenedores de datos y los microservicios restantes.

```sh
docker compose --env-file .env.services -f compose.services.yaml -f compose.conversation.yaml up -d --no-deps conversation gateway
```

Durante esta fase se puede verificar todo el contrato con `node --test Backend/test/conversation.test.cjs scripts/test/hidrobot.test.cjs`. Las fuentes del catálogo incluyen la [guía de lectura del recibo](https://www.gob.pe/institucion/vivienda/noticias/1183077-cuidemos-el-agua-sedapal-te-ensena-a-leer-el-consumo-de-agua-potable-en-tu-recibo) y los [consejos de Sedapal para cuidar el agua](https://www.gob.pe/institucion/sedapal/noticias/1178111-sedapal-te-guia-hacia-un-consumo-responsable-y-sostenible-del-agua).

## Gemini 3.5 Flash-Lite como integración futura

El backend contiene un adaptador con el mismo contrato que el simulador. Su valor predeterminado es `gemini-3.5-flash-lite`, que Google lista como estable y compatible con salida estructurada. Se puede elegir otro identificador Flash al construir el adaptador. Su disponibilidad y ciclo de vida deben comprobarse antes de usarlo. Se ha descartado la inferencia con Qwen. [Ficha oficial del modelo](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite)

El arranque del backend sigue usando el simulador. El adaptador requiere inyectar explícitamente un transporte y una clave del backend. No lee variables de entorno, no incluye un transporte de red por defecto y no se carga en el arranque. Las pruebas inyectan un transporte simulado.

Para una futura integración, el cuerpo saliente contiene únicamente el tema público, si es una continuación y las variantes permitidas. Los identificadores de cuenta o sesión, los mensajes libres, los recibos y sus importes quedan fuera. El backend solo acepta un identificador de variante del esquema y la UI obtiene el texto y el enlace de su catálogo. El límite de tiempo se comparte con el servicio de conversación. Los fallos de red, un HTTP 429 y las respuestas inválidas devuelven el respaldo del catálogo, sin reintentos automáticos. [Referencia de generación de contenido](https://aistudio.google.com/api-reference/generate-content)

### Condiciones antes de habilitarlo

- Google exige 18 años cumplidos para usar la API y excluye las aplicaciones dirigidas a menores de 18 años o a las que probablemente accedan. El uso está orientado a fines profesionales o empresariales y limitado a regiones admitidas. Perú está incluido. Para poner un cliente de la API a disposición de usuarios en el EEE, Suiza o Reino Unido, Google exige servicios pagados. Si se espera público menor de edad en la feria o la aplicación, mantener el modo local o simulado. [Términos de Gemini](https://aistudio.google.com/docs/terms) · [Regiones admitidas](https://aistudio.google.com/docs/available-regions)
- La generación estándar de 3.5 Flash-Lite ofrece entrada y salida gratuitas en proyectos elegibles. En ese nivel, Google Search y Maps como fuentes y el almacenamiento de contexto no están incluidos para este modelo. Las cuotas de solicitudes por minuto y día y de tokens de entrada por minuto se aplican por proyecto, varían según modelo y nivel y se consultan en AI Studio. El límite diario se reinicia a medianoche del Pacífico. [Precios](https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite) · [Cuotas](https://aistudio.google.com/docs/rate-limits)
- Google puede usar entradas y salidas de servicios gratuitos para mejorar sus productos y someterlas a revisión humana, con las excepciones regionales que describen sus términos. La clave, si se llega a aprobar un piloto, se administra exclusivamente en el backend. Mantener fuera de la solicitud cualquier dato personal, sensible o confidencial. [Uso de datos](https://aistudio.google.com/docs/terms#data-use-unpaid) · [Gestión de claves](https://aistudio.google.com/docs/api-key#security)

Sin acceso a Gemini, HidroBot conserva el catálogo, las aclaraciones, la navegación y los cálculos del suministro en el cliente. Consultar o refrescar datos del suministro sigue requiriendo acceso al backend de Hidro-Mejora. Sin conexión, el cliente indica cuándo no puede verificarlos.

Para verificar el adaptador y los respaldos localmente, ejecutar `node --test Backend/test/gemini-flash.test.cjs Backend/test/conversation.test.cjs`.
