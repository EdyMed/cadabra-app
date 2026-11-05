-- ============================================================================
-- 10_agente_schema.sql
-- Esquema del Agente IA WhatsApp para Ventas / E-commerce (Cadabra)
--
-- Crea las 5 tablas de soporte del agente, activa RLS (con bypass de
-- service_role, que es como se conecta n8n), define índices y un rol
-- Postgres read-only para la tool `sql_readonly`.
--
-- CÓMO APLICAR: pegar completo en Supabase → SQL Editor → Run.
-- Es idempotente: usa IF NOT EXISTS / DROP POLICY IF EXISTS, se puede
-- re-ejecutar sin romper nada.
--
-- NOTA DE SEGURIDAD: el ERP ya tiene RLS por `empresa` contra
-- public.usuarios via auth.uid(). El agente NO usa Supabase Auth: se
-- conecta con service_role (bypass de RLS). Por tanto el aislamiento
-- multi-tenant y los roles (owner/customer/anon) los garantiza la CAPA
-- DE APLICACIÓN: cada tool añade WHERE empresa = :empresa. El RLS de
-- estas tablas es defensa en profundidad para un futuro acceso vía Auth.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) agente_lineas_whatsapp
--    Mapea cada LÍNEA de WhatsApp (número que RECIBE, phone_number_id de Meta)
--    a su empresa/tenant. Es lo que permite saber a qué cliente pertenece un
--    mensaje entrante (Paso 1 de la identificación, §4.1 del CLAUDE.md).
-- ----------------------------------------------------------------------------
create table if not exists public.agente_lineas_whatsapp (
  phone_number_id   text primary key,            -- ID de la línea Meta que recibe
  empresa           integer not null,            -- tenant (= ERP.empresa)
  nombre_empresa    text,                        -- para el system prompt
  nombre_asistente  text,                        -- ej. "Sofía", personalizable
  activo            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.agente_lineas_whatsapp is
  'Mapea phone_number_id (línea WhatsApp que recibe) -> empresa/tenant. Resuelve a qué cliente pertenece cada mensaje.';

-- ----------------------------------------------------------------------------
-- 2) agente_contactos
--    Identidad y ROL de cada PERSONA (número que ESCRIBE) dentro de una empresa.
--    Paso 2 de la identificación. Un número no encontrado aquí => rol 'anon'.
-- ----------------------------------------------------------------------------
create table if not exists public.agente_contactos (
  id            uuid primary key default gen_random_uuid(),
  empresa       integer not null,                -- tenant (= ERP.empresa)
  phone_number  text not null,                   -- E.164 de quien escribe, ej: 56912345678
  rol           text not null default 'customer'
                  check (rol in ('owner','customer','staff')),
  rut_cliente   integer,                         -- enlaza a clientes.rut_cl si es customer
  nombre        text,
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (empresa, phone_number)
);

comment on table public.agente_contactos is
  'Rol por número que escribe, dentro de una empresa. owner=acceso total, customer=sus datos, staff=equipo. Un número ausente se trata como anon.';

-- ----------------------------------------------------------------------------
-- 3) conversation_history
--    Memoria de conversación por (empresa, phone_number).
-- ----------------------------------------------------------------------------
create table if not exists public.conversation_history (
  id            uuid primary key default gen_random_uuid(),
  empresa       integer not null,
  phone_number  text not null,
  role          text not null check (role in ('user','assistant','system','tool')),
  content       text not null,
  message_id    text,                            -- id de Meta, para de-duplicar
  created_at    timestamptz not null default now()
);

comment on table public.conversation_history is
  'Historial de mensajes por empresa+teléfono. Se recuperan los últimos 15-20 turnos como memoria del LLM.';

-- ----------------------------------------------------------------------------
-- 4) agente_tool_log
--    Auditoría de cada llamada a tool / SQL (depuración y confianza del cliente).
-- ----------------------------------------------------------------------------
create table if not exists public.agente_tool_log (
  id             uuid primary key default gen_random_uuid(),
  empresa        integer not null,
  phone_number   text not null,
  rol            text,
  tool           text not null,
  input_json     jsonb,
  sql_ejecutado  text,
  filas          integer,
  ok             boolean,
  error          text,
  created_at     timestamptz not null default now()
);

comment on table public.agente_tool_log is
  'Auditoría de cada invocación de herramienta del agente, incluido el SQL de sql_readonly.';

-- ----------------------------------------------------------------------------
-- 5) agente_escalamientos
--    Cola de escalamiento a humano.
-- ----------------------------------------------------------------------------
create table if not exists public.agente_escalamientos (
  id            uuid primary key default gen_random_uuid(),
  empresa       integer not null,
  phone_number  text not null,
  motivo        text,
  resumen       text,
  estado        text not null default 'pendiente'
                  check (estado in ('pendiente','atendido')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.agente_escalamientos is
  'Solicitudes de atención humana generadas por la tool escalar_humano.';

-- ============================================================================
-- ÍNDICES
-- ============================================================================
create index if not exists idx_lineas_empresa
  on public.agente_lineas_whatsapp (empresa);

create index if not exists idx_contactos_lookup
  on public.agente_contactos (empresa, phone_number);

create index if not exists idx_conv_phone_time
  on public.conversation_history (empresa, phone_number, created_at);

-- Para de-duplicar por message_id (idempotencia ante reintentos de Meta).
create unique index if not exists uq_conv_message_id
  on public.conversation_history (message_id)
  where message_id is not null;

create index if not exists idx_toollog_empresa_time
  on public.agente_tool_log (empresa, created_at);

create index if not exists idx_escal_estado
  on public.agente_escalamientos (empresa, estado, created_at);

-- ============================================================================
-- TRIGGER updated_at (reutiliza extensión moddatetime, ya usada por el ERP)
-- Se usa el MISMO patrón que 01_schema.sql: sin prefijo de esquema, para que
-- resuelva por search_path igual que los triggers del ERP.
-- ============================================================================
create extension if not exists moddatetime;

drop trigger if exists trg_lineas_updated on public.agente_lineas_whatsapp;
create trigger trg_lineas_updated before update on public.agente_lineas_whatsapp
  for each row execute function moddatetime (updated_at);

drop trigger if exists trg_contactos_updated on public.agente_contactos;
create trigger trg_contactos_updated before update on public.agente_contactos
  for each row execute function moddatetime (updated_at);

drop trigger if exists trg_escal_updated on public.agente_escalamientos;
create trigger trg_escal_updated before update on public.agente_escalamientos
  for each row execute function moddatetime (updated_at);

-- ============================================================================
-- ROW LEVEL SECURITY
-- Se activa en las 5 tablas y se DENIEGA todo acceso por defecto (sin políticas
-- permisivas para anon/authenticated). El agente se conecta con service_role,
-- que hace BYPASS de RLS, así que sigue funcionando con normalidad.
--
-- Efecto: nadie con la anon key o un usuario Auth normal puede leer/escribir
-- estas tablas desde el navegador; solo el backend (n8n, service_role) y el
-- SQL Editor (que corre como propietario). Es el modo más seguro para un
-- proyecto nuevo sin tabla `usuarios`.
--
-- Si en el futuro se añade Supabase Auth + una tabla de usuarios/tenant, aquí
-- se agregarán políticas por empresa (patrón: empresa = (select empresa from
-- public.usuarios where auth_user_id = auth.uid())).
-- ============================================================================
alter table public.agente_lineas_whatsapp enable row level security;
alter table public.agente_contactos       enable row level security;
alter table public.conversation_history   enable row level security;
alter table public.agente_tool_log        enable row level security;
alter table public.agente_escalamientos   enable row level security;

-- Forzar RLS también para el owner de las tablas (defensa extra; service_role
-- sigue haciendo bypass porque es superusuario del proyecto).
alter table public.agente_lineas_whatsapp force row level security;
alter table public.agente_contactos       force row level security;
alter table public.conversation_history   force row level security;
alter table public.agente_tool_log        force row level security;
alter table public.agente_escalamientos   force row level security;

-- (Sin políticas permisivas: RLS activo + 0 políticas = deniega a anon/authenticated.
--  service_role bypassa RLS y opera con normalidad.)

commit;

-- ============================================================================
-- ROL POSTGRES READ-ONLY  (para la tool sql_readonly, §6.9 del CLAUDE.md)
-- Ejecutar por separado si tu editor no permite CREATE ROLE dentro de la txn.
-- Cambia la contraseña antes de usar.
--
-- Este rol solo puede SELECT. n8n usará este rol (DSN aparte,
-- SUPABASE_READONLY_DSN) SOLO para la tool sql_readonly, nunca para escribir.
-- ============================================================================
-- do $$
-- begin
--   if not exists (select 1 from pg_roles where rolname = 'agente_readonly') then
--     create role agente_readonly login password 'CAMBIA_ESTA_CLAVE';
--   end if;
-- end $$;
--
-- grant usage on schema public to agente_readonly;
-- grant select on all tables in schema public to agente_readonly;
-- alter default privileges in schema public grant select on tables to agente_readonly;
-- -- Timeout corto para que una consulta pesada no bloquee (5 s):
-- alter role agente_readonly set statement_timeout = '5s';
-- -- Asegurar que NO pueda escribir:
-- revoke insert, update, delete, truncate on all tables in schema public from agente_readonly;

-- ============================================================================
-- SEEDS (descomentar y ajustar con tus valores reales)
-- ============================================================================
-- 1) Tu línea de WhatsApp -> empresa (reemplaza el phone_number_id de Meta y la empresa):
-- insert into public.agente_lineas_whatsapp (phone_number_id, empresa, nombre_empresa, nombre_asistente)
-- values ('109XXXXXXXXXXX', 1, 'Mi Empresa Demo', 'Sofía')
-- on conflict (phone_number_id) do update
--   set empresa = excluded.empresa,
--       nombre_empresa = excluded.nombre_empresa,
--       nombre_asistente = excluded.nombre_asistente;

-- 2) Tu número como owner (reemplaza el teléfono E.164 y la empresa):
-- insert into public.agente_contactos (empresa, phone_number, rol, nombre)
-- values (1, '56912345678', 'owner', 'Edgardo')
-- on conflict (empresa, phone_number) do update
--   set rol = excluded.rol, nombre = excluded.nombre;

-- ============================================================================
-- VERIFICACIÓN rápida (opcional, ejecutar después):
-- select table_name from information_schema.tables
--   where table_schema='public' and table_name like 'agente_%' or table_name='conversation_history';
-- ============================================================================
