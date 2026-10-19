# Retención de solicitudes de verificación de correo

Implementación de desarrollo en `feature/verificacion-correo`. No se ejecuta al
arrancar la API ni tiene un temporizador, ruta HTTP o programación activa.

## Política y dependencias

- OTP: 300 segundos. Solicitud: una hora desde su creación. Un OTP vencido no
  implica que la solicitud pueda eliminarse: todavía admite reenvío mientras
  la solicitud siga vigente.
- Retención mínima: **24 horas completas después de `vence_en`**, calculadas con
  el reloj PostgreSQL. Una solicitud normal se conserva, por tanto, más de
  25 horas desde el registro. No se usa `creado_en` como corte de eliminación.
- La comparación es estricta: `vence_en < referencia - 24 horas`. Se permite
  ampliar la retención entre 24 y 8.760 horas; no reducirla ni desactivarla.
- Se conserva cualquier solicitud con `codigo_vence_en > referencia`, o con
  algún envío de la última hora o futuro. Este margen protege también datos
  anómalos y mantiene el historial que aplica tres envíos/hora por correo y
  suministro, además de los 60 segundos entre envíos. La API inserta historial,
  sin modificar sus fechas; el mantenimiento no cambia estos límites.
- La misma política abarca filas pendientes, invalidadas y consumidas de
  `registros_correo_pendientes`. Confirmar no elimina antes el historial que
  aún puede imponer límites. Eliminar una fila consumida no elimina su cuenta.

La única FK entrante esperada es
`registros_correo_envios.registro_id → registros_correo_pendientes.id`, con
`ON DELETE CASCADE`. No hay FK desde usuarios, suministros, recibos o pagos hacia
estas tablas. La tarea elimina únicamente padres elegibles y PostgreSQL elimina
su historial asociado. Si aparece otra FK entrante, falta la cascada esperada o
la restricción no está validada, cancela el lote para exigir revisión del esquema.

## Ejecución acotada y concurrencia

`Backend/email-cleanup.js` expone `limpiarRegistrosCorreo(pool, opciones)`:

| Opción | Predeterminado | Validación |
| --- | --- | --- |
| `dryRun` | `true` | Booleano; simulación de solo lectura |
| `retentionHours` | 24 | Entero entre 24 y 8.760 |
| `batchSize` | 500 | Entero entre 1 y 1.000 solicitudes |

Una llamada procesa como máximo un lote; no hay bucle que vacíe tablas.
El índice `(vence_en, id)` permite recorrer el vencimiento en orden estable.
`init.sql` lo incluye para bases nuevas; la migración aditiva y repetible
`004_retencion_correo.sql` queda preparada para aplicación manual autorizada.
No se aplica al arrancar y no se ha aplicado a bases existentes. Antes de usarla
en una tabla grande, revisar el coste y los bloqueos de creación del índice.

Aplicación:

1. Abre transacción `READ COMMITTED`, con `statement_timeout=10s` por sentencia
   y `lock_timeout=1s`; fija `search_path=pg_catalog` y cualifica tablas con `public`.
2. Intenta el advisory lock transaccional `(7402, 1)`. Si otra limpieza lo posee,
   devuelve `estado: ocupado` sin borrar ni esperar. Es independiente de los locks
   `(7401, …)` usados por registro, reenvío y confirmación.
3. Toma locks de tabla compatibles con el DML normal para impedir que cambien las
   dependencias durante la comprobación y eliminación. La tarea no modifica FKs.
4. Selecciona hasta el tamaño del lote con `FOR UPDATE SKIP LOCKED`. Omite filas
   que otra operación mantiene bloqueadas. Las solicitudes vigentes tampoco
   cumplen el criterio temporal. No adquiere locks de identidad en orden inverso
   al registro, evitando introducir esa dependencia circular.
5. Revalida elegibilidad en una sentencia nueva, después de adquirir los locks.
   Así observa envíos confirmados entre el snapshot de selección y los locks.
   El lock del padre impide insertar nuevas referencias mientras se borra.
6. Cuenta el historial asociado, elimina padres y confirma. Un fallo revierte
   padres e historial juntos; los locks se liberan al terminar la transacción.

La simulación usa `REPEATABLE READ READ ONLY`, no toma locks de fila ni advisory
locks y devuelve únicamente conteos del lote. Es una estimación: puede incluir
filas que la aplicación omitiría por estar bloqueadas o cuyos datos cambien después.
No se devuelve correo, UUID, suministro, contraseña, hash, OTP ni token.

El resultado contiene `estado`, `retencion_horas`, `lote_maximo`, `candidatos`,
`envios_asociados`, `eliminados` y `envios_eliminados`. Un lote vacío o `ocupado`
no demuestra que no queden filas antiguas: podría haber bloqueos o una tarea en
curso. Repetir más tarde es seguro; cada ejecución mantiene las mismas reglas.

Referencias de PostgreSQL 18:
[selección y SKIP LOCKED](https://www.postgresql.org/docs/18/sql-select.html),
[bloqueos explícitos](https://www.postgresql.org/docs/18/explicit-locking.html) y
[claves foráneas y cascadas](https://www.postgresql.org/docs/18/ddl-constraints.html).

## Validación y operación futura

Ejecutar las pruebas únicamente contra el PostgreSQL aislado:

```bash
npm run test:email
HIDRO_EMAIL_TEST_DB_PORT=32768 npm run test:email:cleanup
```

El helper crea una base sintética nueva y la conserva después. Nunca toma la URL
de producción ni lee `.env`. Los resultados y regresiones se documentan en
[el informe de retención](pruebas/2026-10-18-retencion-correo.md).

El núcleo ya puede ser invocado por una tarea externa futura. El comando operativo
con identificación explícita de destino se añadirá en el siguiente avance.
No hay autorización para ejecutar limpieza o migraciones sobre Neon u otras bases
existentes. Activar cualquier programación exige una revisión y autorización
separadas del propietario, con un rol de permisos mínimos y conteos sanitizados.
