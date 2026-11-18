-- Exclusivo para la instancia efímera del laboratorio. No ejecutar en otro destino.
DO $$
DECLARE domain text;
BEGIN
 IF current_database() <> 'hm_micro_lab' OR current_user <> 'hm_fixture' THEN
  RAISE EXCEPTION 'Destino de roles de fixture no válido';
 END IF;
 FOREACH domain IN ARRAY ARRAY['auth','billing','operations','notifications','realtime'] LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hm_'||domain) THEN
   EXECUTE format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS PASSWORD %L',
      'hm_'||domain, 'fixture-only-not-production');
  END IF;
 END LOOP;
END;
$$;
ALTER ROLE hm_auth IN DATABASE hm_micro_lab SET search_path=hm_reporting,public;
ALTER ROLE hm_billing IN DATABASE hm_micro_lab SET search_path=hm_identity,public;
ALTER ROLE hm_operations IN DATABASE hm_micro_lab SET search_path=hm_identity,public;
ALTER ROLE hm_notifications IN DATABASE hm_micro_lab SET search_path=hm_identity,hm_projection,public;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
