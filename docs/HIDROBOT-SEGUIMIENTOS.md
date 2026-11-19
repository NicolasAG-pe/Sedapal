# Seguimientos naturales en HidroBot 3.0

El fallo se reproducía antes del transporte. Android procesa el mensaje en
`handleBotMessage()` y llama a `followupStyle()`. La versión anterior
comparaba el turno completo con una lista breve de expresiones. «Más sencillo»
devolvía `simple`, pero «Dímelo más sencillo para hacerlo» devolvía
`undefined`. El mensaje seguía la clasificación de preguntas nuevas y
podía perder el último tema público. En ese recorrido, el backend nunca
recibía el identificador `more`.

El reconocimiento compone introducciones, verbos de solicitud, modos de
explicar y referencias al turno anterior. Evalúa el turno completo para que
un nuevo asunto o una instrucción adjunta sigan su propio recorrido.

| Solicitud | Estilo v2 |
| --- | --- |
| Dímelo más sencillo para hacerlo | `simple` |
| Explícamelo de otra manera | `simple` |
| No entendí, explícame mejor | `simple` |
| Dame un ejemplo | `detail` |
| ¿Puedes resumirlo? | `summary` |
| Explícamelo paso a paso | `detail` |
| Cuéntame más sobre eso | `detail` |

Ejemplos y pasos usan el estilo `detail` existente. El contenido depende de
los extractos públicos del tema. Si el cliente y el servidor ya comparten
ese tema, el cliente reutiliza la conversación y envía `topic=more`.
Si falta contexto o han pasado cinco minutos, pide precisar el tema en la
app. Las consultas de cuenta mantienen su propio contexto local. El protocolo
v1/v2, el transporte y los filtros de privacidad y validación de Groq
conservan su contrato y comportamiento.

## Límites comprobados

- Las preguntas combinadas, como «¿Puedes resumirlo? ¿Qué es Aquanet?»,
  se clasifican por su tema explícito.
- «Dame un ejemplo de cómo pagar mi recibo», «Cuéntame más sobre fútbol»
  y «No entendí qué debo pagar» siguen la clasificación normal. La frase
  de seguimiento no determina el tema de esos turnos.
- La frase «No entendí» sola y expresiones indirectas como «Explícamelo
  como si tuviera cinco años» quedan fuera de las formas admitidas.
- Un «Dame un ejemplo» después de consultar un recibo solo pide precisar
  el tema público. «¿Y cuánto costó?» sigue consultando el recibo recordado
  localmente.

## Verificación histórica de la candidata Android 1.2.2

- 30 pruebas enfocadas probaron la entrada del frontend y el backend con
  Gateway. Se verificó el mismo identificador v2 y que el cuerpo solo contiene
  versión, identificador, tema y estilo.
- 212 pruebas seguras pasaron. La integración con PostgreSQL 18 sintético
  obtuvo 93 aprobadas y una omisión preexistente. Inventario y navegador
  Firefox con Nginx local y API sintética aprobados.
- Android requiere una actualización porque su WebView carga el JavaScript
  incluido en la APK. La candidata 1.2.2, código 8, conserva paquete,
  firma permanente, permisos, Firebase y origen API de 1.2.1. Pasaron
  compilación release, unitarias Android, lint y compilación de
  instrumentación. El runtime extraído de la candidata aceptó las siete
  frases con un transporte controlado.
- SHA-256 de la candidata
  `5b97265eeb2fa75e15cf5816fc8821f49ab38d7d7a876a55603f171a76c56dfb`.
  El archivo queda local para la futura validación en dispositivo.
  El servidor ya admite el contrato que usa esta APK.

En la comprobación física autorizada, abre HidroBot tras iniciar sesión y
pregunta «¿Cómo ahorrar agua?». Envía dos o más seguimientos de la tabla.
Verifica que las respuestas sigan hablando de ahorro. Luego cambia a
«¿Qué es Aquanet?» y repite un seguimiento. Debe referirse a Aquanet.
Finalmente, consulta «Ver último recibo» y vuelve a pedir un ejemplo.
Debe aparecer la aclaración del tema público. Estos pasos también se
pueden comprobar con el catálogo local del backend.
