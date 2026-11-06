-- Requiere 003, 004, 006 y el rol hidro_app_permisos_120.
-- No crea usuarios LOGIN ni contraseñas, no activa el worker ni envía correo.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hidro_app_permisos_120' AND NOT rolcanlogin AND NOT rolsuper) THEN
  RAISE EXCEPTION 'Falta el rol de aplicación esperado';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hidro_correo_worker_permisos_120') THEN
  RAISE EXCEPTION 'El rol de correo ya existe; revisar privilegios antes de continuar';
 END IF;
 CREATE ROLE hidro_correo_worker_permisos_120 NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
END $$;
GRANT INSERT ON public.usuarios,public.suministros TO hidro_app_permisos_120;
GRANT USAGE ON SEQUENCE public.usuarios_id_usuario_seq,public.suministros_id_suministro_seq TO hidro_app_permisos_120;
GRANT SELECT,INSERT,UPDATE ON public.registros_correo_pendientes,public.correo_outbox TO hidro_app_permisos_120;
GRANT SELECT,INSERT ON public.registros_correo_envios TO hidro_app_permisos_120;
GRANT USAGE ON SCHEMA public TO hidro_correo_worker_permisos_120;
GRANT SELECT,UPDATE ON public.correo_outbox TO hidro_correo_worker_permisos_120;
GRANT SELECT (id,registro_id) ON public.registros_correo_envios TO hidro_correo_worker_permisos_120;
GRANT SELECT (id,correo,numero_suministro,invalidado,consumido_en,codigo_hash,intentos,vence_en) ON public.registros_correo_pendientes TO hidro_correo_worker_permisos_120;
GRANT UPDATE (codigo_vence_en) ON public.registros_correo_pendientes TO hidro_correo_worker_permisos_120;
COMMIT;
