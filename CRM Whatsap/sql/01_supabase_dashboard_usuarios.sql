-- ============================================================
-- Multi-tenant: mapeo usuario (Supabase Auth) -> empresa
-- Ejecutar en Supabase (SQL Editor). Idempotente.
-- ============================================================

create table if not exists public.dashboard_usuarios (
  auth_user_id  uuid primary key references auth.users(id) on delete cascade,
  empresa       int  not null,
  nombre_empresa text not null,
  created_at    timestamptz not null default now()
);

-- RLS: cada usuario solo ve su propia fila de mapeo.
alter table public.dashboard_usuarios enable row level security;

drop policy if exists "usuario ve su mapeo" on public.dashboard_usuarios;
create policy "usuario ve su mapeo"
  on public.dashboard_usuarios
  for select
  using (auth.uid() = auth_user_id);

-- ------------------------------------------------------------
-- SEED (ejecutar DESPUÉS de crear el usuario en Auth):
-- 1) Crea el usuario en Supabase -> Authentication -> Add user (email + password).
-- 2) Copia su UUID y reemplaza abajo. empresa=1 = negocio demo (panadería).
-- ------------------------------------------------------------
-- insert into public.dashboard_usuarios (auth_user_id, empresa, nombre_empresa)
-- values ('PEGA_EL_UUID_DEL_USUARIO', 1, 'Panadería Demo')
-- on conflict (auth_user_id) do update
--   set empresa = excluded.empresa, nombre_empresa = excluded.nombre_empresa;
