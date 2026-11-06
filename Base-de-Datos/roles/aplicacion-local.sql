-- Rol de permisos para el backend local con 005, 007, 008 y 013.
-- No crea usuario de inicio de sesión, credenciales ni habilita funcionalidades opcionales.
-- Para una instalación nueva únicamente: si el rol ya existe, aborta para revisión.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hidro_app_permisos_120') THEN
  RAISE EXCEPTION 'El rol hidro_app_permisos_120 ya existe; revisar sus privilegios antes de continuar';
 END IF;
 CREATE ROLE hidro_app_permisos_120 NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
END $$;
GRANT USAGE ON SCHEMA public TO hidro_app_permisos_120;
GRANT SELECT ON public.usuarios,public.suministros,public.recibos,public.pagos,public.incidencias,public.cortes_servicio,public.cortes_suministros,public.solicitudes_atencion,public.notificaciones,public.notificaciones_lecturas,public.usuario_2fa,public.usuario_2fa_recuperacion,public.desafios_2fa,public.operaciones_pago,public.operaciones_pago_historial,public.eventos_pago_proveedor,public.incidencia_eventos,public.incidencia_cambios TO hidro_app_permisos_120;
GRANT UPDATE (clave_hash,activo) ON public.usuarios TO hidro_app_permisos_120;
GRANT UPDATE (distrito,zona) ON public.suministros TO hidro_app_permisos_120;
GRANT INSERT,UPDATE ON public.recibos,public.incidencias,public.cortes_servicio,public.solicitudes_atencion,public.usuario_2fa,public.usuario_2fa_recuperacion,public.desafios_2fa,public.operaciones_pago TO hidro_app_permisos_120;
GRANT INSERT ON public.notificaciones,public.notificaciones_lecturas,public.operaciones_pago_historial,public.eventos_pago_proveedor,public.incidencia_cambios TO hidro_app_permisos_120;
GRANT USAGE ON SEQUENCE public.recibos_id_recibo_seq,public.incidencias_id_incidencia_seq,public.cortes_servicio_id_corte_seq,public.solicitudes_atencion_id_solicitud_seq,public.notificaciones_id_notificacion_seq,public.operaciones_pago_historial_id_seq TO hidro_app_permisos_120;
COMMIT;
