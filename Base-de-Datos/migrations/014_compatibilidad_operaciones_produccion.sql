-- Ruta productiva: después de 008; NO aplicar 009/010 ni crear control de piloto.
-- Conserva el contrato de operaciones. Estos metadatos no acreditan fondos.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

DO $$ BEGIN
 IF to_regclass('public.operaciones_pago') IS NULL THEN
  RAISE EXCEPTION 'Aplicar 008 antes de 014';
 END IF;
 IF to_regclass('public.control_piloto_yape') IS NOT NULL THEN
  RAISE EXCEPTION '014 es exclusiva de la ruta productiva sin 009/010; conservar el laboratorio';
 END IF;
END $$;

-- Solo compatibilidad de lectura/escritura con el mismo backend, sin FK a pilotos.
ALTER TABLE public.operaciones_pago ADD COLUMN IF NOT EXISTS piloto_id UUID;
ALTER TABLE public.operaciones_pago ADD COLUMN IF NOT EXISTS piloto_ensayo BOOLEAN;
ALTER TABLE public.operaciones_pago ADD COLUMN IF NOT EXISTS receptor_huella TEXT;
ALTER TABLE public.operaciones_pago ADD COLUMN IF NOT EXISTS recibido_en TIMESTAMPTZ;
ALTER TABLE public.operaciones_pago ADD COLUMN IF NOT EXISTS monto_recibido NUMERIC(10,2);
ALTER TABLE public.operaciones_pago ADD COLUMN IF NOT EXISTS receptor_comprobado BOOLEAN;

DO $$ BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid='public.operaciones_pago'::regclass
    AND conname='chk_operacion_produccion_sin_piloto'
 ) THEN
  ALTER TABLE public.operaciones_pago
   ADD CONSTRAINT chk_operacion_produccion_sin_piloto CHECK (
    entorno='simulado' AND piloto_id IS NULL AND piloto_ensayo IS NULL
    AND receptor_huella IS NULL AND recibido_en IS NULL
    AND monto_recibido IS NULL AND receptor_comprobado IS NULL
   );
 END IF;
END $$;

COMMIT;
