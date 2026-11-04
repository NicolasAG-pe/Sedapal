# Research — DB-01

Evidencia E sobre d3d27d0; ningún caso reproducido en esta fase.

## Hallazgo y alcance

Backend/receipt-transactions.js: tienePago comprueba pagos legacy, luego operaciones en cuatro estados bloqueantes y finalmente control_piloto_yape. Los retornos tempranos evitan alcanzar piloto cuando hay un bloqueo previo. editar/anular llaman tienePago antes de evaluar estado Pagado. Por eso el informe 1 exagera al afirmar que cualquier edición falla: la tabla ausente afecta los caminos que llegan a esa consulta.

014_compatibilidad_operaciones_produccion.sql exige operaciones_pago y rechaza control_piloto_yape. Se confirma incompatibilidad estática; respuesta 42P01/500 pendiente de ejecución aislada, no incidente productivo acreditado.

## Pruebas reutilizables

Backend/test/payment-production-compat.cjs materializa base anterior a 007 + 007/008/014 sin piloto, y verifica repetibilidad, guardas y datos. Backend/test/quality-migrations.cjs verifica otra cadena. Backend/test/receipt-concurrency.cjs cubre API/locks usando email-api.cjs. Falta conectar editar/anular con el perfil sin piloto; no falta toda cobertura de ese perfil.

No tratar migraciones como instalador autónomo: la tabla pagos pertenece a la base previa. init.sql completo incluye piloto y no acepta 014. Antes de ampliar fixtures revisar los marcadores de separación que emplea la prueba productiva; si falta el marcador, el harness debe fallar explícitamente.

## Decisión y alternativas

Propuesta: comprobar existencia de public.control_piloto_yape con catálogo/to_regclass, mediante el mismo client transaccional, justo antes del camino opcional. Si falta, ese motivo de bloqueo es falso; se conservan el resto de comprobaciones y estado Pagado. Si existe, consultar el piloto normalmente. No silenciar errores de permisos ni de esquema obligatorio.

Se rechaza consultar y capturar 42P01: aborta la transacción. No añadir SAVEPOINT solo para ocultar una dependencia conocida. No crear tabla ficticia en producción ni ejecutar 009/010 allí. Un manifiesto global de capacidades ampliaría alcance; pospuesto. Evitar caché global porque fixtures y procesos pueden utilizar perfiles distintos.

## Riesgos pendientes

Confirmar privilegios del rol de prueba y alcance de catálogo; respetar schema public. Mantener locks y sentencias después del lock. Medir consultas añadidas y conservar timeouts. DDL concurrente no está soportado por esta corrección y debe gestionarse operativamente por separado.
