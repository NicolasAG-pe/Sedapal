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
6. Cuenta el historial asociado, elimina padres y confirma. Un fallo antes de
   confirmar revierte padres e historial juntos; los locks se liberan al terminar.

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

## Comando operativo preparado, sin programación activa

`Backend/maintenance/email-cleanup.cjs` ejecuta un único lote y termina. No importa
el servidor, no envía correos ni lee `.env`, `DATABASE_URL` o las credenciales de
la API. Requiere **ambas** variables privadas:

| Variable | Uso |
| --- | --- |
| `EMAIL_MAINTENANCE_DATABASE_URL` | Conexión PostgreSQL exclusiva del destino autorizado |
| `EMAIL_MAINTENANCE_EXPECTED_DATABASE` | Nombre que debe coincidir con la URL y con `current_database()` |

Las conexiones externas reutilizan la política TLS `verify-full` de la API. El
pool es de una conexión; tiene tiempo de conexión de 5 segundos, límites SQL de
10 segundos y de espera de locks de 1 segundo, y timeout de transacción ociosa de
15 segundos. No imprime la URL, el nombre de base, errores SQL ni objetos privados.

Preparar esas variables con el mecanismo privado del entorno autorizado, nunca
mediante argumentos con contraseñas ni archivos versionados. Revisar primero:

```bash
node Backend/maintenance/email-cleanup.cjs --help
node Backend/maintenance/email-cleanup.cjs --dry-run
```

Omitir `--dry-run` también simula. Para aplicar **solo con autorización separada
del destino**, el comando preparado es:

```bash
node Backend/maintenance/email-cleanup.cjs --apply --batch-size 500 --retention-hours 24
```

El alias desde la raíz es `npm run maintenance:email -- --dry-run` o, para un
destino autorizado, `npm run maintenance:email -- --apply`. Las opciones no aceptan
valores menores que la política, modos contradictorios, duplicados o desconocidos.

El proceso escribe un JSON de conteos sanitizados en stdout y devuelve código 0
al simular, completar o encontrar otra limpieza (`ocupado`). Si falla, escribe
solo un mensaje fijo en stderr y devuelve 1. No crea archivos de reportes. Un
planificador futuro puede consumir directamente este JSON, alertar ante fallos y
volver a intentarlo en su siguiente intervalo; `ocupado` no exige un reintento
inmediato. Evaluar una ejecución horaria y ajustar el lote/frecuencia a los
conteos y carga, conservando el mínimo de 24 horas. La retención efectiva puede
ser mayor por la frecuencia, el límite del lote, bloqueos o guardas de seguridad.
Si se pierde la conexión durante el COMMIT, su resultado puede ser ambiguo para
el proceso; una ejecución posterior es segura por la idempotencia de la tarea.

No se ha creado ningún cron, servicio ni tarea programada. No hay autorización
para ejecutar limpieza o migraciones sobre Neon u otras bases existentes.
Activar cualquier programación exige revisión y autorización separadas del
propietario, un destino identificado y un rol limitado a estas tablas, sin
permisos de borrado sobre tablas de negocio. Revisar los triggers y dependencias
del destino antes de conceder permisos o aplicar la migración preparada.
