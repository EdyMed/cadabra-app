-- ============================================================================
-- 40_fix_readonly_bypassrls.sql
-- Permite que el rol `agente_readonly` LEA los datos del ERP sin trabarse con
-- las políticas RLS del ERP (que están diseñadas para usuarios de Supabase Auth,
-- que el agente NO usa).
--
-- PROBLEMA DETECTADO: la tool `stock_producto` (que usa agente_readonly) devolvía
-- 0 productos → el bot "no encontraba" empanadas. Causa: la política RLS de la
-- tabla `usuarios` es RECURSIVA (consulta `usuarios` dentro de su propia política),
-- y `productos`/`productos_bodega` referencian esa política vía `usuarios`. Al leer
-- con agente_readonly (que NO hace bypass), Postgres lanza:
--   "infinite recursion detected in policy for relation usuarios"
-- y la consulta falla silenciosamente → 0 filas.
--
-- SOLUCIÓN: dar BYPASSRLS al rol read-only. Es SEGURO porque el rol solo puede
-- SELECT (no INSERT/UPDATE/DELETE). Así el agente lee el catálogo/ventas sin pasar
-- por el RLS pensado para otro modelo de acceso (Supabase Auth).
--
-- Requiere permisos de superusuario/owner (usuario `postgres`).
-- Uso:  & $psql --dbname=$DB --file="$AGENT\40_fix_readonly_bypassrls.sql"
-- ============================================================================

alter role agente_readonly bypassrls;

-- Verificación: rolbypassrls debe quedar en 't'
select rolname, rolbypassrls, rolcanlogin
from pg_roles
where rolname = 'agente_readonly';
