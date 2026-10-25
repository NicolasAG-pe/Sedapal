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
