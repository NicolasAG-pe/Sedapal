# Yape: piloto local voluntario y comprobación personal

Estado: preparado para ensayo; **todavía no se realizó ni certificó una transferencia
real en esta etapa**. PR #14 depende de PR #13, que depende de #12 (incluye #11).
No publicar 1.2.0, aplicar 007/008/009/010 a Neon, desplegar ni cambiar cuentas productivas.

## Qué significa cada resultado

| Tipo | Qué afirma Hidro-Mejora | Qué NO afirma |
| --- | --- | --- |
| Demostración / simulador | Operación de software sin movimiento financiero. | Que entró dinero. |
| Piloto sintético | Ensayo de los mismos formularios, auditoría y notificaciones, marcado como sintético en SQL/API/PDF. | Que ocurrió una transferencia auténtica. |
| Piloto voluntario revisado | Un Admin autorizado declara que contrastó personalmente un movimiento receptor de Yape. | Que Yape confirmó por API, que se pagó agua, o que el PDF tiene valor oficial. |
| Pasarela comercial | No implementada/activada aquí. | Cobro automático o conciliación comercial completados. |

El backend **no comprueba una cuenta bancaria** ni puede garantizar la veracidad de un
administrador. No utiliza PIN, contraseñas, notificaciones de Yape ni automatiza el envío.
Nunca tratar una captura, sonido o mensaje del remitente como acreditación automática.

## Requisitos

- Node.js 22, Docker, repositorio de esta rama y dependencias: `npm ci` y
  `npm ci --prefix Backend`. No leer ni exportar `.env` productivos.
- PostgreSQL 18 local nuevo: lo crea el lanzador con nombre, puerto loopback y
  contraseña aleatorios. No reutiliza bases/volúmenes existentes, ni necesita Neon.
- Dos cuentas Yape cuyos titulares consientan voluntariamente la operación, fuera
  de Hidro-Mejora. No proporcionar sus credenciales al proyecto ni a Codex.
- El titular decide el importe (dos decimales, > 0 y hasta S/ 5 por límite del piloto).
  No se solicita ningún pago para activar la aplicación ni se debe dinero por el recibo.

## 1. Ensayar primero sin dinero

```sh
npm run yape:pilot -- prepare --synthetic --amount 1.00
```

El comando imprime únicamente la ruta del **estado privado**. Crea un QR textual de
ensayo sin cuenta receptora y credenciales sintéticas; no envía correos ni dinero.

```sh
npm run yape:pilot -- start --state /RUTA/PRIVADA/state.json
```

Mantener esta terminal abierta. Imprime URLs loopback de Cliente, Admin y API, más
la ruta privada de credenciales. Abrir Cliente y Admin en pestañas separadas e iniciar
con las dos cuentas sintéticas del archivo `credentials.json`, solo desde la laptop.
Las contraseñas no se imprimen ni se cargan en el frontend; no compartir el archivo.
El perfil web no persiste JWT tras recargar: volver a iniciar sesión es intencional.

Declarar una referencia sintética, revisar desde Admin y comprobar la actualización
en el cliente. Un ensayo verificado debe decir **Ensayo sintético revisado manualmente**.
En Admin: Pendientes de revisión → Revisar → marcar la aceptación del ensayo → Confirmar ensayo. No se solicitan importe bancario, recepción ni fecha ficticios. La revisión y el administrador se registran automáticamente. Su constancia conserva esa distinción. No escanearlo intentando hacer una transferencia.

Cada repetición debe ejecutar de nuevo `prepare --synthetic`: crea otra base, cuentas, UUID y recibo, sin borrar ni desbloquear los anteriores. Después de declarar, usar **Ver estado e historial**; un rechazo/cancelación tampoco permite otra transferencia con ese piloto.

## 2. Configurar un QR auténtico privadamente (titular)

Guardar/exportar el QR receptor autorizado como PNG. Verificar visualmente que pertenezca
al titular esperado en la aplicación Yape; el programa valida formato e integridad de la
imagen, **no la titularidad bancaria**. PNG hasta 1 MB y 2048 px; no JPEG/SVG.

```sh
install -d -m 700 "$HOME/.config/hidro-mejora"
test ! -e "$HOME/.config/hidro-mejora/yape-receptor.png" && \
  install -m 600 /RUTA/AL/QR-AUTORIZADO.png "$HOME/.config/hidro-mejora/yape-receptor.png"

npm run yape:pilot -- prepare --real-voluntary --receiver-authorized \
  --qr "$HOME/.config/hidro-mejora/yape-receptor.png" --amount 1.00
```

Si ese archivo ya existe, conservarlo y elegir otro nombre privado; no sobrescribirlo.
El lanzador rechaza un QR real dentro del repositorio.

`--receiver-authorized` es la declaración del titular de que puede usar ese QR; no una
verificación del banco. No ejecuta una transferencia. El lanzador copia una versión PNG
sin metadatos a un directorio privado nuevo, con `state.json`, `pilot.json` y credenciales
0600 bajo `~/.config/hidro-mejora/yape-pilot/<id>/`. Ningún archivo se sobrescribe.
**No enviar estos archivos por chat ni subirlos a GitHub.** El QR también puede revelar
nombre/datos del receptor al visualizarse: no compartir capturas ni un APK con esos datos.

Iniciar usando **la ruta nueva de state.json** como en el ensayo. No editar el manifiesto,
cambiar el QR a mitad del piloto ni copiar su configuración a Render. La huella del QR
queda vinculada a las operaciones; un cambio provoca bloqueo. El servidor rechaza
NODE_ENV production, DATABASE_URL o DB_HOST remoto, base sin marcador y cuentas ajenas.

## 3. Transferencia voluntaria fuera de Hidro-Mejora

1. El usuario sintético selecciona el único recibo autorizado. Revisar importe,
   suministro sintético y período. No representa deuda oficial de SEDAPAL.
2. Seleccionar Yape. Debe mostrarse **Piloto voluntario**, nunca un mensaje de cobro
   automático. El QR solo se obtiene tras autenticar al participante y validar el piloto.
3. Antes de enviar dinero, el titular del remitente comprueba en su propia aplicación
   Yape el receptor y el importe. Si hay duda o discrepancia, **no enviar**.
4. Si ambos titulares deciden continuar, el remitente hace personalmente la transferencia
   fuera de Hidro-Mejora. Codex ni la API realizan esa acción.
5. Registrar una referencia identificadora de la operación y, opcionalmente, un PNG
   redactado de prueba. No registrar PIN, contraseña, códigos de seguridad/OTP de Yape,
   números completos de cuenta ni información personal innecesaria.
6. Confirmar la declaración voluntaria. El estado debe ser **Pendiente de comprobación**.
   Desde la primera declaración, el piloto no vuelve a mostrar el QR, incluso si se
   rechaza/cancela; evita inducir otra transferencia. Esos estados no devuelven dinero.
   Una respuesta perdida se recupera con el mismo UUID; consultar historial antes de
   repetir. **Nunca repetir una transferencia por un error de conexión de Hidro-Mejora.**

Si el banco no muestra una referencia suficiente o no puede contrastarse con seguridad,
no confirmar en Admin. No inventar referencias ni guardar secretos para suplirla.

## 4. Comprobación personal en Admin

El titular receptor consulta por separado sus movimientos en Yape. La documentación
oficial indica que allí se puede revisar nombre, fecha e importe; no incorporamos esos
datos privados automáticamente. [Movimientos de Yape](https://www.yape.com.pe/preguntas-frecuentes/enviar-y-recibir-yapeos/98--como-veo-mis-movimientos).
BCP recomienda verificar la recepción en los movimientos de la aplicación.
[Prevención de fraude](https://www.viabcp.com/seguridad/como-prevenir-fraudes-yape).

1. Abrir **Admin → Pagos → Operaciones y revisión manual** con la cuenta Admin sintética
   autorizada. No usar una cuenta productiva ni modificar usuarios existentes.
2. Identificar operación, recibo/suministro y el rótulo de piloto voluntario. El comprobante
   adjunto es solo un indicio protegido; no prueba automática.
3. Contrastar personalmente **recepción efectiva, importe exacto, referencia, fecha y
   receptor autorizado**. No autorrevisión desde la cuenta del declarante.
4. Si no llegó, hay discrepancia o no puede comprobarse, **rechazar con motivo**; no
   completar campos con datos inventados. Se conserva el historial y no se elimina nada.
5. Solo si coincide: abrir **Revisar**, ingresar el importe con dos decimales y la referencia comprobada. El formulario compara ambos con la declaración y enfoca cualquier discrepancia. No existe un input editable de fecha de revisión.
6. Marcar ambas comprobaciones de recepción independiente y receptor autorizado. El motivo de rechazo es obligatorio; el de confirmación es opcional y tiene un texto seguro predeterminado. PostgreSQL registra la fecha y el administrador. La fecha real del movimiento bancario es distinta: si no se informó, permanece NULL y el PDF dice «Fecha bancaria no registrada»; no se sustituye por la hora de revisión. La API conserva el campo opcional con validación de ventana/zona para integraciones autorizadas.
7. Comprobar **Transferencia verificada manualmente** en Admin y Cliente, con actualización
   por Socket.IO. Si se pierde la respuesta, consultar el historial; no repetir el dinero.
8. Descargar constancia: UUID interno, recibo/suministro sintéticos, importe, referencia,
   recepción comprobada y revisión/actor. No incluye QR, identidad receptora ni motivo libre
   que pudiera contener datos privados. No acredita un servicio de agua ni una pasarela.

## 5. Android físico (pendiente de actuación del titular)

Las APK públicas 1.1.1/1.1.2 apuntan al backend productivo y **no sirven para este piloto**.
No apuntar esas cuentas ni sus recibos a esta base de ensayo. Usar un debug privado
compilado de esta rama, sin cambiar ni publicar la versión 1.2.0 ni la clave permanente.

Con dispositivo propio autorizado, depuración USB y el API_PORT impreso por el lanzador:

```sh
adb -s SERIAL-AUTORIZADO reverse tcp:API_PORT tcp:API_PORT
API_BASE_URL=http://127.0.0.1:API_PORT npm run cap:sync
bash scripts/android-gradle.sh :app:assembleDebug
```

Instalar únicamente el debug en un dispositivo/perfil de prueba independiente. No
desinstalar una APK release para resolver un conflicto de firmas, porque borraría sus
sesiones/datos. No utilizar `adb install` sin confirmar el dispositivo de prueba.
El QR se obtiene dinámicamente del backend local; no se empaqueta. Se puede mostrar
el Cliente en la laptop y escanear desde un teléfono autorizado para evitar fotografiar
una pantalla desde el mismo dispositivo. Mantener privado cualquier material real.
La prueba nativa automatizada usa AVD independiente y QR sintético; **no equivale a una
prueba física ni de recepción bancaria**. HTTP loopback por USB es solo para este debug,
no se debilita HTTPS productivo ni se publica la API por LAN/túneles.

## 6. Cierre y conservación

Coordinar primero que los participantes ya no enviarán dinero. Después:

```sh
npm run yape:pilot -- close --state /RUTA/PRIVADA/state.json
```

El marcador bloquea QR/declaraciones/confirmaciones posteriores. Detener el servidor
con Ctrl+C y parar **solo el contenedor propio** cuyo nombre figura en state.json.
Conservar el estado privado y el almacenamiento para revisar auditoría. No borrar volúmenes,
restaurar otra base ni reutilizar un piloto cerrado editando SQL/manifiestos. Cada preparación
es una base nueva; la deduplicación no es un registro bancario global entre bases distintas.

Una imagen ya vista/guardada no se puede revocar ni impedir que un humano la use después
fuera de Hidro-Mejora. La ventana bloquea la aplicación, no la cuenta Yape. Resolver cualquier
incidencia real entre titulares mediante los canales oficiales; el sistema no ejecuta
reembolsos ni borra evidencia. Una operación rechazada no devuelve dinero automáticamente.

## Qué falta para confirmación automática

Credenciales/contrato de pasarela autorizados, firma oficial de eventos, consultas
server-to-server de comercio/importe/moneda, inicio duradero idempotente, conciliación,
reembolsos/contracargos y aprobación de publicación. No se implementa lectura de
notificaciones privadas como alternativa. Piloto manual no equivale a integración comercial.
