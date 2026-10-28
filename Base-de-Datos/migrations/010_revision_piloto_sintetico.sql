-- Solo laboratorio. Separa revisión sintética de recepción bancaria sin reescribir historia.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN IF to_regclass('public.control_piloto_yape') IS NULL THEN RAISE EXCEPTION 'Aplicar 009 antes de 010'; END IF; END $$;
ALTER TABLE public.operaciones_pago DROP CONSTRAINT IF EXISTS chk_piloto_local;
ALTER TABLE public.operaciones_pago ADD CONSTRAINT chk_piloto_local CHECK (
 (entorno='simulado' AND piloto_id IS NULL AND piloto_ensayo IS NULL AND receptor_huella IS NULL AND recibido_en IS NULL AND monto_recibido IS NULL AND receptor_comprobado IS NULL) OR
 (entorno='piloto_manual' AND current_database() ~ '^hm_(email_)?yape_pilot_[a-f0-9]{12,32}$' AND metodo='yape_manual' AND estado NOT IN ('demostrativa','acreditada_proveedor','reembolsada') AND piloto_id IS NOT NULL AND piloto_ensayo IS NOT NULL AND receptor_huella IS NOT NULL AND receptor_huella ~ '^[a-f0-9]{64}$' AND (estado<>'verificada_manual' OR piloto_ensayo IS TRUE OR (monto_recibido IS NOT NULL AND monto_recibido=monto AND receptor_comprobado IS TRUE)))
);
CREATE OR REPLACE FUNCTION public.validar_revision_sintetica() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.piloto_ensayo IS TRUE AND NEW.estado='verificada_manual' AND OLD.estado<>'verificada_manual' AND (NEW.recibido_en IS NOT NULL OR NEW.monto_recibido IS NOT NULL OR NEW.receptor_comprobado IS NOT NULL) THEN
  RAISE EXCEPTION 'Un ensayo no registra recepción bancaria';
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER validar_revision_sintetica BEFORE UPDATE ON public.operaciones_pago FOR EACH ROW EXECUTE FUNCTION public.validar_revision_sintetica();
COMMIT;
