-- Preparada para aplicación manual autorizada. No ejecutar desde el arranque.
BEGIN;
CREATE INDEX IF NOT EXISTS idx_registro_vencimiento
    ON registros_correo_pendientes(vence_en,id);
COMMIT;
