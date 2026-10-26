-- Aditiva e idempotente. Aplicar solo en laboratorio hasta aprobación independiente.
-- Requiere 007. No habilita recuperación ni correo, no cambia hashes existentes.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
ALTER TABLE public.usuario_2fa ADD COLUMN IF NOT EXISTS cambio_seguridad_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp();
CREATE OR REPLACE FUNCTION public.fechar_version_seguridad() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.version IS DISTINCT FROM OLD.version THEN NEW.cambio_seguridad_en=clock_timestamp(); END IF;
 RETURN NEW;
END; $$;
CREATE OR REPLACE TRIGGER fechar_version_seguridad BEFORE UPDATE OF version ON public.usuario_2fa
FOR EACH ROW EXECUTE FUNCTION public.fechar_version_seguridad();
CREATE TABLE IF NOT EXISTS public.recuperacion_clave_limites (
 identidad_hash CHAR(64) PRIMARY KEY CHECK(identidad_hash ~ '^[a-f0-9]{64}$'),
 ventana_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 ultimo_envio_en TIMESTAMPTZ,
 solicitudes SMALLINT NOT NULL DEFAULT 0 CHECK(solicitudes BETWEEN 0 AND 3),
 activa_id UUID
);
CREATE TABLE IF NOT EXISTS public.recuperaciones_clave (
 id UUID PRIMARY KEY,
 identidad_hash CHAR(64) NOT NULL REFERENCES public.recuperacion_clave_limites(identidad_hash),
 id_usuario BIGINT REFERENCES public.usuarios(id_usuario),
 version_seguridad INTEGER,
 clave_huella CHAR(64),
 codigo_hash CHAR(64) NOT NULL CHECK(codigo_hash ~ '^[a-f0-9]{64}$'),
 creado_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 vence_en TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp()+INTERVAL '15 minutes'),
 vinculado_en TIMESTAMPTZ,
 intentos SMALLINT NOT NULL DEFAULT 0 CHECK(intentos BETWEEN 0 AND 5),
 verificado_en TIMESTAMPTZ,
 permiso_hash CHAR(64) CHECK(permiso_hash ~ '^[a-f0-9]{64}$'),
 permiso_vence_en TIMESTAMPTZ,
 usado_en TIMESTAMPTZ,
 invalidado_en TIMESTAMPTZ,
 CHECK((permiso_hash IS NULL)=(permiso_vence_en IS NULL)),
 CHECK((id_usuario IS NULL)=(vinculado_en IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_recuperaciones_clave_usuario ON public.recuperaciones_clave(id_usuario);
CREATE INDEX IF NOT EXISTS idx_recuperaciones_clave_vencimiento ON public.recuperaciones_clave(vence_en);
CREATE TABLE IF NOT EXISTS public.recuperacion_clave_outbox (
 id UUID PRIMARY KEY,
 solicitud_id UUID NOT NULL REFERENCES public.recuperaciones_clave(id),
 proposito TEXT NOT NULL CHECK(proposito IN ('codigo','aviso')),
 proveedor TEXT NOT NULL CHECK(proveedor IN ('gmail','resend')),
 estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','procesando','reintento','aceptado','cancelado','caducado','fallido','ambiguo')),
 payload BYTEA,
 clave_id CHAR(16) NOT NULL,
 intentos SMALLINT NOT NULL DEFAULT 0 CHECK(intentos BETWEEN 0 AND 3),
 disponible_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 lease_token UUID,
 bloqueado_hasta TIMESTAMPTZ,
 proveedor_id VARCHAR(120),
 finalizado_en TIMESTAMPTZ,
 CHECK((estado='procesando')=(lease_token IS NOT NULL)),
 CHECK((lease_token IS NULL)=(bloqueado_hasta IS NULL)),
 CHECK(estado NOT IN ('pendiente','procesando','reintento') OR payload IS NOT NULL),
 UNIQUE(solicitud_id,proposito)
);
CREATE INDEX IF NOT EXISTS idx_recuperacion_outbox_pendiente ON public.recuperacion_clave_outbox(disponible_en,id) WHERE estado IN ('pendiente','reintento','procesando');
-- Una dirección cambiada no hereda la verificación de la dirección anterior.
CREATE OR REPLACE FUNCTION public.limpiar_verificacion_al_cambiar_correo() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.correo IS DISTINCT FROM OLD.correo THEN NEW.correo_verificado_en=NULL; END IF;
 RETURN NEW;
END; $$;
CREATE OR REPLACE TRIGGER limpiar_verificacion_correo BEFORE UPDATE OF correo ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION public.limpiar_verificacion_al_cambiar_correo();
CREATE OR REPLACE FUNCTION public.revocar_al_cambiar_credenciales() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.clave_hash IS DISTINCT FROM OLD.clave_hash OR NEW.correo IS DISTINCT FROM OLD.correo THEN
  INSERT INTO public.usuario_2fa(id_usuario,version) VALUES(NEW.id_usuario,1)
  ON CONFLICT(id_usuario) DO UPDATE SET version=public.usuario_2fa.version+1,
   pendiente_secreto=NULL,pendiente_hasta=NULL,reautenticado_en=NULL;
  UPDATE public.desafios_2fa SET usado_en=COALESCE(usado_en,clock_timestamp()) WHERE id_usuario=NEW.id_usuario;
  UPDATE public.recuperaciones_clave SET invalidado_en=clock_timestamp(),permiso_hash=NULL,permiso_vence_en=NULL
   WHERE id_usuario=NEW.id_usuario AND usado_en IS NULL AND invalidado_en IS NULL;
  UPDATE public.recuperacion_clave_outbox o SET estado='cancelado',payload=NULL,lease_token=NULL,bloqueado_hasta=NULL,finalizado_en=clock_timestamp()
   FROM public.recuperaciones_clave r WHERE r.id=o.solicitud_id AND r.id_usuario=NEW.id_usuario
   AND o.proposito='codigo' AND o.estado IN ('pendiente','reintento','procesando');
 END IF;
 RETURN NEW;
END; $$;
CREATE OR REPLACE TRIGGER revocar_credenciales AFTER UPDATE OF clave_hash,correo ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION public.revocar_al_cambiar_credenciales();
COMMIT;
