-- ============================================================================
-- 30_fix_rls_agente.sql
-- Corrige la RLS de las 5 tablas del agente.
--
-- PROBLEMA: se activó `force row level security` con 0 políticas = deny-all
-- para TODOS los roles (incluido el usuario `postgres` del pooler que usa n8n).
-- Esto impide que el agente lea/escriba (ej. conversation_history quedaba vacía).
--
-- SOLUCIÓN: quitar el FORCE. Con RLS activo pero sin force, el DUEÑO de la tabla
-- (postgres) hace bypass y puede operar; anon/authenticated siguen bloqueados
-- (0 políticas permisivas) — que es justo lo que queremos: solo el backend accede.
--
-- Uso:  & $psql --dbname=$DB --file="$AGENT\30_fix_rls_agente.sql"
-- ============================================================================

alter table public.agente_lineas_whatsapp no force row level security;
alter table public.agente_contactos       no force row level security;
alter table public.conversation_history   no force row level security;
alter table public.agente_tool_log        no force row level security;
alter table public.agente_escalamientos   no force row level security;

-- Verificación: forced debe quedar en 'f' (false)
select relname,
       relrowsecurity      as rls,
       relforcerowsecurity as forced
from pg_class
where relname in ('agente_lineas_whatsapp','agente_contactos',
                  'conversation_history','agente_tool_log','agente_escalamientos')
order by relname;
