# Pagos: verificación manual y selección de sandbox

Consulta de documentación oficial: 25 de octubre de 2026. No se abrió una cuenta
comercial, contrató un servicio, activó facturación ni utilizó un medio de pago real.
Gasto de desarrollo en este avance: S/ 0; se reutilizaron Docker, PostgreSQL y herramientas locales.

## Alternativas investigadas

| Opción | Evidencia oficial y ajuste | Pendiente antes de integrar |
| --- | --- | --- |
| Culqi Online / Yape | Entorno Integración separado de Producción; simula ventas. Ofrece integración Yape y Checkout. Su documentación describe webhooks, pero la página revisada no demuestra un contrato de firma equivalente al de Mercado Pago. | Cuenta/llaves test autorizadas, condiciones del comercio y comprobación de autenticidad por contrato vigente. Consultar cargo/orden por API; nunca confiar solo en un POST recibido. Checkout embebido no equivale necesariamente a checkout alojado. |
| Mercado Pago Checkout Pro | Checkout en el proveedor, credenciales/cuentas de prueba y webhooks con `x-signature` HMAC; permite URL de prueba. Mejor encaje documental para checkout alojado. | Cuenta de desarrollador, credenciales de prueba y secreto de firma autorizados. Verificar medios disponibles en Perú y contrato comercial. No se presupone compatibilidad Yape. |
| Yape - revisión manual | QR y movimientos revisados por el receptor; no se integra acceso a notificaciones, PIN ni credenciales de Yape. | Receptor autorizado, procedimiento de revisión independiente, privacidad, conciliación y autorización de cobros. No se verificó una API pública directa utilizable en este proyecto. |

Culqi publica para Online/Link 3.44% para Yape y una comisión fija de USD 0.20;
el tarifario contiene mínimos, condiciones e impuestos aplicables. Confirmar tarifa
contractual antes de producción. Mercado Pago indica comisiones según el plazo para
disponer del dinero y sin costos fijos, no se presupone una tarifa única. Yape Empresa
publica un servicio de recaudación de 2.95% de las ventas diarias recibidas por QR,
contacto o número. No confundir ese producto comercial con un entorno de pruebas.

Fuentes primarias:

- [Culqi: Integración vs Producción](https://docs.culqi.com/es/documentacion/pagos-online/integracion-vs-produccion)
- [Culqi: Yape](https://docs.culqi.com/es/documentacion/pagos-online/cargo-unico/tokens-yape)
- [Culqi: Webhooks](https://docs.culqi.com/es/documentacion/pagos-online/webhooks/)
- [Culqi: tarifario Online/Link](https://culqi.com/precios/)
- [Mercado Pago: Checkout Pro](https://www.mercadopago.com.pe/developers/es/docs/checkout-pro-preferences/overview)
- [Mercado Pago: autenticación Webhooks](https://www.mercadopago.com.pe/developers/es/docs/your-integrations/notifications/webhooks)
- [Mercado Pago: condiciones de cobro](https://www.mercadopago.com.pe/herramientas-para-vender/check-out)
- [Yape: costo Empresa](https://www.yape.com.pe/preguntas-frecuentes/yape-empresa/yape-empresa-tiene-algun-costo)

## Lo implementado y su límite

`Backend/payment-provider.js` define el contrato iniciar/consultar/verificarEvento y
un **simulador en memoria**, solo inyectado en pruebas. HMAC es del simulador, no una
implementación del protocolo Culqi/Mercado Pago. No hay endpoint público de webhook
ni botón para aprobar una transacción externa. Los resultados de laboratorio están
identificados como `simulado` en SQL, API, interfaz y PDF. No cancelan deuda.

Se probaron inicio idempotente, aprobación, rechazo, cancelación, timeout, evento
repetido, firma incorrecta/vencida, importe discordante, confirmación tardía después
de timeout y reembolso simulado. La consulta al proveedor es la fuente del estado;
un evento con el mismo ID y contenido incompatible no se acepta. Una operación
finalizada incompatible se detiene para conciliación, no se fuerza otro estado.

Para un adaptador comercial se necesita una fase duradera de inicio con idempotencia
ante timeout/reinicio (el simulador no hace I/O externo dentro de la transacción),
credenciales test privadas, firma oficial, verificación server-to-server del importe,
moneda, comercio y orden, persistencia de eventos, conciliación programada y pruebas
de reembolso/contracargo. No se debe sustituir el simulador por llamadas de red sin
resolver esa frontera transaccional. Tampoco asumir entrega ordenada de webhooks.

## Revisión Yape

`PAYMENTS_MANUAL_ENABLED=0` por defecto. Esta implementación rechaza revisión/declaración
manual en `NODE_ENV=production`, aun si se cambia accidentalmente el flag. 008 permite
solo entorno simulado. **No está lista para recibir dinero real.** Su habilitación
requiere otro cambio de alcance y autorización, además de auditoría financiera.

El QR se obtiene de `YAPE_QR_FILE` privado 0600 fuera de Git y se entrega solo a una
sesión autenticada. En pruebas se usa exclusivamente una imagen sintética, sin receptor
bancario. La imagen se puede ver/descargar desde el dispositivo autorizado: no contiene
secretos de autenticación, pero un QR receptor real sí puede revelar datos del receptor;
requerirá su consentimiento. Nunca ponerlo en código, frontend estático ni APK.

Un revisor consulta sus movimientos por separado, coteja importe y referencia, descarta
reutilización y registra motivo. Captura, declaración, nombre, correo o número de
suministro no acreditan dinero. No se admiten PIN/contraseñas ni lectura de notificaciones.
La tabla `pagos` anterior no prueba recepción bancaria; sus registros se conservan
sin reclasificarlos. Recuperación ante errores se basa en consulta e idempotencia,
no en borrar históricos ni repetir cobros a ciegas.
