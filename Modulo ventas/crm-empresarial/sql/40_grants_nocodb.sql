-- ============================================================================
-- 40_grants_nocodb.sql
-- Permite que NocoDB (conectado por el pooler, que mapea a un rol de aplicación
-- como `authenticated`) pueda LEER y EDITAR crm.crm_leads.
--
-- Problema que resuelve: al mover la tabla a `crm`, conservó los grants viejos
-- donde anon/authenticated NO tenían SELECT → NocoDB conectaba pero veía
-- "No tables" / permission denied. Además la tabla tiene RLS force + deny-all
-- (0 policies), que bloquea a cualquier rol que no bypasee RLS.
--
-- Esta es la configuración para DEMO (un solo tenant, empresa=1). Para producción
-- multi-tenant, sustituir la policy `using (true)` por una que filtre por empresa.
--
-- Idempotente. Ejecutar por psql 15 vía pooler.
-- ============================================================================

begin;

-- 1) Permisos de tabla para los roles de aplicación de Supabase.
grant usage on schema crm to anon, authenticated, service_role;
grant select, insert, update, delete on crm.crm_leads to authenticated, service_role;
grant select on crm.crm_leads to anon;
-- Que las tablas futuras del schema hereden estos permisos:
alter default privileges in schema crm
  grant select, insert, update, delete on tables to authenticated, service_role;

-- 2) Política RLS permisiva para DEMO. Sin esto, RLS force + 0 policies deniega
--    incluso con los grants de arriba. `using (true)` = ve/edita todas las filas.
--    (Para producción: `using (empresa = <tenant>)` o vía claim del JWT.)
drop policy if exists crm_leads_app_all on crm.crm_leads;
create policy crm_leads_app_all
  on crm.crm_leads
  for all
  to authenticated, anon, service_role
  using (true)
  with check (true);

commit;

-- ============================================================================
-- VERIFICACIÓN:
--   set role authenticated; select count(*) from crm.crm_leads;  -- -> 17, sin error
--   reset role;
-- ============================================================================
