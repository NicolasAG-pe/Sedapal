-- SOLO aplicación manual autorizada. No se ejecuta desde la API.
-- Antes: checks/005_integridad_recibos.sql y docs/integridad-recibos.md.
-- No reconcilia ni borra datos: cualquier anomalía cancela toda la migración.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
SET LOCAL search_path=pg_catalog;
-- Evita cambios entre preflight y constraints. Requiere ventana de escrituras.
LOCK TABLE public.suministros,public.recibos,public.pagos IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM (VALUES
            ('suministros','id_usuario','usuarios','id_usuario'),
            ('recibos','id_suministro','suministros','id_suministro'),
            ('pagos','id_recibo','recibos','id_recibo')
        ) AS spec(origen,columna,destino,referencia)
        WHERE NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attname=spec.columna AND NOT a.attisdropped
            JOIN pg_attribute b ON b.attrelid=c.confrelid AND b.attname=spec.referencia AND NOT b.attisdropped
            WHERE c.contype='f' AND c.convalidated AND c.confdeltype='a'
                AND c.conrelid=format('public.%I',spec.origen)::regclass
                AND c.confrelid=format('public.%I',spec.destino)::regclass
                AND c.conkey=ARRAY[a.attnum] AND c.confkey=ARRAY[b.attnum]
        )
    ) THEN
        RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Esquema inesperado: revisar claves foráneas de negocio antes de autorizar 005.';
    END IF;
    IF EXISTS(SELECT 1 FROM public.recibos GROUP BY id_suministro,periodo HAVING count(*)>1)
        OR EXISTS(SELECT 1 FROM public.pagos GROUP BY id_recibo HAVING count(*)>1) THEN
        RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Integridad pendiente: reconciliar duplicados antes de autorizar 005.';
    END IF;
    IF EXISTS(SELECT 1 FROM public.pagos p LEFT JOIN public.recibos r ON r.id_recibo=p.id_recibo
            WHERE r.id_recibo IS NULL OR r.estado<>'Pagado' OR r.monto<>p.monto)
        OR EXISTS(SELECT 1 FROM public.recibos r WHERE r.estado='Pagado'
            AND NOT EXISTS(SELECT 1 FROM public.pagos p WHERE p.id_recibo=r.id_recibo))
        OR EXISTS(SELECT 1 FROM public.recibos r WHERE NOT EXISTS(
            SELECT 1 FROM public.suministros s WHERE s.id_suministro=r.id_suministro))
        OR EXISTS(SELECT 1 FROM public.suministros s WHERE NOT EXISTS(
            SELECT 1 FROM public.usuarios u WHERE u.id_usuario=s.id_usuario)) THEN
        RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Integridad pendiente: revisar relaciones, montos y estados antes de autorizar 005.';
    END IF;
END $$;

DO $$
DECLARE
    spec record;
    existing record;
    keys smallint[];
BEGIN
    FOR spec IN SELECT * FROM (VALUES
        ('recibos','uq_recibos_suministro_periodo',ARRAY['id_suministro','periodo']),
        ('pagos','uq_pagos_recibo',ARRAY['id_recibo'])
    ) AS v(tabla,nombre,columnas)
    LOOP
        SELECT array_agg(a.attnum ORDER BY c.ord) INTO keys
            FROM unnest(spec.columnas) WITH ORDINALITY c(nombre,ord)
            JOIN pg_attribute a ON a.attrelid=format('public.%I',spec.tabla)::regclass
                AND a.attname=c.nombre AND NOT a.attisdropped;
        SELECT * INTO existing FROM pg_constraint
            WHERE conrelid=format('public.%I',spec.tabla)::regclass AND conname=spec.nombre;
        IF FOUND THEN
            IF existing.contype<>'u' OR existing.conkey<>keys OR existing.condeferrable
                OR NOT existing.convalidated OR NOT EXISTS(
                    SELECT 1 FROM pg_index WHERE indexrelid=existing.conindid AND indisvalid AND indisready) THEN
                RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Esquema inesperado: revisar constraints antes de autorizar 005.';
            END IF;
        ELSE
            IF to_regclass(format('public.%I',spec.nombre)) IS NOT NULL THEN
                RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Esquema inesperado: nombre de índice ocupado; revisar 005.';
            END IF;
            EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE (%s)',spec.tabla,spec.nombre,
                (SELECT string_agg(format('%I',c),',') FROM unnest(spec.columnas) c));
        END IF;
    END LOOP;
END $$;
COMMIT;
