-- ==========================================
-- Hidro Mejora · Migración 002
-- Integridad de número de suministro: 9 dígitos
-- IDEMPOTENTE: seguro ejecutar varias veces.
-- NO modifica ni trunca datos existentes.
-- Solo agrega el CHECK si todas las filas
-- actuales ya cumplen ^[0-9]{9}$ (verificado
-- antes de aplicar). Si alguna fila no cumple,
-- el ALTER fallará sin cambiar nada: reportar
-- esa fila en lugar de forzarla.
-- ==========================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_numero_suministro_9'
    ) THEN
        ALTER TABLE suministros
            ADD CONSTRAINT chk_numero_suministro_9
            CHECK (numero_suministro ~ '^[0-9]{9}$');
    END IF;
END
$$;
