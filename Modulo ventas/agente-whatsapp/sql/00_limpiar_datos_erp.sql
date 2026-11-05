-- ============================================================================
-- 00_limpiar_datos_erp.sql
-- Vacía TODAS las tablas del ERP (deja la estructura intacta) para poder
-- recargar los datos desde cero sin duplicados.
--
-- CUÁNDO USAR: si un intento de carga de datos falló a medias y quieres
-- recargar limpio. NO borra las tablas, solo su contenido.
--
-- NO toca las 5 tablas del agente (agente_*, conversation_history) si aún no
-- se han creado; y si existen, tampoco pasa nada por dejarlas — este script
-- solo trunca tablas del ERP. Ajusta si quieres incluirlas.
--
-- Uso:  psql --dbname=$DB --file=00_limpiar_datos_erp.sql
-- ============================================================================

-- TRUNCATE masivo de todas las tablas del esquema public, EXCEPTO las del agente.
-- CASCADE resuelve dependencias; RESTART IDENTITY reinicia secuencias si las hubiera.
do $$
declare
  r record;
  tablas text := '';
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename not like 'agente_%'
      and tablename <> 'conversation_history'
  loop
    tablas := tablas || format('public.%I,', r.tablename);
  end loop;

  if length(tablas) > 0 then
    -- quitar la última coma
    tablas := left(tablas, length(tablas) - 1);
    execute 'truncate table ' || tablas || ' restart identity cascade';
    raise notice 'Tablas del ERP vaciadas correctamente.';
  else
    raise notice 'No se encontraron tablas del ERP para vaciar.';
  end if;
end $$;

-- Verificación rápida (debe dar 0 en las tablas núcleo):
select
  (select count(*) from movimientos_ventas) as movimientos,
  (select count(*) from clientes)           as clientes,
  (select count(*) from productos)          as productos;
