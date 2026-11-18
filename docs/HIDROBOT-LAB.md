# HidroBot 3.0 en el laboratorio

El cliente Android o web resuelve las consultas de cuenta con los datos del suministro de la sesión. La explicación de un recibo concreto, sus montos, consumo, vencimiento, incidencias y cortes se conserva en el dispositivo. La orientación pública también funciona sin el servicio.

Con el laboratorio habilitado, el flujo público es Android/Web → Gateway → conversación → catálogo Sedapal → proveedor simulado. El cliente envía solo un código de tema y un identificador aleatorio de conversación. Al proveedor le llegan el código del artículo, las variantes admitidas y si es una continuación. Devuelve una variante, y la aplicación muestra el texto y la fuente de su propio catálogo. Por ahora no hay generación libre de texto.

## Contrato de conversación v1

`POST /api/chat` requiere el bearer de una sesión activa de cliente. Cuerpo de ejemplo:

```json
{"version":1,"conversationId":"6c287f16-c231-4122-be7d-5449ff72cc09","topic":"saving"}
```

La respuesta tiene `version`, `mode` (`simulated`, `fallback` o `clarification`) y, cuando hay un artículo, `topic` y `variant`. La continuación usa el tema `more`. Los estados 400, 401, 403, 413, 429 y 503 distinguen entrada inválida, falta de acceso, tamaño, cuota e indisponibilidad. Los errores y las respuestas se entregan con `Cache-Control: no-store`.

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

## Modelo local futuro

Un proveedor puede seleccionar una variante del catálogo mediante un modelo local. La salida se valida antes de usarla. Aceptar texto generado requerirá evaluar fidelidad en español, verificar fuentes y proteger la salida antes de renderizarla. Conviene mantener los datos de cuenta en el cliente y medir latencia, RAM, CPU y salud del LAB por separado antes de considerar su uso en una demostración.
