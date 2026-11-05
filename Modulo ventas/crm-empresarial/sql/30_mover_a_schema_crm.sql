-- ============================================================================
-- 30_mover_a_schema_crm.sql
-- Mueve public.crm_leads a un schema propio `crm` para aislar el CRM del ERP.
-- Así NocoDB (conectado al schema `crm`) muestra SOLO la tabla del CRM, no las
-- 149 tablas del ERP/agente que viven en `public`.
--
-- El trigger moddatetime y el RLS force+deny-by-default se conservan (se mueven
-- con la tabla / se re-aseguran aquí). El usuario del pooler (service_role/postgres)
-- ya bypassa RLS, así que sigue leyendo/escribiendo con normalidad.
--
-- Idempotente. Ejecutar vía psql 15 por el pooler.
-- ============================================================================

begin;

-- 1) Schema dedicado
create schema if not exists crm;

-- 2) Mover la tabla de public a crm (si aún está en public)
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='crm_leads') then
    alter table public.crm_leads set schema crm;
  end if;
end $$;

-- 3) Re-asegurar el trigger updated_at en su nueva ubicación
--    (moddatetime sin prefijo, mismo patrón del ERP/agente)
create extension if not exists moddatetime;
drop trigger if exists trg_crm_leads_updated on crm.crm_leads;
create trigger trg_crm_leads_updated before update on crm.crm_leads
  for each row execute function moddatetime (updated_at);

-- 4) Re-asegurar RLS (se conserva al mover, pero lo dejamos explícito)
alter table crm.crm_leads enable row level security;
alter table crm.crm_leads force  row level security;

-- 5) Permisos: que el rol del pooler pueda usar el schema y operar la tabla.
--    (postgres/service_role ya bypassa RLS; esto asegura USAGE del schema para
--     cualquier rol de aplicación que se conecte por el pooler.)
grant usage on schema crm to postgres, anon, authenticated, service_role;
grant all privileges on all tables in schema crm to postgres, service_role;
alter default privileges in schema crm grant all on tables to postgres, service_role;

commit;

-- ============================================================================
-- VERIFICACIÓN:
--   select table_schema from information_schema.tables where table_name='crm_leads';  -- -> crm
--   select count(*) from crm.crm_leads;                                               -- -> 17
-- ============================================================================
