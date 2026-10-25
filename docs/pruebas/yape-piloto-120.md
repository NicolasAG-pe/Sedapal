# Piloto local Yape: preparación, no recepción real certificada

Base: PR #13, `a921365`. Dependencias conservadas: PR #11 (sesión tras OTP),
PR #12 (2FA), PR #13 (operaciones y PDF). No fusionar ni desplegar estas ramas.

## Auditoría inicial y alcance

008 solo admite entorno simulado; el servidor rechaza revisión manual en producción
y las pantallas/PDF describen únicamente simulaciones. No basta sustituir la imagen
QR para representar una transferencia auténtica. Se prepara 009 aditiva para un piloto
local explícito, sin modificar 007/008 ni filas históricas. No se ejecuta en Neon.

El piloto requiere simultáneamente: NODE_ENV development/test, DATABASE_URL vacía,
DB_HOST loopback, base nueva con nombre hm_yape_pilot_* (o fixture hm_email_yape_pilot_*),
manifiesto privado 0600 propio, QR 0600 propio con huella coincidente, marcador SQL
coincidente/habilitado, un usuario/un Admin distintos, un recibo y ventana máxima de
cuatro horas. Límite de seguridad S/ 5 por recibo; el titular elige el importe, no el
programa. El importe no se toma del cliente ni representa una deuda de agua.

Una variable aislada no habilita el piloto en producción. El marcador solo se puede
insertar en bases con nombre de piloto; no se crea ni habilita al arrancar la API.
El QR jamás forma parte del frontend, APK, Git ni del PDF. Se entrega por API autenticada
solo al participante. Cambiar QR/manifiesto impide continuar hasta revisión del titular.

Estados previos conservados; entorno piloto_manual y marca piloto_ensayo distinguen
ensayo sintético de declaración humana. Confirmar exige cotejo de referencia/importe,
receptor y fecha real dentro de la ventana, motivo, rol Admin y cuenta autorizada.
Nunca se confirma por captura. No se crean pagos comerciales ni se marca Pagado el
recibo sintético. No existe una conexión con Yape que compruebe la verdad del testimonio:
la recepción la comprueba personalmente el titular en sus movimientos.

009 agrega metadatos sin reclasificar operaciones anteriores, con restricciones y
trigger adicional de inmutabilidad que permanece aunque se vuelva a ejecutar 008.
La idempotencia de operaciones simuladas del PR #13 conserva su hash anterior.

## Resultado de esta etapa

El flujo sintético y el procedimiento operativo se documentan con la validación final.
Todavía no se utilizó QR receptor real, no se transfirió dinero ni se certificó recepción.

Primer incremento backend: 36 pruebas aprobadas y 1 histórico optativo omitido entre
piloto, operaciones, concurrencia y esquema; Node 22.23.4 / PostgreSQL 18 aislado.
Repetición focalizada tras conservar hash previo y confirmación voluntaria: 15/15.
El primer arranque falló porque PostgreSQL aún estaba inicializando; se esperó readiness
sin alterar el código de la aplicación ni relajar ninguna comprobación.

## Flujo y evidencia conjunta

Cliente muestra importe exacto, recibo/suministro/período sintéticos y el QR autenticado
solo si corresponde al recibo del manifiesto. El recibo activo del piloto queda reservado
frente a edición/anulación. Piloto voluntario exige una declaración explícita; ensayos
sintéticos mantienen la advertencia de no enviar dinero. No se emiten órdenes de cobro.

Admin añade importe/identificador contrastados, fecha de recepción y cotejo del receptor.
Registra estado, actor, recepción y revisión por separado. El modo y receptor originales
no se pueden cambiar; la cuenta debe seguir activa y conservar el rol esperado.
Cliente recibe la actualización mediante Socket.IO real. El PDF distingue ensayo de
transferencia manual y excluye QR, huella del receptor y motivo libre del revisor.

El lanzador `scripts/yape-pilot.cjs` usa una base y contenedor nuevos, archivos externos
0600 en carpeta 0700, credenciales aleatorias scrypt y listeners solo loopback. No lee
.env ni hereda variables de proveedores productivos; OTP/worker quedan apagados.
`close` desactiva el marcador sin borrar registros; Ctrl+C cierra API y páginas.
Datos y contenedor se conservan. No ejecuta ninguna transferencia ni consulta Yape.

Pruebas combinadas Node22/PostgreSQL18/Chromium/PDF: **52 aprobadas, 0 fallidas y 1
histórico optativo omitido** (53 casos). Incluyen piloto, operaciones anteriores,
concurrencia/esquema, documentos y flujo completo con Socket.IO real. La expectativa
inicial de título PDF falló por comparar mayúsculas de la cabecera; se corrigió la
expectativa sin cambiar el documento y se repitió. No se suman repeticiones focalizadas.

Evidencia `artifacts/yape-piloto-120/e2e-result.json`: moneyMoved=false,
synthetic=true, lostResponse=true, wrongReferenceRejected=true, adminConfirmed=true,
realSocketUpdate=true y pdfDownloaded=true. La web exige nuevo login tras reload,
conservando su política de JWT solo en memoria; no es una regresión Android.

### Android nativo (QR sintético)

`artifacts/android-session-native-k4pbzR/result.json`: passed, 8 comprobaciones y
0 errores; 1 instrumentación Keystore + 7 de ciclo de vida/pagos/PDF, en Android15/API35.
Force-stop restaura sesión segura, se recupera UUID sin duplicar, la revisión Admin
llega por Socket.IO sin recarga, y se guardan/visualizan recibo y constancia revisada
por SAF. Se validó texto del PDF y render de la página. Un mensaje transitorio de
uiautomator (null root durante transición) se recuperó con el reintento del harness;
no se declaró un fallo de aplicación ni se eliminó el intento del log.

El texto histórico de una comprobación dice "Constancia pendiente"; este escenario
comprueba explícitamente el texto **Ensayo sintético revisado manualmente** en el PDF
real descargado después de la revisión. Es una etiqueta del harness, no una afirmación
de recepción de dinero. Teléfono físico y transferencia real siguen pendientes.

### Ejemplo PDF

`output/pdf/yape-piloto-120/constancia-yape-ejemplo-sintetico.pdf`: A4, una página,
marca **EJEMPLO SINTÉTICO - NO HUBO TRANSFERENCIA**. Muestra el formato previsto para
una revisión manual voluntaria futura usando exclusivamente datos inventados. No es
una constancia de dinero recibido. Render Poppler/Cairo revisado; no se versiona.

## Incidencias corregidas del entorno nuevo

- El primer intento se hizo antes de readiness PostgreSQL; se esperó disponibilidad.
- El período generado por el launcher excedía VARCHAR(20); se acortó, conservando el
  esquema existente. 22001 revirtió la transacción; no había datos históricos implicados.
- El extremo de cuatro horas se calcula a partir de un único instante, evitando una
  diferencia de milisegundos entre dos lecturas del reloj.
- CORS se restringe explícitamente a los dos orígenes locales del launcher y los orígenes
  Capacitor existentes, sin comodines ni listeners de red pública.

## Actuaciones humanas pendientes

Seguir [el procedimiento completo](../yape-piloto-local.md): instalar privadamente el QR
PNG autorizado, preparar --real-voluntary --receiver-authorized, revisar destinatario
personalmente, enviar fuera de Hidro-Mejora solo por decisión voluntaria y contrastar
recepción en los movimientos de Yape antes de confirmar. Codex no recibió QR real ni
credenciales bancarias. Ninguna prueba automática implica recepción bancaria comprobada.

El marcador solo bloquea la aplicación: no puede revocar un QR ya visto ni impedir una
transferencia humana externa después de cerrar la ventana. La deduplicación es por base;
no existe conciliación global entre bases de ensayo ni confirmación automática comercial.
Solo una pasarela autorizada y un contrato verificado permitirían esa siguiente etapa.

Regresiones adicionales: 43 pruebas de piloto/pagos, OTP-auto-login, 2FA usuario/Admin
y sesiones aprobadas. Una prueba explícita de upgrade 008→009 conserva todos los campos
anteriores de operaciones/pagos y agrega metadatos nulos, sin atribuir recepción; 8 casos
de piloto finales aprobados. Esos casos solapan el conjunto combinado anterior.

El flujo UI previo de pagos (3 casos) y el nuevo piloto (1 caso) volvieron a pasar tras
fijar la hora de recepción en America/Lima, independiente del navegador. El último ciclo
del launcher se verificó incluyendo cierre de API, marcador y contenedor propio, conservando
su almacenamiento. Docker remoto se rechaza antes de crear recursos; QR real dentro del
repositorio también se rechaza. Solo el titular podrá aportar un PNG externo autorizado.

Java21/Gradle: BUILD SUCCESSFUL, 4 JUnit y lint sin errores (16 advertencias previas).
Runtime final local devuelto a API pública HTTPS, sin generar ni publicar una release.

Cierre de reproducibilidad: las suites crean su carpeta de evidencia aunque no existan
artefactos previos. Al reiniciar el PostgreSQL tmpfs de tests, Docker reasignó su puerto
loopback: una repetición falló por conservar el puerto anterior; se obtuvo nuevamente el
puerto real y la repetición final pasó 9/9 (8 backend + 1 E2E). El launcher además comprueba
que el contenedor esté activo y que su puerto actual coincida con el estado privado, para
no contactar otro servicio por un dato obsoleto. No se cambiaron contraseñas ni destinos
productivos. Estos 9 casos solapan los conjuntos ya informados.
