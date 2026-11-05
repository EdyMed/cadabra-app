-- ============================================================================
-- 60_diag_familias.sql
-- Diagnóstico: por qué la búsqueda de "pan" no encuentra productos.
-- Solo SELECTs, no modifica nada. Ejecutar con psql (connection RW o RO).
--
-- Uso:
--   & "C:\Program Files\PostgreSQL\15\bin\psql.exe" `
--       --dbname="$DB" --file="...\sql\60_diag_familias.sql"
-- ============================================================================

\echo '=== 1) Familias existentes (nombre exacto, empresa 1) ==='
select codigo, nombre, empresa
from public.familias
where empresa = 1
order by codigo;

\echo ''
\echo '=== 2) ¿Cuántos productos vigentes hay por familia? (empresa 1) ==='
select f.codigo as cod_familia, f.nombre as familia,
       count(*) filter (where p.estado_vigencia = 1) as vigentes,
       count(*) as total
from public.familias f
left join public.productos p
       on p.cod_familia = f.codigo and p.empresa = f.empresa
where f.empresa = 1
group by f.codigo, f.nombre
order by f.nombre;

\echo ''
\echo '=== 3) Productos cuya familia contiene "pan" (case-insensitive) ==='
select p.nombre, p.precio_venta, p.estado_vigencia, f.nombre as familia
from public.productos p
join public.familias f on f.codigo = p.cod_familia and f.empresa = p.empresa
where p.empresa = 1
  and lower(f.nombre) like '%pan%'
order by p.nombre
limit 30;

\echo ''
\echo '=== 4) Reproducir EXACTAMENTE la query de la tool con busqueda = pan ==='
with q as (
  select array_remove(string_to_array(lower(trim('pan')), ' '), '') as palabras
)
select distinct p.nombre, p.precio_venta
from public.productos p
left join public.familias f on f.codigo = p.cod_familia and f.empresa = p.empresa,
  q
where p.empresa = 1
  and p.estado_vigencia = 1
  and (
    p.codigo = 'pan'
    or ( array_length(q.palabras,1) is not null
         and not exists (
           select 1 from unnest(q.palabras) w
           where w not in ('empanada','empanadas','de','al','la','el','los','las','horno','frita','fritas','hoja','y','con')
             and lower(p.nombre) not like '%'||w||'%'
             and coalesce(lower(f.nombre),'') not like '%'||w||'%'
         )
       )
  )
order by p.nombre
limit 12;
