-- ============================================================================
-- 99_limpiar_pruebas.sql
-- Limpia los datos de prueba del historial de conversación (turnos guardados
-- durante las pruebas del bot, algunos con el bug de queryReplacement/coma).
-- Ejecutar cuando quieras empezar el historial desde cero.
--
-- Uso:  & $psql --dbname=$DB --file="$AGENT\99_limpiar_pruebas.sql"
-- ============================================================================

delete from public.conversation_history where empresa = 1;
delete from public.agente_tool_log where empresa = 1;

select 'conversation_history' as tabla, count(*) as filas from public.conversation_history where empresa = 1
union all
select 'agente_tool_log', count(*) from public.agente_tool_log where empresa = 1;
