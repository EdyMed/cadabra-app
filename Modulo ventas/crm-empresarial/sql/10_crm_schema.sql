-- ============================================================================
-- 10_crm_schema.sql
-- CRM Empresarial WhatsApp (Cadabra) — negocio: PANADERÍA/PASTELERÍA MAYORISTA B2B
-- (mismo negocio del agente "Sofía": empanadas, pasteles, pan; vende al por mayor
--  a restaurantes, sushis y almacenes).
--
-- Crea la tabla `crm_leads` que alimenta el CRM (UI en NocoDB apuntando a este
-- mismo Postgres de Supabase) y el workflow n8n "Agente Whatsap CRM Empresarial".
--
-- Clona el patrón de 10_agente_schema.sql: extensión moddatetime SIN prefijo,
-- RLS force + deny-by-default (el agente entra con service_role = bypass),
-- índices, tenant por columna `empresa`.
--
-- CÓMO APLICAR: pegar completo en Supabase → SQL Editor → Run, o vía psql 15
-- por el pooler. Es idempotente (IF NOT EXISTS / DROP ... IF EXISTS).
--
-- Proyecto Supabase: cexowmypklxngbjsxryf (mismo del agente de ventas).
-- ============================================================================

begin;

-- Schema dedicado: aísla el CRM del ERP/agente (149 tablas en `public`). NocoDB
-- se conecta apuntando al schema `crm` y así solo ve la tabla del CRM.
create schema if not exists crm;

-- ----------------------------------------------------------------------------
-- crm_leads
--   Un lead/cliente mayorista por (empresa, contact_id). contact_id = wa_id de
--   WhatsApp (número que escribe), sirve para deduplicar. Refleja el embudo
--   comercial de venta mayorista + campos B2B (vendedor asignado, condición de
--   pago) + operativos para las guardas del Escenario 1 (bot_activo Chatwoot,
--   ultima_interaccion para expiración de sesión).
-- ----------------------------------------------------------------------------
create table if not exists crm.crm_leads (
  id                   uuid primary key default gen_random_uuid(),
  empresa              integer not null,            -- tenant (= ERP.empresa)

  -- Contacto (columnas base)
  nombre               text,                         -- persona de contacto
  nombre_negocio       text,                         -- razón social / local del cliente
  contact_id           text,                         -- wa_id de WhatsApp (dedup)
  phone                text,                         -- E.164, ej: 56912345678
  email                text,
  comuna               text,                         -- para ruteo de reparto

  -- Segmentación comercial
  origen_lead          text default 'whatsapp'
                         check (origen_lead in ('whatsapp','Link Directo','Referido','Feria','Otro')),
  producto_interes     text                          -- familia del catálogo real
                         check (producto_interes is null or producto_interes in
                           ('Empanadas','Pasteles','Pan','Sopaipillas','Mixto','Otro')),

  -- Embudo mayorista (estado_crm)
  estado_crm           text not null default 'Nuevo Lead'
                         check (estado_crm in (
                           'Nuevo Lead','En Conversación','Cotización Enviada',
                           'Primer Pedido','Cliente Activo','Cliente Recurrente',
                           'Sin Respuesta','Requiere Vendedor','Inactivo')),

  -- Campos B2B propios del negocio mayorista
  vendedor_asignado    text,                         -- reparte cartera (los 2 vendedores reales)
  condicion_pago       text
                         check (condicion_pago is null or condicion_pago in
                           ('Efectivo','Cheque','Crédito 7d')),

  -- Agendamiento (visita/reunión del vendedor — reutiliza el Calendar del agente)
  estado_agendamiento  text
                         check (estado_agendamiento is null or estado_agendamiento in
                           ('Pendiente','Confirmado','Cancelado')),
  fecha_agendamiento   date,
  hora_cita            time,

  -- Operativos (guardas Escenario 1 + Chatwoot)
  bot_activo           boolean not null default true,   -- false = humano/vendedor tomó la conversación
  ultima_interaccion   timestamptz,                     -- para expiración de sesión
  comercial_id         text,                            -- id interno de agente/vendedor en el flujo
  notas                text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- Un lead por número dentro de cada empresa (dedup del upsert crm_upsert_lead)
  unique (empresa, contact_id)
);

comment on table crm.crm_leads is
  'CRM de leads/clientes mayoristas (panadería B2B) por empresa. Alimentado por el workflow n8n "Agente Whatsap CRM Empresarial"; UI en NocoDB. Embudo comercial en estado_crm; bot_activo controla el handoff a Chatwoot/vendedor.';

-- ============================================================================
-- ÍNDICES
-- ============================================================================
create unique index if not exists uq_crm_leads_empresa_contact
  on crm.crm_leads (empresa, contact_id);

create index if not exists idx_crm_leads_estado
  on crm.crm_leads (empresa, estado_crm);

create index if not exists idx_crm_leads_fecha_agenda
  on crm.crm_leads (empresa, fecha_agendamiento);

create index if not exists idx_crm_leads_vendedor
  on crm.crm_leads (empresa, vendedor_asignado);

create index if not exists idx_crm_leads_phone
  on crm.crm_leads (empresa, phone);

-- ============================================================================
-- TRIGGER updated_at (mismo patrón que el ERP y el agente: moddatetime sin prefijo)
-- ============================================================================
create extension if not exists moddatetime;

drop trigger if exists trg_crm_leads_updated on crm.crm_leads;
create trigger trg_crm_leads_updated before update on crm.crm_leads
  for each row execute function moddatetime (updated_at);

-- ============================================================================
-- ROW LEVEL SECURITY (deny-by-default; service_role bypassa → n8n opera normal)
-- Mismo criterio que 10_agente_schema.sql. NocoDB debe conectar con un rol que
-- bypasee RLS o con políticas propias; se define en la config de NocoDB (ver CRM.md).
-- ============================================================================
alter table crm.crm_leads enable row level security;
alter table crm.crm_leads force  row level security;
-- (Sin políticas permisivas: RLS activo + 0 políticas = deniega a anon/authenticated.)

-- Permisos del schema: USAGE para los roles del pooler + operar la tabla.
-- (postgres/service_role ya bypassan RLS; NocoDB conecta con el rol del pooler.)
grant usage on schema crm to postgres, anon, authenticated, service_role;
grant all privileges on all tables in schema crm to postgres, service_role;
alter default privileges in schema crm grant all on tables to postgres, service_role;

commit;

-- ============================================================================
-- VERIFICACIÓN rápida (opcional):
--   select count(*) from crm.crm_leads;
--   select estado_crm, count(*) from crm.crm_leads where empresa=1 group by 1;
-- ============================================================================
