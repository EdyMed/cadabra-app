-- 61_diag_pan_query.sql — solo la query real de la tool con busqueda = 'pan'.
-- Muestra cuántas filas y cuáles (con su familia) para ver si mezcla empanadas.

with q as (
  select array_remove(string_to_array(lower(trim('pan')), ' '), '') as palabras
)
select p.nombre, p.precio_venta, f.nombre as familia
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
order by f.nombre, p.nombre
limit 40;
