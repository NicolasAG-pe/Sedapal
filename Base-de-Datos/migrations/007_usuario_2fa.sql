-- Manual, aditiva e idempotente. No activa 2FA ni modifica cuentas existentes.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
CREATE TABLE IF NOT EXISTS public.usuario_2fa (
    id_usuario BIGINT PRIMARY KEY REFERENCES public.usuarios(id_usuario),
    version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
    activo BOOLEAN NOT NULL DEFAULT FALSE,
    secreto TEXT,
    ultimo_paso BIGINT NOT NULL DEFAULT -1,
    pendiente_secreto TEXT,
    pendiente_hasta TIMESTAMPTZ,
    reautenticado_en TIMESTAMPTZ,
    fallos SMALLINT NOT NULL DEFAULT 0 CHECK (fallos BETWEEN 0 AND 5),
    bloqueado_hasta TIMESTAMPTZ,
    CHECK (NOT activo OR secreto IS NOT NULL),
    CHECK ((pendiente_secreto IS NULL) = (pendiente_hasta IS NULL))
);
CREATE TABLE IF NOT EXISTS public.usuario_2fa_recuperacion (
    id_usuario BIGINT NOT NULL REFERENCES public.usuario_2fa(id_usuario),
    codigo_hash CHAR(64) NOT NULL CHECK (codigo_hash ~ '^[a-f0-9]{64}$'),
    usado_en TIMESTAMPTZ,
    PRIMARY KEY (id_usuario,codigo_hash)
);
CREATE TABLE IF NOT EXISTS public.desafios_2fa (
    id_hash CHAR(64) PRIMARY KEY CHECK (id_hash ~ '^[a-f0-9]{64}$'),
    id_usuario BIGINT NOT NULL REFERENCES public.usuario_2fa(id_usuario),
    version INTEGER NOT NULL CHECK (version >= 0),
    clave_huella CHAR(64) NOT NULL,
    vence_en TIMESTAMPTZ NOT NULL,
    intentos SMALLINT NOT NULL DEFAULT 0 CHECK (intentos BETWEEN 0 AND 5),
    usado_en TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_desafios_2fa_usuario ON public.desafios_2fa(id_usuario);
CREATE INDEX IF NOT EXISTS idx_desafios_2fa_vencimiento ON public.desafios_2fa(vence_en);
-- Los cambios futuros de permisos/estado revocan también JWT antiguos sin MFA.
CREATE OR REPLACE FUNCTION public.revocar_2fa_al_cambiar_cuenta() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
    IF NEW.rol IS DISTINCT FROM OLD.rol OR NEW.activo IS DISTINCT FROM OLD.activo THEN
        INSERT INTO public.usuario_2fa(id_usuario,version) VALUES (NEW.id_usuario,1)
        ON CONFLICT (id_usuario) DO UPDATE SET version=public.usuario_2fa.version+1;
    END IF;
    RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER revocar_2fa_cuenta
AFTER UPDATE OF rol,activo ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION public.revocar_2fa_al_cambiar_cuenta();
COMMIT;
