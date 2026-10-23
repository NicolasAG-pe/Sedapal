-- Manual y aditiva. No activa un trabajador ni modifica filas existentes.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
CREATE TABLE IF NOT EXISTS public.correo_outbox (
    id UUID PRIMARY KEY REFERENCES public.registros_correo_envios(id) ON DELETE CASCADE,
    codigo_hash CHAR(64) NOT NULL CHECK (codigo_hash ~ '^[a-f0-9]{64}$'),
    estado VARCHAR(16) NOT NULL DEFAULT 'pendiente' CHECK (estado IN
        ('pendiente','procesando','reintento','aceptado','fallido','caducado','cancelado','ambiguo')),
    payload BYTEA,
    clave_version SMALLINT NOT NULL DEFAULT 1 CHECK (clave_version=1),
    clave_id CHAR(16) NOT NULL CHECK (clave_id ~ '^[a-f0-9]{16}$'),
    intentos SMALLINT NOT NULL DEFAULT 0 CHECK (intentos BETWEEN 0 AND 5),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    disponible_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    iniciado_en TIMESTAMPTZ,
    codigo_vence_en TIMESTAMPTZ,
    enviar_hasta TIMESTAMPTZ,
    lease_token UUID,
    bloqueado_hasta TIMESTAMPTZ,
    aceptado_en TIMESTAMPTZ,
    finalizado_en TIMESTAMPTZ,
    proveedor_id VARCHAR(120),
    hubo_ambiguedad BOOLEAN NOT NULL DEFAULT FALSE,
    ultimo_error VARCHAR(16) CHECK (ultimo_error IN ('transitorio','permanente','ambiguo','cifrado','caducado')),
    CHECK ((estado IN ('pendiente','procesando','reintento')) = (payload IS NOT NULL)),
    CHECK (payload IS NULL OR octet_length(payload) BETWEEN 29 AND 16384),
    CHECK ((estado='procesando' AND lease_token IS NOT NULL AND bloqueado_hasta IS NOT NULL) OR
        (estado<>'procesando' AND lease_token IS NULL AND bloqueado_hasta IS NULL)),
    CHECK ((estado IN ('pendiente','procesando','reintento')) = (finalizado_en IS NULL)),
    CHECK ((iniciado_en IS NULL AND codigo_vence_en IS NULL AND enviar_hasta IS NULL) OR
        (iniciado_en IS NOT NULL AND codigo_vence_en IS NOT NULL AND enviar_hasta IS NOT NULL AND enviar_hasta<codigo_vence_en)),
    CHECK (estado<>'aceptado' OR (aceptado_en IS NOT NULL AND proveedor_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_correo_outbox_disponible ON public.correo_outbox(disponible_en,id)
    WHERE estado IN ('pendiente','reintento');
CREATE INDEX IF NOT EXISTS idx_correo_outbox_lease ON public.correo_outbox(bloqueado_hasta,id)
    WHERE estado='procesando';
COMMIT;
