-- Ejecutar con el rol migrador después de 011–013 y del perfil de Billing elegido.
-- Las identidades de ejecución se aprovisionan fuera de esta migración.
BEGIN;
CREATE SCHEMA IF NOT EXISTS hm_contract;
CREATE SCHEMA IF NOT EXISTS hm_identity;
CREATE SCHEMA IF NOT EXISTS hm_projection;
CREATE SCHEMA IF NOT EXISTS hm_reporting;

CREATE OR REPLACE VIEW hm_identity.suministros AS
 SELECT id_suministro, id_usuario, numero_suministro, distrito, zona FROM public.suministros;
CREATE OR REPLACE VIEW hm_identity.usuarios AS
 SELECT id_usuario, rol, activo FROM public.usuarios;
CREATE OR REPLACE VIEW hm_identity.usuario_2fa AS
 SELECT id_usuario, version FROM public.usuario_2fa;
CREATE OR REPLACE VIEW hm_projection.recibos AS
 SELECT id_recibo, id_suministro, periodo, fecha_vencimiento, estado FROM public.recibos;
CREATE OR REPLACE VIEW hm_projection.pagos AS SELECT id_recibo FROM public.pagos;
CREATE OR REPLACE VIEW hm_projection.cortes_servicio AS
 SELECT id_corte, alcance, distrito, zona, cancelado FROM public.cortes_servicio;
CREATE OR REPLACE VIEW hm_projection.cortes_suministros AS
 SELECT id_corte, id_suministro FROM public.cortes_suministros;

CREATE OR REPLACE VIEW hm_reporting.recibos AS
 SELECT id_recibo, id_suministro, periodo, fecha_emision, fecha_vencimiento, monto, consumo_m3, estado FROM public.recibos;
CREATE OR REPLACE VIEW hm_reporting.pagos AS
 SELECT id_pago, id_recibo, monto, metodo, codigo_operacion, fecha_pago FROM public.pagos;
CREATE OR REPLACE VIEW hm_reporting.incidencias AS
 SELECT id_incidencia, id_suministro, tipo, descripcion, referencia, estado, fecha_registro, foto IS NOT NULL AS tiene_foto
 FROM public.incidencias;
CREATE OR REPLACE VIEW hm_reporting.cortes_servicio AS
 SELECT alcance, fecha_inicio, fecha_fin, cancelado FROM public.cortes_servicio;
CREATE OR REPLACE VIEW hm_reporting.solicitudes_atencion AS SELECT estado FROM public.solicitudes_atencion;

-- Estos locks viven hasta el COMMIT del invocador, sobre las mismas filas del esquema original.
CREATE OR REPLACE FUNCTION hm_contract.lock_supply(p_id bigint, p_number text, p_owner bigint)
RETURNS TABLE (id_suministro bigint, numero_suministro varchar, id_usuario bigint)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT s.id_suministro,s.numero_suministro,s.id_usuario FROM public.suministros s
 WHERE ((p_id IS NOT NULL AND s.id_suministro=p_id) OR (p_id IS NULL AND s.numero_suministro=p_number))
   AND (p_owner IS NULL OR s.id_usuario=p_owner)
 FOR NO KEY UPDATE OF s;
$$;
CREATE OR REPLACE FUNCTION hm_contract.lock_actor(p_actor bigint, p_for_push boolean)
RETURNS TABLE (id_usuario bigint, rol varchar, activo boolean, id_suministro bigint, version integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_for_push THEN
  RETURN QUERY SELECT u.id_usuario,u.rol,u.activo,s.id_suministro,COALESCE(m.version,0)
    FROM public.usuarios u JOIN public.suministros s USING(id_usuario)
    LEFT JOIN public.usuario_2fa m USING(id_usuario) WHERE u.id_usuario=p_actor FOR UPDATE OF u,s;
 ELSE
  RETURN QUERY SELECT u.id_usuario,u.rol,u.activo,NULL::bigint,COALESCE(m.version,0)
    FROM public.usuarios u LEFT JOIN public.usuario_2fa m USING(id_usuario)
    WHERE u.id_usuario=p_actor FOR SHARE OF u;
 END IF;
END;
$$;
CREATE OR REPLACE FUNCTION hm_contract.operations_notice(p_supply bigint, p_scope text, p_title text, p_body text, p_kind text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE notification bigint;
BEGIN
 IF p_scope NOT IN ('Usuario','General') OR p_kind NOT IN ('incidencia','atencion','corte') OR
    (p_scope='Usuario' AND p_supply IS NULL) OR (p_scope='General' AND (p_supply IS NOT NULL OR p_kind<>'corte')) OR
    coalesce(btrim(p_title),'')='' OR coalesce(btrim(p_body),'')='' THEN
  RAISE EXCEPTION 'Aviso de Operations inválido' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.notificaciones(id_suministro,alcance,titulo,mensaje,tipo)
 VALUES(p_supply,p_scope,left(p_title,150),p_body,p_kind) RETURNING id_notificacion INTO notification;
 RETURN notification;
END;
$$;

-- Los triggers existentes conservan el encolado/revocación sin otorgar escritura a otro dominio.
ALTER FUNCTION public.encolar_notificacion_push() SECURITY DEFINER;
ALTER FUNCTION public.revocar_push_por_seguridad() SECURITY DEFINER;
ALTER FUNCTION public.notificar_corte_local_push() SECURITY DEFINER;
ALTER FUNCTION public.notificar_corte_asociado_push() SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.encolar_notificacion_push(), public.revocar_push_por_seguridad(),
 public.notificar_corte_local_push(), public.notificar_corte_asociado_push() FROM PUBLIC;

CREATE TABLE IF NOT EXISTS hm_contract.events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 room text NOT NULL CHECK (room ~ '^(authenticated|admins|suministro:[1-9][0-9]*|auth-revocacion:[1-9][0-9]*)$'),
 kind text NOT NULL,
 payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
 emitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 delivered_at timestamptz
);
CREATE INDEX IF NOT EXISTS pending_events ON hm_contract.events(id) WHERE delivered_at IS NULL;

CREATE OR REPLACE FUNCTION hm_contract.publish_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target text; kind text; data jsonb; admin_kind text; supply bigint;
BEGIN
 CASE TG_TABLE_NAME
 WHEN 'usuarios' THEN
  IF OLD.activo IS NOT DISTINCT FROM NEW.activo AND OLD.rol IS NOT DISTINCT FROM NEW.rol
      AND OLD.clave_hash IS NOT DISTINCT FROM NEW.clave_hash THEN RETURN NEW; END IF;
  target := 'auth-revocacion:'||NEW.id_usuario; kind := 'auth:revalidar'; data := '{}'::jsonb;
 WHEN 'usuario_2fa' THEN
  IF TG_OP='UPDATE' AND OLD.version=NEW.version THEN RETURN NEW; END IF;
  target := 'auth-revocacion:'||NEW.id_usuario; kind := 'auth:revalidar'; data := '{}'::jsonb;
 WHEN 'suministros' THEN
  IF OLD.distrito IS NOT DISTINCT FROM NEW.distrito AND OLD.zona IS NOT DISTINCT FROM NEW.zona
      AND OLD.id_usuario=NEW.id_usuario THEN RETURN NEW; END IF;
  IF OLD.id_usuario<>NEW.id_usuario THEN
   INSERT INTO hm_contract.events(room,kind,payload)
    VALUES ('auth-revocacion:'||OLD.id_usuario,'auth:revalidar','{}'), ('auth-revocacion:'||NEW.id_usuario,'auth:revalidar','{}');
  END IF;
  target := 'suministro:'||NEW.id_suministro; kind := 'perfil:actualizado'; data := jsonb_build_object('id',NEW.id_suministro::text);
 WHEN 'recibos' THEN
  target := 'suministro:'||NEW.id_suministro;
  IF TG_OP='INSERT' THEN
   kind := 'recibo:nuevo'; data := jsonb_build_object('id',NEW.id_recibo::text,'periodo',NEW.periodo);
   INSERT INTO public.notificaciones(id_suministro,alcance,titulo,mensaje,tipo,push_recibo)
   VALUES(NEW.id_suministro,'Usuario',left('Nuevo recibo disponible: '||NEW.periodo,150),
          'Se publicó tu recibo '||NEW.periodo||' por S/ '||NEW.monto::text||'.','recibo',NEW.id_recibo);
  ELSE
   kind := 'recibo:actualizado'; data := jsonb_build_object('id',NEW.id_recibo::text,'estado',NEW.estado);
  END IF;
 WHEN 'operaciones_pago' THEN
  IF TG_OP='UPDATE' AND OLD.estado=NEW.estado THEN RETURN NEW; END IF;
  SELECT id_suministro INTO supply FROM public.recibos WHERE id_recibo=NEW.id_recibo;
  target := 'suministro:'||supply;
  kind := 'pago:registrado'; admin_kind := 'pago:nuevo';
  data := jsonb_build_object('id_operacion',NEW.id,'id_recibo',NEW.id_recibo::text);
 WHEN 'incidencias' THEN
  IF TG_OP='UPDATE' AND OLD.estado=NEW.estado THEN RETURN NEW; END IF;
  target := 'suministro:'||NEW.id_suministro;
  kind := CASE WHEN TG_OP='INSERT' THEN 'incidencia:nueva' ELSE 'incidencia:actualizada' END;
  admin_kind := kind; data := jsonb_build_object('id',NEW.id_incidencia::text);
  IF TG_OP='UPDATE' THEN data := data||jsonb_build_object('estado',NEW.estado); END IF;
 WHEN 'solicitudes_atencion' THEN
  target := 'suministro:'||NEW.id_suministro;
  kind := CASE WHEN TG_OP='INSERT' THEN 'atencion:nueva' ELSE 'atencion:actualizada' END;
  data := jsonb_build_object('id',NEW.id_solicitud::text);
  IF TG_OP='INSERT' THEN admin_kind := kind; ELSE data := data||jsonb_build_object('estado',NEW.estado); END IF;
 WHEN 'cortes_servicio' THEN
  target := 'authenticated'; kind := 'corte:actualizado';
  data := jsonb_build_object('id',NEW.id_corte::text,'accion',
     CASE WHEN TG_OP='INSERT' THEN 'creado' WHEN NEW.cancelado THEN 'cancelado' ELSE 'editado' END);
 WHEN 'notificaciones' THEN
  target := CASE WHEN NEW.alcance='General' THEN 'authenticated' ELSE 'suministro:'||NEW.id_suministro END;
  kind := 'notificacion:nueva'; data := jsonb_build_object('id',NEW.id_notificacion::text,'alcance',NEW.alcance,'tipo',NEW.tipo);
 ELSE RAISE EXCEPTION 'Tabla sin contrato de eventos';
 END CASE;
 INSERT INTO hm_contract.events(room,kind,payload) VALUES(target,kind,data);
 IF admin_kind IS NOT NULL THEN INSERT INTO hm_contract.events(room,kind,payload) VALUES('admins',admin_kind,data); END IF;
 RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER ms_event AFTER UPDATE OF rol,activo,clave_hash ON public.usuarios
 FOR EACH ROW EXECUTE FUNCTION hm_contract.publish_change();
CREATE OR REPLACE TRIGGER ms_event AFTER INSERT OR UPDATE OF version ON public.usuario_2fa
 FOR EACH ROW EXECUTE FUNCTION hm_contract.publish_change();
CREATE OR REPLACE TRIGGER ms_event AFTER UPDATE OF distrito,zona,id_usuario ON public.suministros
 FOR EACH ROW EXECUTE FUNCTION hm_contract.publish_change();
CREATE OR REPLACE TRIGGER ms_event AFTER INSERT OR UPDATE ON public.recibos
 FOR EACH ROW EXECUTE FUNCTION hm_contract.publish_change();
CREATE OR REPLACE TRIGGER ms_event AFTER INSERT OR UPDATE OF estado ON public.operaciones_pago
 FOR EACH ROW EXECUTE FUNCTION hm_contract.publish_change();
CREATE OR REPLACE TRIGGER ms_event AFTER INSERT OR UPDATE OF estado ON public.incidencias
 FOR EACH ROW EXECUTE FUNCTION hm_contract.publish_change();
CREATE OR REPLACE TRIGGER ms_event AFTER INSERT OR UPDATE ON public.solicitudes_atencion
 FOR EACH ROW EXECUTE FUNCTION hm_contract.publish_change();
CREATE OR REPLACE TRIGGER ms_event AFTER INSERT OR UPDATE ON public.cortes_servicio
 FOR EACH ROW EXECUTE FUNCTION hm_contract.publish_change();
CREATE OR REPLACE TRIGGER ms_event AFTER INSERT ON public.notificaciones
 FOR EACH ROW EXECUTE FUNCTION hm_contract.publish_change();

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hm_contract FROM PUBLIC;
GRANT USAGE ON SCHEMA hm_contract TO hm_billing,hm_operations,hm_notifications,hm_realtime;
GRANT EXECUTE ON FUNCTION hm_contract.lock_supply(bigint,text,bigint) TO hm_billing;
GRANT EXECUTE ON FUNCTION hm_contract.lock_actor(bigint,boolean) TO hm_operations,hm_notifications;
GRANT EXECUTE ON FUNCTION hm_contract.operations_notice(bigint,text,text,text,text) TO hm_operations;
GRANT SELECT, UPDATE(delivered_at) ON hm_contract.events TO hm_realtime;

GRANT USAGE ON SCHEMA hm_identity TO hm_billing,hm_operations,hm_notifications;
GRANT USAGE ON SCHEMA hm_projection TO hm_notifications;
GRANT SELECT ON hm_identity.suministros TO hm_billing,hm_operations,hm_notifications;
GRANT SELECT ON hm_identity.usuarios TO hm_billing,hm_operations,hm_notifications;
GRANT SELECT ON hm_identity.usuario_2fa TO hm_operations,hm_notifications;
GRANT SELECT ON hm_projection.recibos,hm_projection.pagos,hm_projection.cortes_servicio,hm_projection.cortes_suministros TO hm_notifications;
GRANT USAGE ON SCHEMA hm_reporting TO hm_auth;
GRANT SELECT ON ALL TABLES IN SCHEMA hm_reporting TO hm_auth;

GRANT SELECT,INSERT,UPDATE,DELETE ON public.usuarios,public.suministros,public.registros_correo_pendientes,
 public.registros_correo_envios,public.correo_outbox,public.usuario_2fa,public.usuario_2fa_recuperacion,public.desafios_2fa,
 public.recuperacion_clave_limites,public.recuperaciones_clave,public.recuperacion_clave_outbox TO hm_auth;
GRANT USAGE ON SEQUENCE public.usuarios_id_usuario_seq,public.suministros_id_suministro_seq TO hm_auth;
GRANT SELECT,INSERT,UPDATE ON public.recibos,public.pagos,public.operaciones_pago,public.operaciones_pago_historial,
 public.eventos_pago_proveedor TO hm_billing;
DO $$
BEGIN
 IF to_regclass('public.control_piloto_yape') IS NOT NULL THEN
  GRANT SELECT,UPDATE ON public.control_piloto_yape TO hm_billing;
 END IF;
END;
$$;
GRANT USAGE ON SEQUENCE public.recibos_id_recibo_seq,public.pagos_id_pago_seq,public.operaciones_pago_historial_id_seq TO hm_billing;
GRANT SELECT,INSERT,UPDATE ON public.incidencias,public.cortes_servicio,public.cortes_suministros,
 public.solicitudes_atencion TO hm_operations;
GRANT SELECT,INSERT ON public.incidencia_eventos,public.incidencia_cambios TO hm_operations;
GRANT USAGE ON SEQUENCE public.incidencias_id_incidencia_seq,public.cortes_servicio_id_corte_seq,
 public.solicitudes_atencion_id_solicitud_seq,public.incidencia_eventos_orden_seq TO hm_operations;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.notificaciones,public.notificaciones_lecturas,
 public.push_dispositivos,public.push_entregas TO hm_notifications;
GRANT USAGE ON SEQUENCE public.notificaciones_id_notificacion_seq TO hm_notifications;
COMMIT;
