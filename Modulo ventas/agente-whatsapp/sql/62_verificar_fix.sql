-- 62_verificar_fix.sql — verifica la query NUEVA (palabra completa \y) antes de deployar.
-- Debe: (A) 'pan' → solo panes reales; (B) 'pino' → solo pinos; (C) 'mariscos' → mariscos.

\echo '=== (A) busqueda = pan  (esperado: familia PAN, NO empanadas) ==='
with q as (select array_remove(string_to_array(lower(trim('pan')),' '),'') as palabras)
select p.nombre, p.precio_venta, f.nombre as familia
from public.productos p
left join public.familias f on f.codigo = p.cod_familia and f.empresa = p.empresa, q
where p.empresa = 1 and p.estado_vigencia = 1 and (
  p.codigo = 'pan' or ( array_length(q.palabras,1) is not null and not exists (
    select 1 from unnest(q.palabras) w
    where w not in ('empanada','empanadas','de','al','la','el','los','las','horno','frita','fritas','hoja','y','con')
      and lower(p.nombre) !~ ('\y'||w||'\y')
      and coalesce(lower(f.nombre),'') !~ ('\y'||w||'\y') ) ))
order by p.nombre limit 40;

\echo ''
\echo '=== (B) busqueda = pino  (control: debe seguir trayendo pinos) ==='
with q as (select array_remove(string_to_array(lower(trim('pino')),' '),'') as palabras)
select p.nombre, p.precio_venta
from public.productos p
left join public.familias f on f.codigo = p.cod_familia and f.empresa = p.empresa, q
where p.empresa = 1 and p.estado_vigencia = 1 and (
  p.codigo = 'pino' or ( array_length(q.palabras,1) is not null and not exists (
    select 1 from unnest(q.palabras) w
    where w not in ('empanada','empanadas','de','al','la','el','los','las','horno','frita','fritas','hoja','y','con')
      and lower(p.nombre) !~ ('\y'||w||'\y')
      and coalesce(lower(f.nombre),'') !~ ('\y'||w||'\y') ) ))
order by p.nombre limit 40;

\echo ''
\echo '=== (C) busqueda = sopaipillas  (esperado: familia SOPAIPILLAS) ==='
with q as (select array_remove(string_to_array(lower(trim('sopaipillas')),' '),'') as palabras)
select p.nombre, p.precio_venta, f.nombre as familia
from public.productos p
left join public.familias f on f.codigo = p.cod_familia and f.empresa = p.empresa, q
where p.empresa = 1 and p.estado_vigencia = 1 and (
  p.codigo = 'sopaipillas' or ( array_length(q.palabras,1) is not null and not exists (
    select 1 from unnest(q.palabras) w
    where w not in ('empanada','empanadas','de','al','la','el','los','las','horno','frita','fritas','hoja','y','con')
      and lower(p.nombre) !~ ('\y'||w||'\y')
      and coalesce(lower(f.nombre),'') !~ ('\y'||w||'\y') ) ))
order by p.nombre limit 40;
