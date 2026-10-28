-- Aditiva y repetible. No reescribe incidencias ni inventa eventos anteriores.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
CREATE TABLE IF NOT EXISTS public.incidencia_eventos (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 orden BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
 id_incidencia BIGINT NOT NULL REFERENCES public.incidencias(id_incidencia),
 fecha TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 tipo TEXT NOT NULL CHECK(tipo IN('registro','estado')),
 estado_anterior VARCHAR(20) CHECK(estado_anterior IN('Registrada','En revisión','Resuelta')),
 estado_nuevo VARCHAR(20) NOT NULL CHECK(estado_nuevo IN('Registrada','En revisión','Resuelta')),
 id_administrador BIGINT REFERENCES public.usuarios(id_usuario),
 comentario_publico VARCHAR(300),
 solicitud_id UUID UNIQUE,
 CHECK((tipo='registro' AND estado_anterior IS NULL AND id_administrador IS NULL AND comentario_publico IS NULL) OR
       (tipo='estado' AND estado_anterior IS NOT NULL AND estado_anterior<>estado_nuevo)),
 CHECK(comentario_publico IS NULL OR (length(btrim(comentario_publico))>0 AND id_administrador IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_incidencia_eventos_orden ON public.incidencia_eventos(id_incidencia,orden);
CREATE UNIQUE INDEX IF NOT EXISTS uq_incidencia_evento_inicial ON public.incidencia_eventos(id_incidencia) WHERE tipo='registro';
CREATE TABLE IF NOT EXISTS public.incidencia_cambios (
 solicitud_id UUID PRIMARY KEY, id_incidencia BIGINT NOT NULL REFERENCES public.incidencias(id_incidencia),
 id_administrador BIGINT NOT NULL REFERENCES public.usuarios(id_usuario),
 huella CHAR(64) NOT NULL, resultado JSONB NOT NULL, fecha TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE OR REPLACE FUNCTION public.proteger_evento_incidencia() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='INSERT' AND pg_trigger_depth()>=2 THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'El historial de incidencias solo admite eventos de origen' USING ERRCODE='42501';
END; $$;
CREATE OR REPLACE TRIGGER proteger_evento_incidencia BEFORE INSERT OR UPDATE OR DELETE ON public.incidencia_eventos
 FOR EACH ROW EXECUTE FUNCTION public.proteger_evento_incidencia();
CREATE OR REPLACE TRIGGER proteger_evento_incidencia_truncate BEFORE TRUNCATE ON public.incidencia_eventos
 FOR EACH STATEMENT EXECUTE FUNCTION public.proteger_evento_incidencia();
CREATE OR REPLACE FUNCTION public.proteger_cambio_incidencia() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Las decisiones registradas no se modifican' USING ERRCODE='42501'; END; $$;
CREATE OR REPLACE TRIGGER proteger_cambio_incidencia BEFORE UPDATE OR DELETE ON public.incidencia_cambios
 FOR EACH ROW EXECUTE FUNCTION public.proteger_cambio_incidencia();
CREATE OR REPLACE TRIGGER proteger_cambio_incidencia_truncate BEFORE TRUNCATE ON public.incidencia_cambios
 FOR EACH STATEMENT EXECUTE FUNCTION public.proteger_cambio_incidencia();
CREATE OR REPLACE FUNCTION public.registrar_evento_incidencia() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor BIGINT; comentario TEXT; solicitud UUID;
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO public.incidencia_eventos(id_incidencia,tipo,estado_nuevo) VALUES(NEW.id_incidencia,'registro',NEW.estado);
 ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
  actor=NULLIF(current_setting('hidro.incident_actor',true),'')::BIGINT;
  solicitud=NULLIF(current_setting('hidro.incident_request',true),'')::UUID;
  IF actor IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id_usuario=actor AND rol='admin' AND activo) THEN
    RAISE EXCEPTION 'Responsable no autorizado' USING ERRCODE='42501';
   END IF;
   comentario=NULLIF(btrim(current_setting('hidro.incident_comment',true)),'');
   IF length(comentario)>300 OR comentario ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'Comentario público inválido' USING ERRCODE='22023'; END IF;
  END IF;
  INSERT INTO public.incidencia_eventos(id_incidencia,tipo,estado_anterior,estado_nuevo,id_administrador,comentario_publico,solicitud_id)
   VALUES(NEW.id_incidencia,'estado',OLD.estado,NEW.estado,actor,comentario,solicitud);
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.registrar_evento_incidencia() FROM PUBLIC;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.incidencia_eventos FROM PUBLIC;
REVOKE UPDATE,DELETE,TRUNCATE ON public.incidencia_cambios FROM PUBLIC;
CREATE OR REPLACE TRIGGER registrar_evento_incidencia AFTER INSERT OR UPDATE OF estado ON public.incidencias
 FOR EACH ROW EXECUTE FUNCTION public.registrar_evento_incidencia();
COMMIT;
