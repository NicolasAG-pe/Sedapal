# Modelo de datos existente — DB-01

No propone DDL ni cambios de migraciones.

| Entidad | Relación y atributos pertinentes | Invariante |
|---|---|---|
| suministros | Padre de recibos | Conservar bloqueo de padre y pertenencia |
| recibos | id_recibo, id_suministro, estado, periodo, monto y fechas | Pagado no se edita/anula; conservar validaciones y unicidad existente |
| pagos | id_recibo | Cualquier fila legacy bloquea |
| operaciones_pago | id_recibo, estado | Bloquean declarada, pendiente_verificacion, verificada_manual, acreditada_proveedor |
| control_piloto_yape | id_recibo, habilitado, vence_en | Opcional; bloquea solo habilitado y vigente |

## Perfiles sintéticos de verificación

P-PROD-MIN: base previa a 007 admitida por el fixture existente + 007 + 008 + 014; ausencia de 009/010 y de control_piloto_yape. Sirve para recibos/pagos, no para proclamar arranque completo con todas las capacidades 1.2.0.

P-LAB: init.sql del SHA base (contiene piloto); comprobar catálogo y columnas necesarias antes de insertar fixtures. No aplicar 014. Si el harness API requiere 011/012, aplicarlas únicamente a esta nueva base como prerrequisitos documentados; no confundirlas con parte del init.sql.

Una integración API que requiera capacidades adicionales usará base aislada + 007/008/011/012/013/014 sin 009/010, revisando prerrequisitos y evitando reaplicar cambios ya contenidos en la base. La selección exacta se verificará al adaptar el harness, antes de declarar un perfil completo.

Transición permitida: recibo elegible mantiene estado al editar y pasa a Anulado al anular. Un bloqueo devuelve conflicto y no modifica datos. Operaciones demostrativas no acreditan deuda. Ninguna corrección habilita cobros, piloto, recuperación, MFA o push reales.
