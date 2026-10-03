-- ==========================================
-- HIDRO MEJORA
-- Base de datos inicial
-- PostgreSQL
-- ==========================================


-- USUARIOS
CREATE TABLE usuarios (
    id_usuario BIGSERIAL PRIMARY KEY,
    correo VARCHAR(120) UNIQUE NOT NULL,
    clave_hash VARCHAR(255) NOT NULL,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- SUMINISTROS
CREATE TABLE suministros (
    id_suministro BIGSERIAL PRIMARY KEY,
    numero_suministro VARCHAR(20) UNIQUE NOT NULL,
    id_usuario BIGINT NOT NULL,

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

    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_incidencia_suministro
        FOREIGN KEY (id_suministro)
        REFERENCES suministros(id_suministro)
);
