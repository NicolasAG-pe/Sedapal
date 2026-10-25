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
  normalizada única. Locks suministro -> recibo -> operación, transacción y timeouts.
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
