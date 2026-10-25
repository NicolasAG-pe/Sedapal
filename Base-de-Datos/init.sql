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

-- 008: operaciones de pago aisladas de los registros históricos.
-- Operaciones separadas de los pagos históricos: ninguna declaración acredita deuda.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
 IF to_regclass('public.usuario_2fa') IS NULL THEN RAISE EXCEPTION 'Aplicar 007 antes de 008'; END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.operaciones_pago (
 id UUID PRIMARY KEY,
 solicitud_id UUID NOT NULL,
 id_usuario BIGINT NOT NULL REFERENCES public.usuarios(id_usuario),
 id_recibo BIGINT NOT NULL REFERENCES public.recibos(id_recibo),
 monto NUMERIC(10,2) NOT NULL CHECK(monto>0),
 moneda TEXT NOT NULL DEFAULT 'PEN' CHECK(moneda='PEN'),
 entorno TEXT NOT NULL CHECK(entorno='simulado'),
 metodo TEXT NOT NULL CHECK(metodo IN ('demostrativo','yape_manual','proveedor_simulado')),
 estado TEXT NOT NULL CHECK(estado IN ('demostrativa','declarada','pendiente_verificacion','verificada_manual','acreditada_proveedor','rechazada','cancelada','reembolsada')),
 referencia TEXT CHECK(length(referencia) BETWEEN 4 AND 100),
 referencia_hash TEXT CHECK(referencia_hash ~ '^[a-f0-9]{64}$'),
 payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 comprobante BYTEA CHECK(octet_length(comprobante)<=1048576),
 comprobante_hash TEXT CHECK(comprobante_hash ~ '^[a-f0-9]{64}$'),
 proveedor_id TEXT UNIQUE,
 creado_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 actualizado_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 revisado_por BIGINT REFERENCES public.usuarios(id_usuario),
 revisado_en TIMESTAMPTZ,
 motivo TEXT CHECK(length(motivo) BETWEEN 8 AND 500),
 UNIQUE(id_usuario,solicitud_id),
 CHECK ((comprobante IS NULL)=(comprobante_hash IS NULL)),
 CHECK ((metodo='demostrativo')=(estado='demostrativa')),
 CHECK (estado<>'verificada_manual' OR (metodo='yape_manual' AND revisado_por IS NOT NULL AND revisado_en IS NOT NULL AND motivo IS NOT NULL)),
 CHECK (estado<>'acreditada_proveedor' OR (metodo='proveedor_simulado' AND proveedor_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_operacion_activa_recibo ON public.operaciones_pago(id_recibo)
 WHERE estado IN ('declarada','pendiente_verificacion','verificada_manual','acreditada_proveedor');
-- Una declaración no demuestra propiedad de la referencia: no debe reservarla globalmente.
CREATE INDEX IF NOT EXISTS idx_referencia_declarada ON public.operaciones_pago(referencia_hash) WHERE referencia_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_referencia_verificada ON public.operaciones_pago(referencia_hash)
 WHERE estado='verificada_manual';
CREATE INDEX IF NOT EXISTS idx_operaciones_revision ON public.operaciones_pago(creado_en,id) WHERE estado='pendiente_verificacion';
CREATE TABLE IF NOT EXISTS public.operaciones_pago_historial (
 id BIGSERIAL PRIMARY KEY,
 operacion_id UUID NOT NULL REFERENCES public.operaciones_pago(id),
 estado TEXT NOT NULL,
 actor_id BIGINT REFERENCES public.usuarios(id_usuario),
 motivo TEXT NOT NULL CHECK(length(motivo) BETWEEN 8 AND 500),
 fecha TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS public.eventos_pago_proveedor (
 evento_id TEXT PRIMARY KEY CHECK(length(evento_id) BETWEEN 1 AND 100),
 operacion_id UUID NOT NULL REFERENCES public.operaciones_pago(id),
 payload_hash TEXT NOT NULL,
 recibido_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE OR REPLACE FUNCTION public.controlar_operacion_pago() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Las operaciones conservan su historial'; END IF;
 IF ROW(NEW.id,NEW.solicitud_id,NEW.id_usuario,NEW.id_recibo,NEW.monto,NEW.moneda,NEW.entorno,NEW.metodo,NEW.referencia,NEW.referencia_hash,NEW.payload_hash,NEW.comprobante,NEW.comprobante_hash,NEW.creado_en)
 IS DISTINCT FROM ROW(OLD.id,OLD.solicitud_id,OLD.id_usuario,OLD.id_recibo,OLD.monto,OLD.moneda,OLD.entorno,OLD.metodo,OLD.referencia,OLD.referencia_hash,OLD.payload_hash,OLD.comprobante,OLD.comprobante_hash,OLD.creado_en)
 THEN RAISE EXCEPTION 'Datos originales inmutables'; END IF;
 IF NEW.estado<>OLD.estado AND NOT (
  (OLD.estado='declarada' AND NEW.estado='pendiente_verificacion') OR
  (OLD.estado='pendiente_verificacion' AND NEW.estado IN ('verificada_manual','acreditada_proveedor','rechazada','cancelada')) OR
  (OLD.estado='acreditada_proveedor' AND NEW.estado='reembolsada')
 ) THEN RAISE EXCEPTION 'Transición no permitida'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER controlar_operacion_pago BEFORE UPDATE OR DELETE ON public.operaciones_pago
 FOR EACH ROW EXECUTE FUNCTION public.controlar_operacion_pago();
CREATE OR REPLACE FUNCTION public.conservar_auditoria_pago() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Auditoría de pagos inmutable'; END $$;
CREATE OR REPLACE TRIGGER conservar_auditoria_pago BEFORE UPDATE OR DELETE ON public.operaciones_pago_historial
 FOR EACH ROW EXECUTE FUNCTION public.conservar_auditoria_pago();
COMMIT;
-- Piloto local: no acredita recibos ni servicios. No ejecutar en Neon.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN IF to_regclass('public.operaciones_pago') IS NULL THEN RAISE EXCEPTION 'Aplicar 008 antes de 009'; END IF; END $$;
CREATE TABLE IF NOT EXISTS public.control_piloto_yape (
 singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK(singleton),
 piloto_id UUID NOT NULL UNIQUE,
 habilitado BOOLEAN NOT NULL DEFAULT false,
 ensayo_sintetico BOOLEAN NOT NULL,
 id_recibo BIGINT NOT NULL REFERENCES public.recibos(id_recibo),
 id_usuario BIGINT NOT NULL REFERENCES public.usuarios(id_usuario),
 id_admin BIGINT NOT NULL REFERENCES public.usuarios(id_usuario),
 qr_hash TEXT NOT NULL CHECK(qr_hash ~ '^[a-f0-9]{64}$'),
 monto_maximo NUMERIC(10,2) NOT NULL CHECK(monto_maximo>0 AND monto_maximo<=5),
 inicio_en TIMESTAMPTZ NOT NULL,
 vence_en TIMESTAMPTZ NOT NULL,
 CHECK(id_usuario<>id_admin),
 CHECK(vence_en>inicio_en AND vence_en<=inicio_en+INTERVAL '4 hours'),
 CHECK(current_database() ~ '^hm_(email_)?yape_pilot_[a-f0-9]{12,32}$')
);
ALTER TABLE public.operaciones_pago ADD COLUMN IF NOT EXISTS piloto_id UUID REFERENCES public.control_piloto_yape(piloto_id);
ALTER TABLE public.operaciones_pago ADD COLUMN IF NOT EXISTS piloto_ensayo BOOLEAN;
ALTER TABLE public.operaciones_pago ADD COLUMN IF NOT EXISTS receptor_huella TEXT;
ALTER TABLE public.operaciones_pago ADD COLUMN IF NOT EXISTS recibido_en TIMESTAMPTZ;
ALTER TABLE public.operaciones_pago ADD COLUMN IF NOT EXISTS monto_recibido NUMERIC(10,2);
ALTER TABLE public.operaciones_pago ADD COLUMN IF NOT EXISTS receptor_comprobado BOOLEAN;
ALTER TABLE public.operaciones_pago DROP CONSTRAINT IF EXISTS operaciones_pago_entorno_check;
ALTER TABLE public.operaciones_pago ADD CONSTRAINT operaciones_pago_entorno_check CHECK(entorno IN ('simulado','piloto_manual'));
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.operaciones_pago'::regclass AND conname='chk_piloto_local') THEN
 ALTER TABLE public.operaciones_pago ADD CONSTRAINT chk_piloto_local CHECK (
  (entorno='simulado' AND piloto_id IS NULL AND piloto_ensayo IS NULL AND receptor_huella IS NULL AND recibido_en IS NULL AND monto_recibido IS NULL AND receptor_comprobado IS NULL) OR
  (entorno='piloto_manual' AND current_database() ~ '^hm_(email_)?yape_pilot_[a-f0-9]{12,32}$' AND metodo='yape_manual' AND estado NOT IN ('demostrativa','acreditada_proveedor','reembolsada') AND piloto_id IS NOT NULL AND piloto_ensayo IS NOT NULL AND receptor_huella IS NOT NULL AND receptor_huella ~ '^[a-f0-9]{64}$' AND (estado<>'verificada_manual' OR (recibido_en IS NOT NULL AND monto_recibido IS NOT NULL AND monto_recibido=monto AND receptor_comprobado IS TRUE)))
 ); END IF; END $$;
CREATE OR REPLACE FUNCTION public.controlar_piloto_yape() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Las operaciones conservan su historial'; END IF;
 IF ROW(NEW.piloto_id,NEW.piloto_ensayo,NEW.receptor_huella) IS DISTINCT FROM ROW(OLD.piloto_id,OLD.piloto_ensayo,OLD.receptor_huella) THEN RAISE EXCEPTION 'Piloto y receptor originales inmutables'; END IF;
 IF OLD.revisado_en IS NOT NULL AND ROW(NEW.recibido_en,NEW.monto_recibido,NEW.receptor_comprobado,NEW.revisado_por,NEW.revisado_en,NEW.motivo) IS DISTINCT FROM ROW(OLD.recibido_en,OLD.monto_recibido,OLD.receptor_comprobado,OLD.revisado_por,OLD.revisado_en,OLD.motivo) THEN RAISE EXCEPTION 'Revisión final inmutable'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER controlar_piloto_yape BEFORE UPDATE OR DELETE ON public.operaciones_pago
 FOR EACH ROW EXECUTE FUNCTION public.controlar_piloto_yape();
COMMIT;
-- Solo laboratorio. Separa revisión sintética de recepción bancaria sin reescribir historia.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN IF to_regclass('public.control_piloto_yape') IS NULL THEN RAISE EXCEPTION 'Aplicar 009 antes de 010'; END IF; END $$;
ALTER TABLE public.operaciones_pago DROP CONSTRAINT IF EXISTS chk_piloto_local;
ALTER TABLE public.operaciones_pago ADD CONSTRAINT chk_piloto_local CHECK (
 (entorno='simulado' AND piloto_id IS NULL AND piloto_ensayo IS NULL AND receptor_huella IS NULL AND recibido_en IS NULL AND monto_recibido IS NULL AND receptor_comprobado IS NULL) OR
 (entorno='piloto_manual' AND current_database() ~ '^hm_(email_)?yape_pilot_[a-f0-9]{12,32}$' AND metodo='yape_manual' AND estado NOT IN ('demostrativa','acreditada_proveedor','reembolsada') AND piloto_id IS NOT NULL AND piloto_ensayo IS NOT NULL AND receptor_huella IS NOT NULL AND receptor_huella ~ '^[a-f0-9]{64}$' AND (estado<>'verificada_manual' OR piloto_ensayo IS TRUE OR (monto_recibido IS NOT NULL AND monto_recibido=monto AND receptor_comprobado IS TRUE)))
);
CREATE OR REPLACE FUNCTION public.validar_revision_sintetica() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.piloto_ensayo IS TRUE AND NEW.estado='verificada_manual' AND OLD.estado<>'verificada_manual' AND (NEW.recibido_en IS NOT NULL OR NEW.monto_recibido IS NOT NULL OR NEW.receptor_comprobado IS NOT NULL) THEN
  RAISE EXCEPTION 'Un ensayo no registra recepción bancaria';
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER validar_revision_sintetica BEFORE UPDATE ON public.operaciones_pago FOR EACH ROW EXECUTE FUNCTION public.validar_revision_sintetica();
COMMIT;
