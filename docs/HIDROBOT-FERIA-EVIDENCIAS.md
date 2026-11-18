# HidroBot 3.0 con GroqCloud: evidencias para la feria

Documento de apoyo para la exposición. Separa lo que se comprobó con la APK y servicios reales del laboratorio de lo que solo se ejercitó con transporte simulado. No contiene claves, tokens ni datos de personas.

## Qué se puede afirmar

| Afirmación | Respaldo | Tipo |
| --- | --- | --- |
| Android LAB v10 (`1.2.0-lab.4`, versionCode 10) conversa con el Gateway del laboratorio | Registro del recorrido en el POCO M4 Pro: sesión, recibos, consumos, orientación, contexto, navegación y reconexión | Real en Android, con texto simulado |
| La app oficial 1.2.0 (versionCode 7) no se alteró | Ambos paquetes instalados con identificadores distintos | Real |
| Dos usuarios no comparten contexto | `Backend/test/groq-chain.test.cjs`, `Backend/test/conversation.test.cjs` y el recorrido con las cuentas sintéticas A y B | Pruebas automatizadas y Android |
| El proveedor no recibe el JWT, la conversación ni datos de la cuenta | `Backend/test/groq-chain.test.cjs` revisa el contenido completo de la petición saliente | Prueba automatizada con transporte controlado |
| Ante timeout, 429, 4xx, 5xx, contenido inválido, saturación o desconexión se responde con el catálogo | `Backend/test/groq-chain.test.cjs` y `Backend/test/groq-cloud.test.cjs` | Prueba automatizada con transporte controlado |
| GroqCloud generó una respuesta real con el adaptador | Piloto previo con sesión desechable: HTTP 200, modo `generated`, 827 ms en total, 502 tokens, fuente oficial | Real, sin Android ni Gateway. Registro local no versionado en `artifacts/` |

## Qué todavía no está demostrado

- El recorrido completo Android → Gateway → conversación → GroqCloud no se ha ejecutado con la API real. El tramo Gateway → conversación → adaptador sí se ensayó con un transporte controlado. El Gateway de demostración (`127.0.0.1:8284`) usa `simulated-generation` y la interfaz rotula el texto como «Generación simulada».
- No hay medición de fidelidad con varias preguntas reales. La comprobación léxica no detecta toda afirmación plausible pero incorrecta.
- La exposición a usuarios finales no está autorizada. Ver `docs/HIDROBOT-LAB.md`, sección «Verificación de condiciones de Groq».

## Pruebas de esta rama

| Conjunto | Resultado |
| --- | --- |
| Unitarias y de contratos (`npm test`) | 201 aprobadas, 0 fallos |
| Integración con PostgreSQL 18 aislado (`npm run test:integration`) | 92 aprobadas y 1 omisión histórica, medido antes de este avance. No se repitió: este avance no toca la base de datos |
| Inventario de pruebas (`npm run test:inventory`) | Vigente |

## Guion para la demostración

1. Muestra el recorrido del documento `docs/HIDROBOT-LAB.md` con la APK LAB v10. Di explícitamente que el rótulo «Generación simulada» indica el modo de demostración.
2. Corta la conversación con el servicio caído y muestra que el catálogo local sigue respondiendo.
3. Presenta la cifra del piloto real como un hecho separado, con su alcance: un solo servicio, sin Android.
4. Si se autoriza el ensayo de punta a punta, muestra el rótulo «Orientación generada» solo con la respuesta que lo lleve.

## Siguiente paso

El lanzador aislado del ensayo de punta a punta ya existe y su ensayo controlado pasa (`docs/HIDROBOT-GROQ-E2E.md`). Falta ejecutarlo una vez en modo real, con la autorización del administrador elegible y una clave nueva. Hasta entonces, no se declara inferencia real en Android.
