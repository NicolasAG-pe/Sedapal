-- Diagnóstico manual: NO ejecutarlo sobre Neon sin autorización explícita.
-- psql -X -v ON_ERROR_STOP=1 -v diagnostico_autorizado=1
--   -v expected_database=BASE_CONFIRMADA -v expected_role=ROL_CONFIRMADO
--   -v huellas_completas=1 -f Base-de-Datos/checks/024_preproduccion.sql
-- Conexión privada por servicio/.pgpass, nunca URL/contraseña en argumentos.
-- Solo conteos, catálogo y huellas; guardar el resultado privadamente, fuera de Git.
-- psql 18 no acepta código de salida en \quit. Las guardias provocan un
-- error constante de conversión para terminar con código 3 y ON_ERROR_STOP;
-- no leen filas de negocio. El flujo autorizado usa transacción READ ONLY.
\set ON_ERROR_STOP on
\if :{?diagnostico_autorizado}
  \if :diagnostico_autorizado
  \else
    \echo 'Diagnóstico no autorizado; no se consultaron filas.'
    SELECT 'HIDRO_DIAGNOSTICO_NO_AUTORIZADO'::integer;
  \endif
\else
  \echo 'Falta autorización explícita de diagnóstico; no se consultaron filas.'
  SELECT 'HIDRO_DIAGNOSTICO_GUARDIA'::integer;
\endif
\if :{?expected_database}
\else
  \echo 'Falta base esperada; no se consultaron filas.'
  SELECT 'HIDRO_DIAGNOSTICO_GUARDIA'::integer;
\endif
\if :{?expected_role}
\else
  \echo 'Falta rol esperado; no se consultaron filas.'
  SELECT 'HIDRO_DIAGNOSTICO_GUARDIA'::integer;
\endif
\if :{?huellas_completas}
\else
  \set huellas_completas 0
\endif

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';
SET LOCAL search_path=pg_catalog;
SET LOCAL TimeZone='UTC';
SET LOCAL DateStyle='ISO, YMD';
SET LOCAL bytea_output='hex';
SET LOCAL extra_float_digits=3;
SELECT current_database()=:'expected_database' AND current_user=:'expected_role'
    AS destino_correcto \gset
\if :destino_correcto
\else
  ROLLBACK;
  \echo 'Destino o rol inesperado; diagnóstico cancelado sin leer filas.'
  SELECT 'HIDRO_DIAGNOSTICO_GUARDIA'::integer;
\endif

SELECT current_setting('server_version') AS version_postgresql,
    current_setting('transaction_read_only') AS solo_lectura,
    current_setting('transaction_isolation') AS aislamiento,
    transaction_timestamp() AS instante_snapshot;

-- Indicios estructurales, NO un registro histórico de migraciones ejecutadas.
-- Un objeto presente requiere cotejar su definición en el catálogo siguiente.
SELECT '003' AS migracion,
    EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.usuarios')
        AND attname='correo_verificado_en' AND atttypid='timestamptz'::regtype
        AND NOT attnotnull AND NOT attisdropped)
    AND to_regclass('public.registros_correo_pendientes') IS NOT NULL
    AND to_regclass('public.registros_correo_envios') IS NOT NULL AS objetos_presentes
UNION ALL
SELECT '004',EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.idx_registro_vencimiento')
    AND indrelid=to_regclass('public.registros_correo_pendientes') AND indisvalid AND indisready)
UNION ALL
SELECT '005',(SELECT count(*)=2 FROM pg_constraint WHERE
    (conrelid=to_regclass('public.recibos') AND conname='uq_recibos_suministro_periodo'
     OR conrelid=to_regclass('public.pagos') AND conname='uq_pagos_recibo')
    AND contype='u' AND convalidated AND NOT condeferrable)
UNION ALL
SELECT '006',to_regclass('public.correo_outbox') IS NOT NULL
ORDER BY migracion;

SELECT c.relname AS tabla,a.attname AS columna,format_type(a.atttypid,a.atttypmod) AS tipo,
    a.attnotnull AS no_nulo,pg_get_expr(d.adbin,d.adrelid) AS defecto
FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
ORDER BY c.relname,a.attnum;

SELECT c.relname AS tabla,k.conname AS restriccion,k.contype,k.convalidated,
    pg_get_constraintdef(k.oid) AS definicion
FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' ORDER BY c.relname,k.conname;

SELECT t.relname AS tabla,i.relname AS indice,x.indisvalid,x.indisready,
    pg_get_indexdef(i.oid) AS definicion
FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid
JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE n.nspname='public' ORDER BY t.relname,i.relname;

-- Nombres de tablas escapados como identificadores; no ejecuta DDL/DML.
SELECT format('SELECT %L AS tabla,count(*) AS filas FROM %I.%I;',c.relname,n.nspname,c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname
\gexec

SELECT count(*) AS suministros_formato_invalido FROM public.suministros
WHERE numero_suministro !~ '^[0-9]{9}$';

-- No llamar nextval/setval: la observación no avanza secuencias.
-- Un NULL de pg_sequences puede significar permisos insuficientes: investigar.
SELECT sequencename,start_value,min_value,max_value,increment_by,cycle,cache_size,last_value
FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename;
SELECT format('SELECT %L AS secuencia,last_value,is_called,(SELECT max(%I) FROM %I.%I) AS maximo_id FROM %I.%I;',
    s.relname,a.attname,tn.nspname,t.relname,sn.nspname,s.relname)
FROM pg_class s JOIN pg_namespace sn ON sn.oid=s.relnamespace
JOIN pg_depend d ON d.objid=s.oid AND d.classid='pg_class'::regclass
    AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i')
JOIN pg_class t ON t.oid=d.refobjid JOIN pg_namespace tn ON tn.oid=t.relnamespace
JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
WHERE s.relkind='S' AND sn.nspname='public' ORDER BY s.relname
\gexec

-- Fotografías almacenadas realmente como BYTEA en incidencias.
SELECT count(*) AS incidencias,count(*) FILTER(WHERE foto IS NOT NULL) AS con_foto,
    count(*) FILTER(WHERE foto IS NOT NULL AND octet_length(foto)=0) AS foto_vacia,
    count(*) FILTER(WHERE foto IS NOT NULL AND (foto_mime IS NULL OR btrim(foto_mime)='')) AS sin_mime,
    count(*) FILTER(WHERE foto IS NULL AND foto_mime IS NOT NULL) AS mime_sin_foto,
    coalesce(sum(octet_length(foto)),0) AS bytes_fotografias
FROM public.incidencias;

-- Coste adicional: solo autorizar en ventana/clone. Digest incluye asociación ID,
-- MIME y contenido; nunca devuelve imágenes, correos, contraseñas ni filas.
\if :huellas_completas
SELECT encode(sha256(convert_to(coalesce(string_agg(
    jsonb_build_array(id_incidencia,foto_mime,encode(sha256(foto),'hex'))::text,
    E'\n' ORDER BY id_incidencia),''),'UTF8')),'hex') AS huella_fotografias
FROM public.incidencias WHERE foto IS NOT NULL;

-- Huellas por tabla: comparar solo las tablas preexistentes y con escrituras
-- pausadas. Se excluye únicamente la columna nueva nullable de la migración 003.
SELECT format($q$SELECT %L AS tabla_huella,count(*) AS filas,
    encode(sha256(convert_to(coalesce(string_agg(h,'' ORDER BY h),''),'UTF8')),'hex') AS huella_filas
    FROM (SELECT encode(sha256(convert_to((to_jsonb(t)-'correo_verificado_en')::text,'UTF8')),'hex') AS h
    FROM %I.%I t) filas;$q$,c.relname,n.nspname,c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname
\gexec
\endif

-- Siete controles sin detalle personal. No interpreta ni repara anomalías.
\ir 005_integridad_recibos.sql
COMMIT;
