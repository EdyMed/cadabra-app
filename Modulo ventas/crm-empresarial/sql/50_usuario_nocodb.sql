-- ============================================================================
-- 50_usuario_nocodb.sql
-- Crea un usuario Postgres dedicado para NocoDB que SOLO ve el schema `crm`.
--
-- Por qué: al conectar NocoDB con el superusuario `postgres`, éste ve TODOS los
-- schemas y tablas (bypassa RLS), e ignora el filtro de schema → NocoDB traía las
-- 149 tablas del ERP. Un usuario restringido resuelve esto de raíz: sin acceso a
-- `public`, NocoDB solo puede inferir `crm.crm_leads`.
--
-- Contraseña temporal: CAMBIAR antes de producción (y rotar la del pooler general).
-- Idempotente. Ejecutar por psql 15 vía pooler (como postgres).
-- ============================================================================

begin;

-- 1) Rol de login (usuario) dedicado
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'nocodb_crm') then
    create role nocodb_crm login password 'CAMBIAR_CLAVE';
  end if;
end $$;

-- 2) Acceso SOLO al schema crm (NADA de public → NocoDB no verá el ERP)
grant usage on schema crm to nocodb_crm;
grant select, insert, update, delete on all tables in schema crm to nocodb_crm;
alter default privileges in schema crm
  grant select, insert, update, delete on tables to nocodb_crm;

-- 3) Que este rol pueda pasar el RLS de crm_leads: se apoya en la policy
--    permisiva `crm_leads_app_all` (creada en 40_grants_nocodb.sql) que aplica a
--    authenticated/anon/service_role. Extendemos esa policy a nocodb_crm.
drop policy if exists crm_leads_nocodb on crm.crm_leads;
create policy crm_leads_nocodb
  on crm.crm_leads
  for all
  to nocodb_crm
  using (true)
  with check (true);

-- 4) Timeout de seguridad (evita que una consulta pesada bloquee)
alter role nocodb_crm set statement_timeout = '15s';

-- 4b) search_path con `crm` primero: NocoDB (y otros clientes) detectan las tablas
--     por el search_path del rol, no solo por el campo "Schema name" de la conexión.
--     Sin esto, NocoDB conecta pero muestra "No tables".
alter role nocodb_crm set search_path = crm, public;

-- 5) NO tocar public: nocodb_crm nunca recibe USAGE en public, así que no puede
--    listar ni leer ninguna tabla del ERP/agente. (Defensa de raíz.)

commit;

-- ============================================================================
-- VERIFICACIÓN:
--   select has_schema_privilege('nocodb_crm','crm','USAGE');     -- t
--   select has_schema_privilege('nocodb_crm','public','USAGE');  -- f  (no ve el ERP)
--   set role nocodb_crm; select count(*) from crm.crm_leads; reset role;  -- 17
-- ============================================================================
