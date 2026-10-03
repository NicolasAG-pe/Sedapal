-- ==========================================
-- HIDRO MEJORA
-- Base de datos inicial
-- PostgreSQL
-- ==========================================


-- USUARIOS (rol: 'usuario' normal o 'admin' del panel)
CREATE TABLE usuarios (
    id_usuario BIGSERIAL PRIMARY KEY,
    correo VARCHAR(120) UNIQUE NOT NULL,
    clave_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(20) NOT NULL DEFAULT 'usuario',
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_rol_usuario
        CHECK (rol IN ('usuario', 'admin'))
);


-- SUMINISTROS (ubicación DEMO opcional del prototipo)
CREATE TABLE suministros (
    id_suministro BIGSERIAL PRIMARY KEY,
    numero_suministro VARCHAR(20) UNIQUE NOT NULL,
    id_usuario BIGINT NOT NULL,

    distrito VARCHAR(100),
    zona VARCHAR(150),

    CONSTRAINT fk_suministro_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuarios(id_usuario)
);


-- RECIBOS
CREATE TABLE recibos (
    id_recibo BIGSERIAL PRIMARY KEY,
    id_suministro BIGINT NOT NULL,

    periodo VARCHAR(20) NOT NULL,

    fecha_emision DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,

    monto NUMERIC(10,2) NOT NULL,
    consumo_m3 NUMERIC(10,2) NOT NULL,

    estado VARCHAR(20) NOT NULL,

    CONSTRAINT chk_estado_recibo
        CHECK (estado IN ('Emitido', 'Pendiente', 'Pagado', 'Vencido')),

    CONSTRAINT fk_recibo_suministro
        FOREIGN KEY (id_suministro)
        REFERENCES suministros(id_suministro)
);


-- PAGOS
CREATE TABLE pagos (
    id_pago BIGSERIAL PRIMARY KEY,
    id_recibo BIGINT NOT NULL,

    monto NUMERIC(10,2) NOT NULL,

    metodo VARCHAR(30),
    codigo_operacion VARCHAR(100),

    fecha_pago TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_pago_recibo
        FOREIGN KEY (id_recibo)
        REFERENCES recibos(id_recibo)
);


-- INCIDENCIAS
CREATE TABLE incidencias (
    id_incidencia BIGSERIAL PRIMARY KEY,
    id_suministro BIGINT NOT NULL,

    tipo VARCHAR(80) NOT NULL,
    descripcion TEXT NOT NULL,
    referencia VARCHAR(200),

    latitud NUMERIC(10,7),
    longitud NUMERIC(10,7),

    foto BYTEA,
    foto_mime VARCHAR(50),

    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_incidencia_suministro
        FOREIGN KEY (id_suministro)
        REFERENCES suministros(id_suministro)
);


-- CORTES DE SERVICIO (eventos demostrativos del prototipo)
-- La relación con suministros es N:M mediante cortes_suministros:
-- un corte puede afectar varios suministros y un suministro
-- puede tener varios cortes.
-- Modelo vigente: alcance + fecha_inicio/fecha_fin (TIMESTAMPTZ).
-- Las columnas fecha/hora/estado son LEGADO y ya no se usan.
CREATE TABLE cortes_servicio (
    id_corte BIGSERIAL PRIMARY KEY,

    alcance VARCHAR(20),

    distrito VARCHAR(80),
    zona VARCHAR(120),
    motivo VARCHAR(200) NOT NULL,

    fecha_inicio TIMESTAMPTZ,
    fecha_fin TIMESTAMPTZ,

    cancelado BOOLEAN NOT NULL DEFAULT FALSE,

    fecha DATE,
    hora VARCHAR(30),

    estado VARCHAR(20),

    CONSTRAINT chk_alcance_corte
        CHECK (alcance IS NULL OR alcance IN ('Zona', 'General')),

    CONSTRAINT chk_estado_corte
        CHECK (estado IS NULL OR estado IN ('Programado', 'En proceso', 'Restablecido'))
);


-- RELACIÓN CORTES <-> SUMINISTROS (asociaciones demo del prototipo)
CREATE TABLE cortes_suministros (
    id_corte BIGINT NOT NULL,
    id_suministro BIGINT NOT NULL,

    CONSTRAINT pk_cortes_suministros
        PRIMARY KEY (id_corte, id_suministro),

    CONSTRAINT fk_cs_corte
        FOREIGN KEY (id_corte)
        REFERENCES cortes_servicio(id_corte),

    CONSTRAINT fk_cs_suministro
        FOREIGN KEY (id_suministro)
        REFERENCES suministros(id_suministro)
);
