-- SOLO laboratorio. Aditiva, posterior a 011; no activa ni envía push.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='usuario_2fa' AND column_name='cambio_seguridad_en') THEN RAISE EXCEPTION 'Aplicar 011 antes de 012'; END IF;
END; $$;
CREATE TABLE IF NOT EXISTS public.push_dispositivos (
 id UUID PRIMARY KEY, prueba_hash CHAR(64) NOT NULL CHECK(prueba_hash ~ '^[a-f0-9]{64}$'),
 id_usuario BIGINT REFERENCES public.usuarios(id_usuario),
 id_suministro BIGINT REFERENCES public.suministros(id_suministro),
 version_seguridad INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 token_hash CHAR(64) UNIQUE, token_cifrado BYTEA, clave_id CHAR(16),
 activo BOOLEAN NOT NULL DEFAULT FALSE, consentimiento_en TIMESTAMPTZ,
 recibos BOOLEAN NOT NULL DEFAULT TRUE, vencimientos BOOLEAN NOT NULL DEFAULT TRUE,
 incidencias BOOLEAN NOT NULL DEFAULT TRUE, cortes BOOLEAN NOT NULL DEFAULT TRUE,
 autorizado_hasta TIMESTAMPTZ NOT NULL, actualizado_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 CHECK(NOT activo OR (id_usuario IS NOT NULL AND id_suministro IS NOT NULL AND token_cifrado IS NOT NULL AND token_hash IS NOT NULL AND consentimiento_en IS NOT NULL))
);
ALTER TABLE public.notificaciones ADD COLUMN IF NOT EXISTS push_evento UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.notificaciones ADD COLUMN IF NOT EXISTS push_clave TEXT;
ALTER TABLE public.notificaciones ADD COLUMN IF NOT EXISTS push_recibo BIGINT REFERENCES public.recibos(id_recibo);
ALTER TABLE public.notificaciones ADD COLUMN IF NOT EXISTS push_corte BIGINT REFERENCES public.cortes_servicio(id_corte);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notificacion_push_evento ON public.notificaciones(push_evento);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notificacion_push_clave ON public.notificaciones(push_clave) WHERE push_clave IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.push_entregas (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), id_dispositivo UUID REFERENCES public.push_dispositivos(id),
 id_notificacion BIGINT REFERENCES public.notificaciones(id_notificacion),
 revision INTEGER NOT NULL, categoria TEXT NOT NULL CHECK(categoria IN('recibos','vencimientos','incidencias','cortes')),
 estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN('pendiente','procesando','reintento','aceptado','simulado','cancelado','fallido','ambiguo','caducado')),
 intentos SMALLINT NOT NULL DEFAULT 0 CHECK(intentos BETWEEN 0 AND 3),
 creado_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), disponible_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 vence_en TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp()+INTERVAL '1 hour'),
 lease UUID, bloqueado_hasta TIMESTAMPTZ, finalizado_en TIMESTAMPTZ,
 CHECK((estado='procesando')=(lease IS NOT NULL)),CHECK((lease IS NULL)=(bloqueado_hasta IS NULL)),
 UNIQUE(id_dispositivo,id_notificacion)
);
CREATE INDEX IF NOT EXISTS idx_push_entregas_pendientes ON public.push_entregas(disponible_en) WHERE estado IN('pendiente','reintento','procesando');
CREATE OR REPLACE FUNCTION public.encolar_notificacion_push() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE categoria TEXT;
BEGIN
 categoria=CASE NEW.tipo WHEN 'recibo' THEN 'recibos' WHEN 'vencimiento' THEN 'vencimientos' WHEN 'incidencia' THEN 'incidencias' WHEN 'corte' THEN 'cortes' ELSE NULL END;
 IF categoria IS NULL THEN RETURN NEW; END IF;
 INSERT INTO public.push_entregas(id_dispositivo,id_notificacion,revision,categoria)
 SELECT d.id,NEW.id_notificacion,d.revision,categoria FROM public.push_dispositivos d
 JOIN public.usuarios u ON u.id_usuario=d.id_usuario JOIN public.suministros s ON s.id_suministro=d.id_suministro AND s.id_usuario=u.id_usuario
 LEFT JOIN public.usuario_2fa m ON m.id_usuario=u.id_usuario
 WHERE d.activo AND u.activo AND u.rol='usuario' AND d.version_seguridad=COALESCE(m.version,0)
 AND d.autorizado_hasta>clock_timestamp() AND (NEW.alcance='General' OR NEW.id_suministro=d.id_suministro)
 AND CASE categoria WHEN 'recibos' THEN d.recibos WHEN 'vencimientos' THEN d.vencimientos WHEN 'incidencias' THEN d.incidencias WHEN 'cortes' THEN d.cortes ELSE FALSE END
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END; $$;
CREATE OR REPLACE TRIGGER encolar_push AFTER INSERT ON public.notificaciones FOR EACH ROW EXECUTE FUNCTION public.encolar_notificacion_push();
CREATE OR REPLACE FUNCTION public.revocar_push_por_seguridad() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE public.push_dispositivos SET activo=FALSE,token_cifrado=NULL,token_hash=NULL,revision=revision+1
 WHERE id_usuario=NEW.id_usuario AND version_seguridad<>NEW.version AND activo;
 RETURN NEW;
END; $$;
CREATE OR REPLACE TRIGGER revocar_push_seguridad AFTER INSERT OR UPDATE OF version ON public.usuario_2fa FOR EACH ROW EXECUTE FUNCTION public.revocar_push_por_seguridad();
-- El modelo actual admite General/Zona y asociaciones legacy por suministro.
-- No ampliar su contrato ni convertir un corte localizado en un aviso General.
CREATE OR REPLACE FUNCTION public.notificar_corte_local_push() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.alcance='Zona' AND NOT NEW.cancelado THEN
  INSERT INTO public.notificaciones(id_suministro,alcance,titulo,mensaje,tipo,push_clave,push_corte)
  SELECT s.id_suministro,'Usuario','Aviso de corte de servicio','Consulta el aviso actualizado en Cortes.','corte','corte-local:'||NEW.id_corte||':'||s.id_suministro,NEW.id_corte
  FROM public.suministros s WHERE s.distrito=NEW.distrito AND s.zona=NEW.zona
  ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END; $$;
CREATE OR REPLACE TRIGGER notificar_corte_local AFTER INSERT ON public.cortes_servicio FOR EACH ROW EXECUTE FUNCTION public.notificar_corte_local_push();
CREATE OR REPLACE FUNCTION public.notificar_corte_asociado_push() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 INSERT INTO public.notificaciones(id_suministro,alcance,titulo,mensaje,tipo,push_clave,push_corte)
 SELECT NEW.id_suministro,'Usuario','Aviso de corte de servicio','Consulta el aviso actualizado en Cortes.','corte','corte-local:'||NEW.id_corte||':'||NEW.id_suministro,NEW.id_corte
 FROM public.cortes_servicio c WHERE c.id_corte=NEW.id_corte AND c.alcance IS NULL AND NOT c.cancelado
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END; $$;
CREATE OR REPLACE TRIGGER notificar_corte_asociado AFTER INSERT ON public.cortes_suministros FOR EACH ROW EXECUTE FUNCTION public.notificar_corte_asociado_push();
COMMIT;
