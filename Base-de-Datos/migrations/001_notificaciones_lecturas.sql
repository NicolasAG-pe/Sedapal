-- ==========================================
-- Hidro Mejora · Migración 001
-- Lecturas de notificaciones por suministro
-- IDEMPOTENTE: seguro ejecutar varias veces.
-- NO destruye datos. Solo agrega estructura y
-- migra lecturas Usuario ya marcadas (leida=true).
-- Caso General con leida=true: NO se migra (no se
-- puede saber qué suministros la habían leído);
-- queda documentado, la columna leida pasa a LEGACY.
-- ==========================================

CREATE TABLE IF NOT EXISTS notificaciones_lecturas (
    id_notificacion BIGINT NOT NULL,
    id_suministro BIGINT NOT NULL,
    fecha_lectura TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'pk_notificaciones_lecturas'
    ) THEN
        ALTER TABLE notificaciones_lecturas
            ADD CONSTRAINT pk_notificaciones_lecturas
            PRIMARY KEY (id_notificacion, id_suministro);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_lectura_notificacion'
    ) THEN
        ALTER TABLE notificaciones_lecturas
            ADD CONSTRAINT fk_lectura_notificacion
            FOREIGN KEY (id_notificacion)
            REFERENCES notificaciones(id_notificacion)
            ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_lectura_suministro'
    ) THEN
        ALTER TABLE notificaciones_lecturas
            ADD CONSTRAINT fk_lectura_suministro
            FOREIGN KEY (id_suministro)
            REFERENCES suministros(id_suministro)
            ON DELETE CASCADE;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_lecturas_suministro
    ON notificaciones_lecturas(id_suministro);

-- Migra lecturas ya marcadas en notificaciones de alcance
-- Usuario (id_suministro conocido). No toca las General.
INSERT INTO notificaciones_lecturas (id_notificacion, id_suministro)
SELECT n.id_notificacion, n.id_suministro
FROM notificaciones n
WHERE n.alcance = 'Usuario'
  AND n.leida = TRUE
  AND n.id_suministro IS NOT NULL
ON CONFLICT DO NOTHING;
