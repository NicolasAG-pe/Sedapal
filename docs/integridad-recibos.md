# Integridad de recibos y pagos — corrección H02

Avance 13, 18 de octubre de 2026. Rama `feature/verificacion-correo`.
El diagnóstico previo pertenece al commit `477a39c` y a [H02 de la auditoría](auditoria-produccion.md).
Esta corrección está validada en desarrollo; no se ha desplegado ni migrado Neon.

## Causa y reproducción previa

Se revisaron todas las escrituras de recibos/pagos del servidor: alta, edición,
anulación administrativas y pago propio. No hay rutas de borrado ni de reasignación
de recibos/pagos. El esquema anterior tiene PK, FKs usuario → suministro → recibo
→ pago y CHECK de estado, pero carece de UNIQUE suministro/periodo y pago/recibo.

Antes de modificar la implementación se ejecutaron cinco pruebas con API real y
PostgreSQL aislado. Cuatro fallaron reproduciendo H02 y una de permisos pasó:

| Intercalación controlada | Resultado anterior incorrecto |
| --- | --- |
| Dos altas leen ausencia de duplicado antes de insertar | `201/201`, dos recibos del mismo suministro/periodo. |
| Editar lee ausencia de pago; pagar confirma; editar actualiza | Recibo S/ 20, pago S/ 10. |
| Anular lee ausencia de pago; pagar confirma; anular actualiza | Pago 201 y anulación 200 sobre el mismo recibo. |
| Pagar mantiene lock; editar/anular ya leyeron ausencia de pago | Pago 201 y ambas modificaciones 200 después del pago. |

Las comprobaciones eran operaciones SQL independientes; meter solamente los UPDATE
en transacciones no habría protegido las lecturas anteriores. Tampoco basta confiar
en el estado del panel ni devolver `tiene_pago=false` en una respuesta.

## Protocolo transaccional implementado

`Backend/receipt-transactions.js` concentra las cuatro operaciones. Las rutas
conservan middleware JWT/admin/propiedad, URLs, cuerpos y respuestas de éxito.

1. Abrir una transacción explícita `READ COMMITTED`, con conexión dedicada.
2. Obtener el suministro y bloquearlo `FOR NO KEY UPDATE`.
3. Para un recibo existente, bloquear después su fila `FOR UPDATE OF r`,
   revalidando que sigue perteneciendo al suministro leído. La lectura inicial
   del identificador del padre no decide autorizaciones ni estados finales.
4. Consultar pagos en **otra sentencia después del bloqueo**. Esto ve el pago
   que pudo confirmarse mientras la operación esperaba; no se reutiliza un
   `EXISTS` obtenido con un snapshot anterior al lock.
5. Comprobar duplicados/estado y ejecutar la escritura; confirmar y liberar.
   Ante cualquier error, rollback; si rollback falla, descartar la conexión.

El orden es suministro → recibo → pago en todas las rutas. Un escritor de estas
rutas toma un solo suministro y un solo recibo por operación, evitando órdenes
opuestos al editar periodos. Se serializan escrituras del mismo suministro,
incluso antes de instalar 005; otros suministros pueden avanzar. Es una decisión
conservadora de concurrencia, con posible contención por suministro de mucho uso.
El lock del suministro también estabiliza su propietario durante el pago, que
revalida el usuario y suministro autenticados, sin aceptar esos datos del body.

Los pagos usan el monto PostgreSQL bloqueado, nunca el monto enviado por el
cliente. Recibo y pago se confirman juntos. Editar/anular rechaza tanto la
presencia de un pago como estado `Pagado`, incluso ante datos históricos
inconsistentes. Pagar rechaza estado anulado, un pago existente o un periodo
duplicado histórico: conserva las filas y exige revisión, evitando otro cobro.

Se mantiene la edición de un recibo anulado **sin pago**, que el panel ya permitía;
no se cambia su estado. Anular de nuevo un anulado sin pago sigue devolviendo 200.
Las notificaciones/sockets se emiten después del commit y fuera de su conexión.
La notificación persistente de alta continúa siendo opcional; no forma parte de
la atomicidad financiera ni puede convertir un conflicto en un alta adicional.

Tiempos por transacción: lock 2 s, sentencia 5 s, ociosidad en transacción 10 s.
No hay reintentos ciegos de escrituras ni red externa dentro de estas transacciones.
La espera de adquisición del pool conserva la configuración general de la API:
el presupuesto global de conexiones de H04 sigue pendiente.

| Caso | HTTP |
| --- | --- |
| Alta / pago confirmados | 201, con los campos anteriores. |
| Edición / anulación confirmadas | 200, con `estado`, `recibo`. |
| Datos inválidos | 400; id inexistente/ajeno, 404. |
| Duplicado, pago existente, estado incompatible, lock timeout, deadlock detectado o serialización abortada | 409 y mensaje público sin SQL. La operación revierte; actualizar datos antes de decidir reintento. |
| Timeout de sentencia | 503; no se publican detalles de PostgreSQL. |
| Error inesperado | 500 genérico; log fijo sin objeto SQL ni datos privados. |

La API también convierte UNIQUE/FK en conflictos seguros. La restricción SQL es
la defensa final si otro escritor se intercala entre comprobación e INSERT.
Si se pierde la conexión durante COMMIT, el resultado puede ser desconocido:
consultar estado antes de reintentar; no afirmar que un error implica que nunca
se confirmó. La unicidad y la consulta de pagos evitan repetir un cobro por API.

## Restricciones nuevas y tratamiento de históricos

Las bases nuevas incluyen en `init.sql`:

- `uq_recibos_suministro_periodo UNIQUE(id_suministro, periodo)`, también para
  anulados: coincide con la regla anterior del panel, que no permite reutilizar
  un periodo ya existente.
- `uq_pagos_recibo UNIQUE(id_recibo)`: el producto actual registra un pago total,
  sin cuotas ni abonos parciales. Cambiar ese modelo requeriría otro diseño.

Se conserva la identidad textual del periodo: la API recorta el input, pero no
convierte meses, mayúsculas ni formatos históricos. No se atribuye equivalencia
semántica a dos textos distintos sin una decisión de negocio. El preflight
advierte espacios externos para revisión, sin normalizarlos ni borrar filas.

`Base-de-Datos/checks/005_integridad_recibos.sql` es solo lectura y devuelve conteos
de grupos duplicados, filas excedentes, pagos con monto/estado incorrecto,
pagados sin pago, periodos con espacios y relaciones huérfanas. No devuelve
identificadores ni datos personales. **No se ha ejecutado contra bases existentes.**

La migración preparada `005_integridad_recibos.sql`:

- Requiere ejecución manual autorizada, después de inspeccionar el esquema real.
  No forma parte del arranque ni ejecuta `init.sql` sobre una base existente.
- Bloquea escrituras sobre suministro/recibos/pagos durante preflight y DDL.
  Usa lock timeout de 2 s y timeout SQL de 30 s; requiere ventana y tamaño medido.
  No usa `CONCURRENTLY` dentro de `BEGIN`.
- Si hay duplicados, relaciones inválidas o inconsistencias pago/recibo, aborta
  con error fijo antes de añadir restricciones. Toda la transacción revierte.
- Comprueba las constraints con esos nombres y la validez de sus índices al
  repetirse; un nombre ocupado por otra estructura cancela, sin reemplazarla.
- Exige las tres FKs de negocio con columnas/destinos correctos, validadas y
  borrado `NO ACTION`, como en el esquema fuente. Si faltan o divergen, cancela
  sin recrearlas automáticamente.
- No hace INSERT, UPDATE o DELETE de datos ni cambia FKs/secuencias.

No se puede deducir que los históricos reales carezcan de duplicados porque las
fixtures estén limpias. Procedimiento futuro, sujeto a autorización del destino:

1. Obtener respaldo privado y verificar recuperación en otra base. Inventariar
   FKs, UNIQUE, índices, permisos, triggers y escritores reales.
2. Ejecutar el preflight de lectura y examinar privadamente cada grupo anómalo,
   incluidos pagos y asociaciones, con trazabilidad de su origen.
3. Si hay anomalías, **no ejecutar/forzar 005**. Mantener las filas. El propietario
   debe decidir cuál documento refleja el hecho real y aprobar una reconciliación
   específica: corrección justificada del periodo/datos o un modelo explícito de
   documentos históricos y sustituciones con una reserva única vigente.
   Ese modelo alternativo necesita otra migración; no se implementa una excepción
   silenciosa ni un índice parcial que ignore recibos pagados o anulados.
4. Si hay pagos duplicados o monto/estado discrepantes, investigar y documentar
   el hecho contable; no eliminar, sumar, reasignar ni convertir pagos automáticamente.
5. Probar el plan sobre una copia aislada, comparar todas las tablas/relaciones y
   obtener aprobación antes de cualquier corrección real. Repetir preflight.
6. Solo con resultado aceptado, aplicar 005, comprobar constraints/índices válidos,
   datos y secuencias, y repetir las pruebas autorizadas. Un timeout cancela el
   intento: reprogramar la ventana, no ampliar límites automáticamente.

Mientras no se aplique 005, las rutas corregidas se protegen entre sí incluso
con el esquema anterior; otros escritores sin este protocolo podrían crear
duplicados. Después de 005, UNIQUE protege identidades aun fuera de la API.
La coherencia cruzada monto/estado y la inmutabilidad tras pago dependen del
protocolo para **todos los escritores autorizados**: no se añade un trigger
general ni se pretende limitar a un administrador PostgreSQL. Revisar cualquier
integración nueva antes de concederle DML directo.

## Pruebas y resultados

Todas las escrituras/migraciones afectan bases nuevas en PostgreSQL 18 aislado,
sin `.env`, Neon ni correos reales. Las bases de prueba se conservan.

```bash
HIDRO_EMAIL_TEST_DB_PORT=32768 npm run test:receipts
HIDRO_EMAIL_TEST_DB_PORT=32768 HIDRO_RECEIPT_TEST_LEGACY=1 node --test Backend/test/receipt-concurrency.cjs
```

El puerto identifica aquí el contenedor aislado ya inspeccionado. En otro equipo,
preparar el entorno descrito en [TESTING](TESTING.md); no apuntar a una instancia
real solo porque el helper crea bases con nombre aleatorio.

| Batería ejecutada | Resultado |
| --- | --- |
| H02 con Node 20.19.2 / esquema nuevo + migración | 21 aprobadas, 0 fallidas, 1 caso condicional omitido. |
| API con esquema anterior sin las dos UNIQUE | 12 aprobadas, 0 fallidas, 1 caso condicional omitido. |
| H02 con Node 22.23.3 local en Docker y fuentes montadas solo lectura | 21 aprobadas, 0 fallidas, 1 caso condicional omitido. No se reconstruye ni despliega la imagen de servicios existentes. |
| Configuración / correo / documentos / firma | 13 / 14 / 4 / 7 pruebas aprobadas. |
| Esquema OTP / API correo / retención / CLI | 2 / 4 / 6 / 3 grupos aprobados. |
| Perfil con Chromium y API simulada | 3 pruebas aprobadas. |
| Cliente/Admin/API/PostgreSQL y Resend simulado | 25 comprobaciones; cero errores JavaScript y recursos fallidos. |

Los casos condicionales son intencionados: el escenario de histórico duplicado
solo se ejecuta sin UNIQUE; el escritor externo que viola UNIQUE se ejecuta con
ella. Ambos quedan cubiertos entre las dos variantes. El timeout inicial de una
barrera del harness se corrigió al aceptar SQL cualificado con `public`; no se
presenta esa ejecución incompleta como validación del producto.

La batería comprueba ambas prioridades pago/edición/anulación, alta y edición
simultáneas, cambios de periodo, dos procesos API independientes, permisos y
propiedad, rollback inyectado después del INSERT de pago, error sanitizado,
lock timeout real, avance independiente de otro suministro y carga mixta.
Al terminar comprueba cero deadlocks en esa base, ninguna transacción ociosa,
ningún cliente prestado del pool y ninguna espera pendiente. Es evidencia de
esas ejecuciones, no una garantía frente a cualquier carga/escritor futuro.

La migración se prueba sobre una base sintética que emula ausencia de las nuevas
constraints. Se verifican repetición, rechazo directo UNIQUE, FKs/secuencias y
todas las tablas intactas; también cancelación por duplicados de recibos/pagos,
montos/estados inconsistentes, drift de nombres/constraints y bloqueo de escritor.

La reproducción previa está en `artifacts/auditoria-produccion/h02-baseline.tap`;
los resultados finales, en `h02-final-node20.tap`, `h02-final-legacy.tap` y
`h02-final-node22.tap` de ese directorio ignorado. El harness conserva
`artifacts/h02-verification/run_1792373663344/admin-e2e.json`. No se publican
reportes locales, buzones ni capturas.

## Estado y recuperación

H02 queda corregido para las rutas de desarrollo y validado con/sin restricciones;
005 está preparada y probada, **pendiente de inspección y autorización productiva**.
Los demás hallazgos de la auditoría, incluida la transición Android y Resend, siguen
abiertos. No se declara la nueva versión lista para producción.

Recuperación propuesta: conservar el esquema aditivo y volver únicamente a código
compatible que mantenga este protocolo. Volver al código anterior reintroduce las
carreras; UNIQUE sola no evita editar/anular después de pagar. No retirar índices
ni borrar históricos como rollback. Si una reconciliación futura fuera necesaria,
su recuperación y aprobación deben diseñarse antes de modificar datos reales.

Referencias: [bloqueos PostgreSQL](https://www.postgresql.org/docs/18/explicit-locking.html),
[READ COMMITTED](https://www.postgresql.org/docs/18/transaction-iso.html) y
[restricciones](https://www.postgresql.org/docs/18/ddl-constraints.html).
