-- ============================================================
-- En el Postgres de NocoDB (base appcadabra), como usuario postgres.
-- 1) Agrega columna `empresa` a crm_leads (multi-tenant).
-- 2) Crea usuario de SOLO LECTURA `dash_ro` para la app.
-- Ejecutar en la consola psql de nocodb-db:  psql -U postgres -d appcadabra
-- ============================================================

-- 1) Columna empresa en los leads (default 1 = negocio demo actual)
ALTER TABLE p14vch8or5d3r3s.crm_leads
  ADD COLUMN IF NOT EXISTS empresa int NOT NULL DEFAULT 1;

-- (los 19 leads actuales quedan empresa=1 automáticamente)

-- 2) Usuario solo-lectura para la app (cambia la clave)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dash_ro') THEN
    CREATE ROLE dash_ro LOGIN PASSWORD 'motoco2026';
  END IF;
END$$;

GRANT CONNECT ON DATABASE appcadabra TO dash_ro;
GRANT USAGE ON SCHEMA p14vch8or5d3r3s TO dash_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA p14vch8or5d3r3s TO dash_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA p14vch8or5d3r3s GRANT SELECT ON TABLES TO dash_ro;

-- Verificación:
-- SELECT empresa, COUNT(*) FROM p14vch8or5d3r3s.crm_leads GROUP BY empresa;
