-- ==========================================
-- HIDRO MEJORA
-- Base de datos inicial
-- PostgreSQL
-- ==========================================


-- USUARIOS (rol: 'usuario' normal o 'admin' del panel)
-- activo: FALSE bloquea login con 403 (cuentas deshabilitadas por admin).
CREATE TABLE usuarios (
    id_usuario BIGSERIAL PRIMARY KEY,
    correo VARCHAR(120) UNIQUE NOT NULL,
    clave_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(20) NOT NULL DEFAULT 'usuario',
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    correo_verificado_en TIMESTAMPTZ,

    CONSTRAINT chk_rol_usuario
        CHECK (rol IN ('usuario', 'admin'))
);


-- SUMINISTROS (ubicación DEMO opcional del prototipo)
-- numero_suministro: exactamente 9 dígitos (CHECK).
CREATE TABLE suministros (
    id_suministro BIGSERIAL PRIMARY KEY,
    numero_suministro VARCHAR(20) UNIQUE NOT NULL,
    id_usuario BIGINT NOT NULL,

    distrito VARCHAR(100),
    zona VARCHAR(150),

    CONSTRAINT chk_numero_suministro_9
        CHECK (numero_suministro ~ '^[0-9]{9}$'),

    CONSTRAINT fk_suministro_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuarios(id_usuario)
);


-- Nuevos registros: no crean cuentas hasta confirmar el correo.
CREATE TABLE registros_correo_pendientes (
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
CREATE TABLE registros_correo_envios (
    id UUID PRIMARY KEY,
    registro_id UUID NOT NULL REFERENCES registros_correo_pendientes(id) ON DELETE CASCADE,
    enviado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_registro_correo ON registros_correo_pendientes(correo);
CREATE INDEX idx_registro_suministro ON registros_correo_pendientes(numero_suministro);
CREATE INDEX idx_registro_vencimiento ON registros_correo_pendientes(vence_en,id);
CREATE INDEX idx_registro_envios ON registros_correo_envios(registro_id, enviado_en);

CREATE TABLE public.correo_outbox (
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
CREATE INDEX idx_correo_outbox_disponible ON public.correo_outbox(disponible_en,id)
    WHERE estado IN ('pendiente','reintento');
CREATE INDEX idx_correo_outbox_lease ON public.correo_outbox(bloqueado_hasta,id)
    WHERE estado='procesando';

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
        CHECK (estado IN ('Emitido', 'Pendiente', 'Pagado', 'Vencido', 'Anulado')),

    CONSTRAINT fk_recibo_suministro
        FOREIGN KEY (id_suministro)
        REFERENCES suministros(id_suministro),

    CONSTRAINT uq_recibos_suministro_periodo UNIQUE (id_suministro, periodo)
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
        REFERENCES recibos(id_recibo),

    CONSTRAINT uq_pagos_recibo UNIQUE (id_recibo)
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

    estado VARCHAR(30) NOT NULL DEFAULT 'Registrada',

    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_estado_incidencia
        CHECK (estado IN ('Registrada', 'En revisión', 'Resuelta')),

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
-- LEGACY: el modelo vigente es dinámico por distrito/zona + avisos generales.
-- Se conserva por compatibilidad; no crear nuevas filas desde el panel.
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


-- SOLICITUDES DE ATENCIÓN AL CLIENTE (persistentes, sin borrado físico)
CREATE TABLE solicitudes_atencion (
    id_solicitud BIGSERIAL PRIMARY KEY,
    id_suministro BIGINT NOT NULL,
    categoria VARCHAR(80) NOT NULL,
    asunto VARCHAR(150) NOT NULL,
    descripcion TEXT NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'Registrada',
    respuesta TEXT NULL,
    fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_estado_solicitud
        CHECK (estado IN ('Registrada', 'En atención', 'Respondida', 'Cerrada')),

    CONSTRAINT fk_solicitud_suministro
        FOREIGN KEY (id_suministro)
        REFERENCES suministros(id_suministro)
);
CREATE INDEX idx_solicitudes_suministro ON solicitudes_atencion(id_suministro);
CREATE INDEX idx_solicitudes_estado ON solicitudes_atencion(estado);


-- NOTIFICACIONES INTERNAS (solo dentro de la app, sin push/Firebase)
-- alcance 'Usuario' => id_suministro obligatorio.
-- alcance 'General' => id_suministro NULL (visible para todos).
-- LEGACY: columna leida (BOOLEAN global). Fuente de verdad actual:
-- notificaciones_lecturas (una fila por suministro que ya la leyó).
-- No usar notificaciones.leida para lógica nueva.
CREATE TABLE notificaciones (
    id_notificacion BIGSERIAL PRIMARY KEY,
    id_suministro BIGINT NULL,
    alcance VARCHAR(20) NOT NULL DEFAULT 'Usuario',
    titulo VARCHAR(150) NOT NULL,
    mensaje TEXT NOT NULL,
    tipo VARCHAR(40) NOT NULL DEFAULT 'general',
    leida BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_alcance_notificacion
        CHECK (alcance IN ('Usuario', 'General')),

    CONSTRAINT fk_notificacion_suministro
        FOREIGN KEY (id_suministro)
        REFERENCES suministros(id_suministro)
);
CREATE INDEX idx_notif_suministro ON notificaciones(id_suministro);
CREATE INDEX idx_notif_fecha ON notificaciones(fecha_registro DESC);


-- LECTURAS DE NOTIFICACIONES POR SUMINISTRO
-- Una notificación General es la misma fila para todos, pero cada
-- suministro tiene su propio estado de lectura (una fila aquí = leída).
CREATE TABLE notificaciones_lecturas (
    id_notificacion BIGINT NOT NULL,
    id_suministro BIGINT NOT NULL,
    fecha_lectura TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_notificaciones_lecturas
        PRIMARY KEY (id_notificacion, id_suministro),

    CONSTRAINT fk_lectura_notificacion
        FOREIGN KEY (id_notificacion)
        REFERENCES notificaciones(id_notificacion)
        ON DELETE CASCADE,

    CONSTRAINT fk_lectura_suministro
        FOREIGN KEY (id_suministro)
        REFERENCES suministros(id_suministro)
        ON DELETE CASCADE
);
CREATE INDEX idx_lecturas_suministro ON notificaciones_lecturas(id_suministro);
