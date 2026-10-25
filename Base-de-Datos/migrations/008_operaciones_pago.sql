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
