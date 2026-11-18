# Preparación de Billing

## Límites y dependencias

| Dependencia actual | Condición para extraerla |
|---|---|
| `receipt-transactions.js` y `payment-operations.js` coordinan las escrituras bloqueando suministro → recibo → operación. Editar o anular relee pagos históricos, operaciones activas y el piloto después de adquirir los locks. | Conservar el orden de locks, los límites de espera y una sola transacción para la decisión y escritura. Mantener recibos y pagos bajo un solo escritor. |
| `recibos` referencia a `suministros`. `pagos`, `operaciones_pago`, su historial y `eventos_pago_proveedor` enlazan recibos, titulares y actores administrativos. `control_piloto_yape` enlaza recibo, titular y revisor. | Probar constraints y triggers de integridad y auditoría en el perfil con piloto y el perfil compatible 008/014. Mantener la relación referencial y el bloqueo de suministro antes de evaluar otra base. |
| `requiereAuth` valida rol, cuenta activa, MFA y suministro contra PostgreSQL. Las operaciones del usuario vuelven a comprobar pertenencia en SQL. La revisión exige rol admin y otra persona revisora. | Derivar actor y suministro en servidor. Probar titular ajeno, revisor propio, revocación concurrente y fallo de Auth. Una introspección previa requiere una garantía adicional al confirmar. |
| El cliente y Android consultan `/api/me/recibos`, `/api/me/pagos` y operaciones de pago. El panel crea, modifica y anula recibos y combina consultas de pagos, operaciones, usuarios y resumen. Las rutas legacy preservan forma y permisos. | Mantener rutas, estados HTTP, campos, fechas, importes, PDF/PNG y distinción entre operación registrada y deuda pagada. Tratar los agregados administrativos como lecturas compuestas. |
| Backend emite `recibo:nuevo`, `recibo:actualizado`, `pago:nuevo` y `pago:registrado` después de confirmar. Las salas son privadas por suministro o rol. `notificaciones.push_recibo` tiene FK a recibos y el trigger de notificaciones encola entregas. | Definir outbox transaccional, deduplicación y reconsulta REST. Preservar el encolado push y probar caída entre COMMIT y publicación, reconexión y aislamiento de salas. |
| La clave `solicitud_id` enlaza reintentos del titular con la huella del payload. Los eventos de proveedor se deduplican por ID y huella. El simulador actual guarda su estado en memoria. | Probar respuesta perdida después de COMMIT, duplicados válidos y conflictivos, reinicio y conciliación. Un proveedor real requiere su propio límite de transacción y una prueba aparte. |

## Orden de implementación

1. **Contrato y pruebas de caracterización.** Fijar el inventario de rutas de recibos, pagos y agregados, y registrar los resultados para el esquema completo y el compatible. Repetir carreras crear/editar/anular frente a declarar/revisar y casos con importes, recibos históricos y referencias duplicadas.
2. **Límite interno con la misma base aislada.** Agrupar los manejadores de Billing detrás de las rutas actuales. Mantener el SQL y el escritor único. Preparar migrador separado y permisos mínimos sobre tablas de Billing, con acceso explícito y acotado a suministro y actor. Probar permisos negativos y vigencia de autorización al confirmar.
3. **Eventos y lecturas compuestas.** Persistir la intención de los eventos en la misma transacción que el cambio y hacer idempotente el consumidor. Mantener los contratos de Socket.IO y push. Probar que el panel y el cliente convergen tras una interrupción. Comparar lecturas paralelas en el laboratorio sin duplicar escrituras.
4. **Proceso Billing bajo activación explícita en el laboratorio.** Enrutar todas las escrituras de recibos y pagos al mismo escritor después de drenar las solicitudes. Mantener entrada pública y esquema aditivo. Probar que el corte y el rollback conservan historial, claves idempotentes y eventos pendientes. Resolver una respuesta perdida consultando por UUID antes de reintentar.
5. **Evaluar una base independiente.** Avanzar cuando haya una alternativa probada a los locks y FK compartidos y se hayan validado los flujos de navegador y del APK contra la entrada compatible. Detener el corte ante divergencia de deuda, recibos, auditoría u operaciones.

En este avance Billing conserva sus rutas y transacciones en Backend. La
primera tarea es ampliar las pruebas de caracterización y fijar las garantías
de autorización y concurrencia que exige el paso 2.
