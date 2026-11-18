# Ensayo aislado Android LAB → Gateway → conversación → GroqCloud

Lanzador: `scripts/hidrobot-groq/`. Reutiliza `createGateway`, el servicio de conversación y el adaptador GroqCloud sin modificarlos. No cambia la APK, las bases de datos, Docker ni producción.

## Arquitectura

```mermaid
flowchart LR
    A[Android LAB v10] -->|adb reverse 45689| G[Gateway del ensayo\n127.0.0.1]
    G -->|puente TCP loopback| U[(chat.sock)]
    subgraph S[bubblewrap: sin red, sin entorno]
        U --> C[Conversación + adaptador]
    end
    C -->|auth.sock| R1[Relé Auth\ndestino fijo]
    C -->|groq.sock| R2[Relé TLS\napi.groq.com:443]
    R1 --> AU[Auth LAB 127.0.0.1:8280]
    R2 --> GQ[GroqCloud]
```

- El servicio corre en un espacio de red vacío: solo tiene un loopback propio. No hereda variables de entorno y ve únicamente el código necesario, en solo lectura.
- Los tres canales son sockets Unix. Cada relé tiene un destino fijo y un tope de bytes. El de Groq tiene además un tope de conexiones igual al presupuesto de peticiones.
- TLS se valida dentro del sandbox contra `api.groq.com`. El anfitrión solo copia bytes cifrados.
- El Gateway escucha únicamente en `127.0.0.1` y solo puede conectarse a los destinos del laboratorio.
- La clave llega por un descriptor de archivo de solo lectura. Nunca pasa por argumentos, entorno, Gateway, Android ni GitHub.

## 1. Ensayos sin credenciales ni Internet

Estos dos ensayos pueden repetirse cuando se quiera. Ninguno lee un secreto ni llama a GroqCloud. Todo transporte hacia Groq está simulado dentro del sandbox.

```bash
/usr/bin/python3 -I scripts/hidrobot-groq/e2e.py                  # ensayo controlado
/usr/bin/python3 -I scripts/hidrobot-groq/e2e.py --bridge-check   # puente ADB con el teléfono conectado
```

**Ensayo controlado.** Auth sintético con dos sesiones, el adaptador real y un transporte de Groq simulado. Comprueba desde el anfitrión, sobre procesos vivos, que el servicio corre con red y procesos propios, que solo recibe `PWD` como variable de entorno, que no conserva el descriptor de la clave y que el Gateway solo escucha en `127.0.0.1`. A través del Gateway verifica 401 sin sesión, 403 con sesión desconocida, texto generado, CORS de la WebView, aislamiento entre dos sesiones, respaldo por plazo vencido y por 429, y pausa sin nueva salida. Verifica que ninguna respuesta hacia Android ni registro del sandbox contiene la clave. Termina con exactamente tres intentos simulados.

**Ensayo del puente** (`--bridge-check`). Levanta el Gateway del ensayo en el puerto 8285 con los orígenes reales del LAB y Auth sintético. Ejecuta `adb-bridge.sh switch`, comprueba desde el teléfono con `curl` por `adb reverse` que `/ready` responde 200, que `/api/chat` sin sesión da 401 y que una sesión sintética recibe modo `generated`. Después ejecuta `rollback` y comprueba que el Gateway anterior vuelve a atender. El teléfono provoca una sola generación simulada. Si algo falla, el puente se restaura igualmente.

**No son inferencia real.**

## 2. Primer ensayo real: una sola solicitud

Requiere la autorización expresa descrita al final de esta sección. Datos sintéticos únicamente: una cuenta del LAB y la pregunta pública «¿Cómo ahorrar agua?».

Por defecto el lanzador abre **una única petición a GroqCloud** durante 5 minutos (`--max-external 1 --ttl 300`, con máximo 3 peticiones). La cuota se aplica dos veces: el transporte del sandbox rechaza lo que exceda el tope y el relé no abre más conexiones al destino. Si Android envía una pregunta adicional, el servicio responde con el catálogo. El lanzador no reintenta.

1. El administrador carga una clave **nueva**, limitada a un proyecto aislado, en una terminal local con el eco desactivado. El lanzador no acepta la clave del piloto anterior, porque usa otro nombre de archivo, y rechaza una clave con más de dos horas.

   ```bash
   (
     set +x; umask 077; set -C
     IFS= read -r -s -p 'Clave de GroqCloud para el ensayo: ' k || exit 1
     printf '\n' >&2
     [ -n "$k" ] || exit 1
     printf '%s\n' "$k" > "/run/user/$(id -u)/hidrobot-groq-e2e.key"
   )
   ```

2. Inicia el ensayo. Repite antes el ensayo controlado y después abre el servicio real.

   ```bash
   /usr/bin/python3 -I scripts/hidrobot-groq/e2e.py --run
   ```

3. En otra terminal, apunta el teléfono al Gateway del ensayo. El script solo mueve el puente `adb reverse`, no toca la APK y se niega si el Gateway del ensayo no responde.

   ```bash
   scripts/hidrobot-groq/adb-bridge.sh switch
   ```

4. En Android LAB v10 inicia sesión con la cuenta sintética y pregunta «¿Cómo ahorrar agua?». La respuesta real lleva el rótulo «Orientación generada» y el enlace oficial. «Generación simulada» o un texto del catálogo indican que no se llegó a Groq.
5. Al terminar o al vencer el plazo, el lanzador comprueba que la clave no aparece en los registros del sandbox, imprime el resumen y restaura el puente al Gateway anterior.
6. El administrador revoca la clave y retira el archivo `hidrobot-groq-e2e.key`.

Se aprueba con HTTP 200 en el registro `groq`, el rótulo «Orientación generada» en el teléfono, un texto fiel a los extractos, un solo intento externo y la comprobación de ausencia de la clave.

### Cómo comprobar que la respuesta generada aparece en HidroBot

Antes de preguntar, `scripts/hidrobot-groq/adb-bridge.sh status` debe mostrar el puente hacia el puerto del ensayo. Si apunta a 8284, el teléfono habla con la demostración simulada.

| Lo que ves en HidroBot | Qué significa |
| --- | --- |
| Rótulo «Orientación generada» y enlace «Consultar fuente oficial» | La respuesta pasó por GroqCloud y superó la validación del servidor y del cliente |
| Rótulo «Generación simulada» | La respuesta vino del proveedor simulado: el puente sigue en 8284 |
| Texto sin rótulo | Respaldo del catálogo: el proveedor falló, venció el plazo, hubo cuota o se agotó el tope de una solicitud |

La comprobación se completa con tres evidencias que deben coincidir:

1. **Registro del lanzador.** Aparece una línea `{"evento":"groq","http":200,"ms":…,"tokens":{…},"texto_publico":"…"}`. El campo `texto_publico` debe ser el mismo texto que muestra HidroBot, con el mismo enlace de fuente.
2. **Resumen final.** `intentos_externos` vale 1 y `codigos_backend` está vacío. Un código como `GROQ_AUTH`, `GROQ_QUOTA` o `CHAT_PROVIDER_TIMEOUT` explica un respaldo.
3. **Captura de pantalla.** Opcional. Guárdala solo en `artifacts/`, que git ignora, y solo con la cuenta sintética a la vista:

   ```bash
   adb exec-out screencap -p > artifacts/hidrobot-groq-lab/evidencia-hidrobot.png
   ```

Una segunda pregunta («¿En pocas palabras?») ya no tendrá intento externo disponible y debe mostrar el catálogo sin rótulo. Eso confirma que el tope funciona. No cuenta como fallo.

### Regreso al Gateway anterior

El Gateway de demostración con conversación simulada (puerto 8284) no se detiene durante el ensayo. Para volver, en cualquier momento:

```bash
scripts/hidrobot-groq/adb-bridge.sh rollback
scripts/hidrobot-groq/adb-bridge.sh status
```

`rollback` restaura el puente a `127.0.0.1:8284`. Si ese Gateway no responde, no cambia el puente e imprime el comando para reiniciarlo (`node artifacts/hidrobot-groq-lab/gateway-v2.cjs <origins.json>`). `e2e.py` ejecuta el mismo regreso al terminar, incluso si el ensayo falla. Mientras el puente apunte al Gateway del ensayo, el inicio de sesión de la APK depende de que ese proceso siga activo. No hace falta reinstalar ni revertir la APK.

### Pasos reservados al operador autorizado

Solo estos pasos requieren a la persona elegible o el teléfono en sus manos. El resto se ejecutó y verificó localmente.

| Paso | Quién |
| --- | --- |
| Confirmar la elegibilidad (18 años, proyecto aislado, modelo permitido) y autorizar expresamente **una** inferencia real con datos sintéticos | Administrador de GroqCloud |
| Cargar la clave nueva con el comando del paso 1 | Administrador, en terminal local |
| Ejecutar `e2e.py --run` y `adb-bridge.sh switch` | Operador |
| Iniciar sesión con la cuenta sintética y preguntar «¿Cómo ahorrar agua?» en el POCO M4 Pro | Operador |
| Revocar la clave y retirar `hidrobot-groq-e2e.key` | Administrador |
| Revocar y retirar la clave del piloto anterior, `hidrobot-groq-pilot.key`, que este lanzador no usa | Administrador |

### Autorización necesaria

Solo una: **el administrador elegible de GroqCloud (mayor de 18 años, de un proyecto aislado con `openai/gpt-oss-20b` permitido) autoriza expresamente una única inferencia real con datos sintéticos y carga una clave nueva** de ese proyecto. No se habilita facturación ni acceso para usuarios finales.

## Límites conocidos

- El Auth del ensayo real es el LAB en `127.0.0.1:8280`. Si no responde, el servicio contesta 503 y Android conserva el catálogo.
- La verificación léxica del texto no detecta toda afirmación plausible pero incorrecta. Revisa cada respuesta real.
- El ensayo no habilita Groq para usuarios finales. Esa decisión sigue pendiente, según `docs/HIDROBOT-LAB.md`.
