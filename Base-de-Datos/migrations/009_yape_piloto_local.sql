-- Piloto local: no acredita recibos ni servicios. No ejecutar en Neon.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN IF to_regclass('public.operaciones_pago') IS NULL THEN RAISE EXCEPTION 'Aplicar 008 antes de 009'; END IF; END $$;
CREATE TABLE IF NOT EXISTS public.control_piloto_yape (
 singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK(singleton),
 piloto_id UUID NOT NULL UNIQUE,
 habilitado BOOLEAN NOT NULL DEFAULT false,
 ensayo_sintetico BOOLEAN NOT NULL,
 id_recibo BIGINT NOT NULL REFERENCES public.recibos(id_recibo),
 id_usuario BIGINT NOT NULL REFERENCES public.usuarios(id_usuario),
 id_admin BIGINT NOT NULL REFERENCES public.usuarios(id_usuario),
 qr_hash TEXT NOT NULL CHECK(qr_hash ~ '^[a-f0-9]{64}$'),
 monto_maximo NUMERIC(10,2) NOT NULL CHECK(monto_maximo>0 AND monto_maximo<=5),
 inicio_en TIMESTAMPTZ NOT NULL,
 vence_en TIMESTAMPTZ NOT NULL,
 CHECK(id_usuario<>id_admin),
 CHECK(vence_en>inicio_en AND vence_en<=inicio_en+INTERVAL '4 hours'),
 CHECK(current_database() ~ '^hm_(email_)?yape_pilot_[a-f0-9]{12,32}$')
);
ALTER TABLE public.operaciones_pago ADD COLUMN IF NOT EXISTS piloto_id UUID REFERENCES public.control_piloto_yape(piloto_id);
ALTER TABLE public.operaciones_pago ADD COLUMN IF NOT EXISTS piloto_ensayo BOOLEAN;
ALTER TABLE public.operaciones_pago ADD COLUMN IF NOT EXISTS receptor_huella TEXT;
ALTER TABLE public.operaciones_pago ADD COLUMN IF NOT EXISTS recibido_en TIMESTAMPTZ;
ALTER TABLE public.operaciones_pago ADD COLUMN IF NOT EXISTS monto_recibido NUMERIC(10,2);
ALTER TABLE public.operaciones_pago ADD COLUMN IF NOT EXISTS receptor_comprobado BOOLEAN;
ALTER TABLE public.operaciones_pago DROP CONSTRAINT IF EXISTS operaciones_pago_entorno_check;
ALTER TABLE public.operaciones_pago ADD CONSTRAINT operaciones_pago_entorno_check CHECK(entorno IN ('simulado','piloto_manual'));
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.operaciones_pago'::regclass AND conname='chk_piloto_local') THEN
 ALTER TABLE public.operaciones_pago ADD CONSTRAINT chk_piloto_local CHECK (
  (entorno='simulado' AND piloto_id IS NULL AND piloto_ensayo IS NULL AND receptor_huella IS NULL AND recibido_en IS NULL AND monto_recibido IS NULL AND receptor_comprobado IS NULL) OR
  (entorno='piloto_manual' AND current_database() ~ '^hm_(email_)?yape_pilot_[a-f0-9]{12,32}$' AND metodo='yape_manual' AND estado NOT IN ('demostrativa','acreditada_proveedor','reembolsada') AND piloto_id IS NOT NULL AND piloto_ensayo IS NOT NULL AND receptor_huella IS NOT NULL AND receptor_huella ~ '^[a-f0-9]{64}$' AND (estado<>'verificada_manual' OR (recibido_en IS NOT NULL AND monto_recibido IS NOT NULL AND monto_recibido=monto AND receptor_comprobado IS TRUE)))
 ); END IF; END $$;
CREATE OR REPLACE FUNCTION public.controlar_piloto_yape() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Las operaciones conservan su historial'; END IF;
 IF ROW(NEW.piloto_id,NEW.piloto_ensayo,NEW.receptor_huella) IS DISTINCT FROM ROW(OLD.piloto_id,OLD.piloto_ensayo,OLD.receptor_huella) THEN RAISE EXCEPTION 'Piloto y receptor originales inmutables'; END IF;
 IF OLD.revisado_en IS NOT NULL AND ROW(NEW.recibido_en,NEW.monto_recibido,NEW.receptor_comprobado,NEW.revisado_por,NEW.revisado_en,NEW.motivo) IS DISTINCT FROM ROW(OLD.recibido_en,OLD.monto_recibido,OLD.receptor_comprobado,OLD.revisado_por,OLD.revisado_en,OLD.motivo) THEN RAISE EXCEPTION 'Revisión final inmutable'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER controlar_piloto_yape BEFORE UPDATE OR DELETE ON public.operaciones_pago
 FOR EACH ROW EXECUTE FUNCTION public.controlar_piloto_yape();
COMMIT;
