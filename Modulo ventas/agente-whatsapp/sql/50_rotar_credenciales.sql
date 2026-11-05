-- ============================================================================
-- 50_rotar_credenciales.sql
-- Rotación de credenciales antes de producción.
--
-- Cambia la contraseña del rol read-only del agente (`agente_readonly`),
-- que hoy tiene la contraseña temporal '123456' (insegura, quedó en scripts).
--
-- ANTES DE EJECUTAR:
--   1) Reemplaza <<<NUEVA_CLAVE_READONLY>>> por una contraseña fuerte nueva
--      (mín. 16 caracteres, sin comillas simples). Anótala en tu gestor.
--   2) Después de correr esto, actualiza la MISMA contraseña en la
--      credencial de n8n "Supabase Ventas (Read-Only)" (ver guía .md).
--
-- Uso (psql 15 en el equipo):
--   & "C:\Program Files\PostgreSQL\15\bin\psql.exe" `
--       --dbname="$DB" --file="...\sql\50_rotar_credenciales.sql"
--   (usar la connection string RW — Session pooler, puerto 5432 — porque
--    solo el owner postgres puede ALTER ROLE)
-- ============================================================================

-- 1) Cambiar la contraseña del rol read-only.
--    NO recreamos el rol: conserva sus grants y el BYPASSRLS ya aplicado
--    en 40_fix_readonly_bypassrls.sql (necesario por la RLS recursiva del ERP).
alter role agente_readonly with password '<<<NUEVA_CLAVE_READONLY>>>';

-- 2) Reafirmar los atributos correctos (idempotente; no hace daño si ya están).
alter role agente_readonly with login;
alter role agente_readonly set statement_timeout = '5s';
-- BYPASSRLS es imprescindible: sin él la tool no encuentra productos
-- (RLS recursiva sobre `usuarios`). Ver 40_fix_readonly_bypassrls.sql.
alter role agente_readonly with bypassrls;

-- 3) Verificación: el rol existe, puede login, y tiene bypassrls.
select rolname, rolcanlogin, rolbypassrls, rolconfig
  from pg_roles
  where rolname = 'agente_readonly';
