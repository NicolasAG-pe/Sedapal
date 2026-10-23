-- Aplicar manualmente solo a una base autorizada. No ejecutar desde el arranque.
BEGIN;

-- NULL conserva el significado de cuenta previa sin verificación acreditada.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS correo_verificado_en TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS registros_correo_pendientes (
    id UUID PRIMARY KEY,
    correo VARCHAR(120) NOT NULL CHECK (correo = lower(trim(correo))),
    numero_suministro VARCHAR(20) NOT NULL CHECK (numero_suministro ~ '^[0-9]{9}$'),
    clave_hash VARCHAR(255) NOT NULL,
    codigo_hash CHAR(64) NOT NULL CHECK (codigo_hash ~ '^[a-f0-9]{64}$'),
    codigo_vence_en TIMESTAMPTZ NOT NULL,
    intentos SMALLINT NOT NULL DEFAULT 0 CHECK (intentos BETWEEN 0 AND 5),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    vence_en TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour'),
    consumido_en TIMESTAMPTZ,
    invalidado BOOLEAN NOT NULL DEFAULT FALSE
);

-- Historial de envíos para límites compartidos entre procesos y solicitudes.
CREATE TABLE IF NOT EXISTS registros_correo_envios (
    id UUID PRIMARY KEY,
    registro_id UUID NOT NULL REFERENCES registros_correo_pendientes(id) ON DELETE CASCADE,
    enviado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_registro_correo ON registros_correo_pendientes(correo);
CREATE INDEX IF NOT EXISTS idx_registro_suministro ON registros_correo_pendientes(numero_suministro);
CREATE INDEX IF NOT EXISTS idx_registro_envios ON registros_correo_envios(registro_id, enviado_en);

COMMIT;
