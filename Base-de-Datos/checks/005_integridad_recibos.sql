-- Solo lectura. Ejecutar únicamente en el destino autorizado; devuelve conteos.
-- La auditoría histórica detallada y cualquier reconciliación se hacen privadamente.
WITH duplicados_recibos AS (
    SELECT count(*) AS n FROM public.recibos GROUP BY id_suministro,periodo HAVING count(*)>1
), duplicados_pagos AS (
    SELECT count(*) AS n FROM public.pagos GROUP BY id_recibo HAVING count(*)>1
)
SELECT 'recibos_duplicados' AS control,count(*) AS grupos,COALESCE(sum(n-1),0)::bigint AS filas_excedentes
    FROM duplicados_recibos
UNION ALL
SELECT 'pagos_duplicados',count(*),COALESCE(sum(n-1),0)::bigint FROM duplicados_pagos
UNION ALL
SELECT 'pagos_inconsistentes',count(*),0 FROM public.pagos p
    LEFT JOIN public.recibos r ON r.id_recibo=p.id_recibo
    WHERE r.id_recibo IS NULL OR r.estado<>'Pagado' OR r.monto<>p.monto
UNION ALL
SELECT 'pagados_sin_pago',count(*),0 FROM public.recibos r
    WHERE r.estado='Pagado' AND NOT EXISTS(SELECT 1 FROM public.pagos p WHERE p.id_recibo=r.id_recibo)
UNION ALL
SELECT 'periodos_con_espacios_externos',count(*),0 FROM public.recibos WHERE periodo<>btrim(periodo)
UNION ALL
SELECT 'recibos_sin_suministro',count(*),0 FROM public.recibos r
    WHERE NOT EXISTS(SELECT 1 FROM public.suministros s WHERE s.id_suministro=r.id_suministro)
UNION ALL
SELECT 'suministros_sin_usuario',count(*),0 FROM public.suministros s
    WHERE NOT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id_usuario=s.id_usuario);
