-- ============================================================================
-- 20_seeds_y_readonly.sql
-- Paso A: rol read-only + seeds iniciales del agente.
--
-- ANTES DE EJECUTAR, reemplaza los PLACEHOLDERS marcados con <<< ... >>>:
--   1) <<<CLAVE_READONLY>>>      contraseña para el rol de solo lectura
--   2) <<<PHONE_NUMBER_ID>>>     ID de tu línea de WhatsApp en Meta (API Setup)
--   3) <<<TU_NUMERO_E164>>>      tu teléfono en formato E.164 sin '+' (ej: 56912345678)
--
-- Tenant confirmado: empresa = 1
--
-- Uso:  & $psql --dbname=$DB --file="$AGENT\20_seeds_y_readonly.sql"
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) ROL READ-ONLY  (para la tool sql_readonly del agente)
--    Solo puede SELECT. n8n usará este rol para consultas libres del LLM,
--    de modo que nunca pueda escribir/borrar aunque genere SQL peligroso.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'agente_readonly') then
    create role agente_readonly login password '123456';
  end if;
end $$;

grant usage on schema public to agente_readonly;
grant select on all tables in schema public to agente_readonly;
alter default privileges in schema public grant select on tables to agente_readonly;

-- Asegurar que NO pueda escribir en nada:
revoke insert, update, delete, truncate
  on all tables in schema public from agente_readonly;

-- Timeout corto: una consulta pesada del LLM no debe colgar la base (5 s).
alter role agente_readonly set statement_timeout = '5s';


-- ----------------------------------------------------------------------------
-- 2) SEED: línea de WhatsApp -> empresa (tenant)
--    Permite que el agente sepa a qué empresa pertenece cada mensaje entrante.
-- ----------------------------------------------------------------------------
insert into public.agente_lineas_whatsapp
  (phone_number_id, empresa, nombre_empresa, nombre_asistente)
values
  ('1168256669712210', 1, 'Cadabra Demo', 'Sofía')
on conflict (phone_number_id) do update
  set empresa          = excluded.empresa,
      nombre_empresa   = excluded.nombre_empresa,
      nombre_asistente = excluded.nombre_asistente;


-- ----------------------------------------------------------------------------
-- 3) SEED: tu número como OWNER (acceso total para probar el bot)
-- ----------------------------------------------------------------------------
insert into public.agente_contactos
  (empresa, phone_number, rol, nombre)
values
  (1, '56995649108', 'owner', 'Edgardo')
on conflict (empresa, phone_number) do update
  set rol    = excluded.rol,
      nombre = excluded.nombre;


-- ----------------------------------------------------------------------------
-- 4) VERIFICACIÓN
-- ----------------------------------------------------------------------------
select 'linea' as tipo, phone_number_id as dato, empresa, nombre_asistente as extra
  from public.agente_lineas_whatsapp
union all
select 'contacto', phone_number, empresa, rol
  from public.agente_contactos;

-- Confirmar el rol read-only:
select rolname, rolcanlogin
  from pg_roles
  where rolname = 'agente_readonly';
