-- ============================================================================
-- 10_metricas_valor.sql  (05-11-2026) — Fase 1 del plan de mejoras: métricas de resultado
--
-- Solo AGREGA (no modifica datos existentes):
--   1. conversation_history.recibido_at  -> hora real en que Meta recibió el mensaje del cliente
--      (la escribe el nodo "Guardar turno" de n8n desde el timestamp del webhook).
--   2. crm.lead_eventos + trigger        -> historial de cambios de estado_crm / bot_activo de cada lead.
--   3. crm.metricas_valor(empresa, desde, hasta) -> JSON con las métricas de valor (Panel + informe mensual).
--
-- Configurable por empresa en agente_empresas_config.config->'metricas':
--   { "horario": { "dias": [1,2,3,4,5], "inicio": "09:00", "fin": "18:00" },   -- 0 = domingo
--     "minutos_por_conversacion": 5 }
-- Idempotente: se puede correr varias veces.
-- ============================================================================

-- 1. Hora de llegada del mensaje -------------------------------------------------
alter table public.conversation_history add column if not exists recibido_at timestamptz;
comment on column public.conversation_history.recibido_at is
  'Hora en que Meta recibió el mensaje del cliente (timestamp del webhook). NULL en filas anteriores al 05-11-2026 y en filas del bot/vendedor.';

-- 2. Historial de estados del lead ----------------------------------------------
create table if not exists crm.lead_eventos (
  id                  bigserial primary key,
  empresa             integer     not null,
  lead_id             integer     not null,
  contact_id          bigint,
  estado_anterior     text,
  estado_nuevo        text,
  bot_activo_anterior boolean,
  bot_activo_nuevo    boolean,
  creado_at           timestamptz not null default now()
);
create index if not exists idx_lead_eventos_emp_fecha on crm.lead_eventos (empresa, creado_at);
create index if not exists idx_lead_eventos_contacto  on crm.lead_eventos (empresa, contact_id, creado_at);

create or replace function crm.registrar_lead_evento() returns trigger
language plpgsql security definer set search_path = crm, public as $$
begin
  if tg_op = 'INSERT' then
    insert into crm.lead_eventos (empresa, lead_id, contact_id, estado_anterior, estado_nuevo, bot_activo_anterior, bot_activo_nuevo)
    values (new.empresa, new.id, new.contact_id, null, new.estado_crm, null, new.bot_activo);
  elsif new.estado_crm is distinct from old.estado_crm or new.bot_activo is distinct from old.bot_activo then
    insert into crm.lead_eventos (empresa, lead_id, contact_id, estado_anterior, estado_nuevo, bot_activo_anterior, bot_activo_nuevo)
    values (new.empresa, new.id, new.contact_id, old.estado_crm, new.estado_crm, old.bot_activo, new.bot_activo);
  end if;
  return new;
end $$;

drop trigger if exists trg_lead_eventos on crm.crm_leads;
create trigger trg_lead_eventos after insert or update of estado_crm, bot_activo on crm.crm_leads
  for each row execute function crm.registrar_lead_evento();

-- 3. Métricas de valor ------------------------------------------------------------
create or replace function crm.metricas_valor(p_empresa integer, p_desde timestamptz, p_hasta timestamptz)
returns jsonb language plpgsql stable security definer set search_path = crm, public as $$
declare
  tz      constant text := 'America/Santiago';
  cfg     jsonb;
  dias    int[];
  h_ini   time;
  h_fin   time;
  min_conv numeric;
  r       jsonb;
begin
  select coalesce(config->'metricas', '{}'::jsonb) into cfg from public.agente_empresas_config where empresa = p_empresa;
  cfg      := coalesce(cfg, '{}'::jsonb);
  dias     := coalesce((select array_agg(x::int) from jsonb_array_elements_text(cfg->'horario'->'dias') x), array[1,2,3,4,5]);
  h_ini    := coalesce((cfg->'horario'->>'inicio')::time, '09:00');
  h_fin    := coalesce((cfg->'horario'->>'fin')::time, '18:00');
  min_conv := coalesce((cfg->>'minutos_por_conversacion')::numeric, 5);

  with
  msgs as (                       -- mensajes de clientes del período (sin historial importado por coexistencia)
    select phone_number, coalesce(recibido_at, created_at) as t, recibido_at, created_at
      from public.conversation_history
     where empresa = p_empresa and role = 'user' and importado is not true
       and coalesce(recibido_at, created_at) >= p_desde and coalesce(recibido_at, created_at) < p_hasta
  ),
  conv as (                       -- 1 conversación = 1 contacto en 1 día (hora Chile)
    select phone_number, (t at time zone tz)::date as dia,
           bool_or(not (extract(dow from t at time zone tz)::int = any(dias)
                        and (t at time zone tz)::time >= h_ini and (t at time zone tz)::time < h_fin)) as fuera_horario
      from msgs group by 1, 2
  ),
  humano as (                     -- conversaciones donde intervino una persona (mensaje de vendedor o derivación)
    select c.phone_number, c.dia from conv c
     where exists (select 1 from public.conversation_history v
                    where v.empresa = p_empresa and v.role = 'vendedor' and v.phone_number = c.phone_number
                      and (v.created_at at time zone tz)::date = c.dia)
        or exists (select 1 from crm.lead_eventos e
                    where e.empresa = p_empresa and e.contact_id::text = c.phone_number
                      and (e.creado_at at time zone tz)::date = c.dia
                      and (e.estado_nuevo = 'Requiere Vendedor' and e.estado_anterior is distinct from 'Requiere Vendedor'
                           or e.bot_activo_nuevo = false and e.bot_activo_anterior is distinct from false))
  ),
  resp as (                       -- tiempo de respuesta: llegada del mensaje -> respuesta del bot (misma inserción)
    select extract(epoch from (a.created_at - u.recibido_at)) as seg
      from public.conversation_history u
      join public.conversation_history a
        on a.empresa = u.empresa and a.phone_number = u.phone_number and a.role = 'assistant' and a.created_at = u.created_at
     where u.empresa = p_empresa and u.role = 'user' and u.recibido_at is not null
       and u.recibido_at >= p_desde and u.recibido_at < p_hasta
       and a.created_at >= u.recibido_at and a.created_at - u.recibido_at < interval '1 hour'
  ),
  deriv as (                      -- derivaciones a vendedor del período y primera respuesta del vendedor desde el CRM
    select e.creado_at,
           (select min(v.created_at) from public.conversation_history v
             where v.empresa = p_empresa and v.role = 'vendedor' and v.phone_number = e.contact_id::text
               and v.created_at >= e.creado_at and v.created_at < e.creado_at + interval '7 days') as tomado_at
      from crm.lead_eventos e
     where e.empresa = p_empresa and e.estado_nuevo = 'Requiere Vendedor'
       and e.estado_anterior is distinct from 'Requiere Vendedor'
       and e.creado_at >= p_desde and e.creado_at < p_hasta
  )
  select jsonb_build_object(
    'conversaciones',          (select count(*) from conv),
    'con_humano',              (select count(*) from humano),
    'resueltas_ia',            (select count(*) from conv) - (select count(*) from humano),
    'fuera_horario',           (select count(*) from conv where fuera_horario),
    'mensajes_clientes',       (select count(*) from msgs),
    'horas_liberadas',         round(((select count(*) from conv) - (select count(*) from humano)) * min_conv / 60.0, 1),
    'minutos_por_conversacion', min_conv,
    'respuesta_mediana_seg',   (select round(percentile_cont(0.5) within group (order by seg)::numeric, 0) from resp),
    'respuesta_bajo_1min_pct', (select round(100.0 * avg((seg < 60)::int), 0) from resp),
    'respuestas_medidas',      (select count(*) from resp),
    'derivaciones',            (select count(*) from deriv),
    'derivaciones_tomadas',    (select count(*) from deriv where tomado_at is not null),
    'toma_vendedor_mediana_min', (select round(percentile_cont(0.5) within group (order by extract(epoch from tomado_at - creado_at) / 60)::numeric, 0)
                                    from deriv where tomado_at is not null),
    'medicion_desde',          (select min(recibido_at) from public.conversation_history where empresa = p_empresa),
    'horario',                 jsonb_build_object('dias', to_jsonb(dias), 'inicio', to_char(h_ini, 'HH24:MI'), 'fin', to_char(h_fin, 'HH24:MI'))
  ) into r;
  return r;
end $$;

revoke all on function crm.metricas_valor(integer, timestamptz, timestamptz) from public;
grant execute on function crm.metricas_valor(integer, timestamptz, timestamptz) to dashboard_ro, dashboard_admin;
grant usage on schema crm to dashboard_ro;
grant select on crm.lead_eventos to dashboard_ro, dashboard_admin;

-- Prueba rápida (mes actual, empresa 1):
-- select crm.metricas_valor(1, date_trunc('month', now() at time zone 'America/Santiago') at time zone 'America/Santiago', now());
