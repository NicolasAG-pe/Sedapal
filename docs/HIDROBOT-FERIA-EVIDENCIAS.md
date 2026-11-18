# HidroBot 3.0 con GroqCloud: evidencias para la feria

Documento de apoyo para la exposición. Separa lo que se comprobó con la APK y servicios reales del laboratorio de lo que solo se ejercitó con transporte simulado. No contiene claves, tokens ni datos de personas.

## Qué se puede afirmar

| Afirmación | Respaldo | Tipo |
| --- | --- | --- |
| Android LAB v10 (`1.2.0-lab.4`, versionCode 10) ejecuta el flujo en 8285 | POCO M4 Pro por USB, APK instalada, inicio de sesión en Auth del LAB, consumo, importe, detalle del recibo y texto visible con enlace oficial. Resumen del sandbox: tres intentos simulados, cero externos, un `GROQ_QUOTA`. | Android físico con transporte simulado |
| La APK oficial 1.2.0 (versionCode 7) siguió instalada | ADB comprobó los dos paquetes y sus versiones. El puente afectó al puerto local de la LAB. | Verificación USB |
| Cada cuenta conserva su propio contexto | En Android, A y B mostraron sus propios consumos e importes. B recibió una aclaración al pedir más sin contexto. Los contratos también prueban reutilizar el mismo identificador con un JWT distinto. | Android y contratos |
| El proveedor no recibe el JWT, la conversación ni datos de la cuenta | `Backend/test/groq-chain.test.cjs` revisa el contenido completo de la petición saliente | Prueba automatizada con transporte controlado |
| Ante timeout, 429, 401/403, 503, contenido inválido, saturación o desconexión se activa el respaldo | `Backend/test/groq-chain.test.cjs` y `Backend/test/groq-cloud.test.cjs`. En el POCO se vio el catálogo con su enlace tras el 429 simulado. | Contratos y Android |
| El relé valida el nombre TLS y aplica el presupuesto | HTTPS local con certificado efímero válido y luego con nombre incorrecto. El servidor solo recibió HTTP en el primer caso. El ensayo rechazó una segunda salida y comprobó el montaje por descriptor de una clave ficticia. | Sandbox local |
| GroqCloud generó una respuesta real con el adaptador | Piloto previo con sesión desechable: HTTP 200, modo `generated`, 827 ms en total, 502 tokens, fuente oficial | Real, sin Android ni Gateway. Registro local no versionado en `artifacts/` |

## Qué todavía no está demostrado

- La inferencia con la API real desde Android queda pendiente de autorización. El ensayo en 8285 pasó por Gateway, Auth, conversación y el adaptador con transporte controlado. Tanto 8285 en modo simulado como la demostración de 8284 muestran el rótulo «Generación simulada».
- No hay medición de fidelidad con varias preguntas reales. La comprobación léxica no detecta toda afirmación plausible pero incorrecta.
- La exposición a usuarios finales no está autorizada. Ver `docs/HIDROBOT-LAB.md`, sección «Verificación de condiciones de Groq».

## Pruebas de esta rama

| Conjunto | Resultado |
| --- | --- |
| Unitarias y de contratos (`npm test`) | 201 aprobadas en la CI publicada. La revisión local añadió la regresión de desconexión durante Auth y obtuvo 202 aprobadas, 0 fallos. |
| Integración con PostgreSQL 18 aislado (`npm run test:integration`) | 92 aprobadas y 1 omisión histórica en la CI del PR #37. La revisión local se limitó a conversación y al lanzador. |
| Inventario de pruebas (`npm run test:inventory`) | Vigente |
| `npm run test:hidrobot:groq:isolated` y `--bridge-check` | Aprobados. Loopback, namespaces separados, CORS, timeout, presupuesto, TLS, validación de sesión y restauración de ADB a 8284. |
| Auditoría de dependencias de ejecución del Backend | `npm audit --prefix Backend --omit=dev` devolvió cero avisos. |

La captura de la WebView y los registros del cierre se guardaron localmente en `artifacts/hidrobot-groq-lab/` con el prefijo `cierre-android-`. Para contrastar el comportamiento, usa `cierre-android-ui.log` junto con `cierre-android-gateway.log`.

## Guion para la demostración

1. Muestra el recorrido del documento `docs/HIDROBOT-LAB.md` con la APK LAB v10. Di explícitamente que el rótulo «Generación simulada» indica el modo de demostración.
2. Ejecuta el recorrido `--android` descrito en `docs/HIDROBOT-GROQ-E2E.md` para mostrar el catálogo tras el 429. Al terminar, comprueba el regreso a 8284 con `adb-bridge.sh status`.
3. Presenta la cifra del piloto real como un hecho separado, con su alcance: un solo servicio, sin Android.
4. Si se autoriza el ensayo de punta a punta, muestra el rótulo «Orientación generada» solo con la respuesta que lo lleve.

## Siguiente paso

Un operador elegible puede autorizar y ejecutar una única inferencia desde Android con una clave nueva y una cuenta sintética del LAB, según `docs/HIDROBOT-GROQ-E2E.md`.
