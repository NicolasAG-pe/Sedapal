# Pagos y documentos: desarrollo previo a 1.2.0

Rama `feature/pagos-pdf-120`, base verificada `e01c9a2` de `feature/seguridad-totp`.
PR #11 y #12 siguen Draft. No publicar 1.2.0 ni aplicar 007/008 en producción.

## Auditoría y decisión de alcance

El antiguo `POST /api/pagos` insertaba una demostración en `pagos` y marcaba el recibo
como Pagado sin una transacción financiera. Se elimina ese camino de acreditación.
Una APK antigua que no envía UUID recibe 409 explicativo: nunca 201 que su interfaz
pueda interpretar como deuda cancelada. Debe actualizarse antes de declarar operaciones.
Las consultas de pagos históricos siguen disponibles; no se cambian sus filas,
estados de recibo ni se les atribuye confirmación bancaria. Reconciliar históricos
requiere una revisión autorizada separada, nunca reclasificación automática.

008 agrega operaciones, historial y deduplicación de eventos, sin modificar tablas
históricas ni datos. Exige 007. Nuevas operaciones quedan explícitamente en entorno
`simulado`; ni una decisión manual ni una aprobación del simulador inserta `pagos`
o cambia la deuda a Pagado. Esta barrera de base de datos impide habilitar cobros reales
con un cambio accidental de variable. La habilitación financiera futura requiere otro
avance revisado, conciliación real y autorización.

Estados: demostrativa; declarada; pendiente_verificacion; verificada_manual;
acreditada_proveedor; rechazada; cancelada; reembolsada. Declarada y pendiente se registran
en la misma transacción. El servidor controla las transiciones; no acepta estado,
importe, actor ni fecha desde el cliente. Motivo, administrador y fecha se auditan.

## Controles

- UUID por usuario y hash del contenido: repetir recupera el mismo resultado; cambiar
  contenido devuelve conflicto. Una sola operación activa por recibo y referencia
  normalizada única al verificarla. Las declaraciones duplicadas se advierten: una persona no puede reservar una referencia ajena sin prueba. Locks suministro -> recibo -> operación, transacción y timeouts.
- Verificación manual exige motivo y declaración explícita de revisión del movimiento
  independiente. El comprobante nunca aprueba automáticamente; no autorrevisión.
- PNG opcional hasta 1 MB / 2048 px, límites antes de decodificar, CRC y recodificación
  sin metadatos. Rechaza SVG, JPEG y formatos no soportados con mensaje explícito.
  Acceso propietario/Admin con JWT, sin enlaces públicos ni caché.
- QR privado externo 0600 y sin symlink; nunca datos personales en fuentes.
- `PAYMENTS_MANUAL_ENABLED=0`; además se rechaza en NODE_ENV=production incluso con flag1.
- Proveedor simulado inyectado en laboratorio: iniciar, consultar, evento firmado HMAC,
  reloj acotado, deduplicación, validación de importe/moneda/vinculación y conciliación.
  Ninguna ruta pública permite resolver/aprobar el simulador. No es un sandbox comercial.

## Pruebas

Resultados y ejemplos se completan con los siguientes incrementos. Las pruebas se
realizan en PostgreSQL 18 nuevo, tmpfs, `hm-pagos120-pg`, datos example.invalid;
Node.js 22 en Docker. Nunca Neon, correos ni cuentas financieras reales.

Primer incremento backend: 30 pruebas aprobadas, 0 fallidas y 1 caso histórico
optativo omitido (`HIDRO_RECEIPT_TEST_LEGACY`) entre payment-operations,
receipt-concurrency y receipt-schema, en Node 22 / PostgreSQL 18 aislado.
La primera regresión falló por esperar el mensaje antiguo de error del servicio;
se actualizó la expectativa al error público genérico de operaciones y se repitió
el conjunto. No se ocultaron errores de SQL ni se imprimieron datos privados.

## Interfaces y recuperación

Cliente: importe exacto, suministro y período; QR por petición autenticada; referencia
y PNG opcional; estado pendiente explícito. Un UUID se conserva en memoria durante
un resultado incierto y permite repetir el mismo contenido sin duplicar; una solicitud
con otro contenido no se reenvía a ciegas. El historial consulta la operación por su
ID exacto, incluso si fue rechazada/cancelada, y permite cancelar una declaración pendiente.
No se marca Pagado en el cliente. Logout borra formulario, referencias, imágenes/blob,
solicitudes en memoria y credencial mediante el mecanismo de sesión existente.
Después de terminar el proceso, consultar el historial recupera la operación del servidor;
la restricción única impide otra declaración activa aunque se pierda la UUID local.

Admin: sección de revisión con estados de prueba, motivo obligatorio y confirmación
de comprobación independiente; historial con actor y hora, evidencia autenticada,
prevención de solicitudes duplicadas y aviso de consultar historial si se pierde respuesta.
Los eventos Socket.IO existentes actualizan propietario y Admin; no se emiten imágenes.

3 pruebas Chromium/API/PostgreSQL aprobadas en Node 22.23.4: pérdida de respuesta y
recuperación de la misma UUID, revisión Admin y logout sin imágenes ni referencias.
Chromium móvil no equivale a Android nativo; este se informa por separado.

## Revisión adicional de referencias

Se corrigió un riesgo del primer diseño: hacer única globalmente una referencia
meramente declarada permitiría reservar una referencia ajena sin demostrar titularidad.
Ahora se normalizan espacios/guiones, se avisa al revisor de las coincidencias y la
unicidad se exige al confirmar manualmente. Dos confirmaciones concurrentes de la misma
referencia no pueden aprobarse; una declaración falsa no bloquea el registro de la legítima.
El motivo/revisión independiente sigue siendo obligatorio. Los pendientes se priorizan
en la lista Admin. Referencias vacías compuestas por separadores se rechazan.

La repetición SQL final de pagos/recibos pasó 30 pruebas, 0 fallidas y 1 histórico
optativo omitido. Se añadió comprobación explícita del rechazo seguro de la APK antigua
sin UUID. Un fallo anterior de permisos se debió a reutilizar un PNG 0600 creado por el
contenedor root: el fixture ahora utiliza un directorio nuevo por ejecución, sin relajar
permisos ni modificar recursos de aplicación.
