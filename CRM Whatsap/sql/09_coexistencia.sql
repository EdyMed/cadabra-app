-- ============================================================
-- Coexistencia (WhatsApp Business app + Cloud API) — Supabase cexowmypklxngbjsxryf
-- Ejecutar UNA vez en Supabase → SQL Editor (como postgres), DESPUÉS de 08.
--
-- Decisiones (Edy, 03-11-2026, práctica de las plataformas profesionales):
--  · El dueño responde desde su celular → el bot se PAUSA en ese chat y vuelve solo a las 24 h
--    (o antes con el botón del panel).
--  · El historial de hasta 180 días que entrega Meta se IMPORTA una vez, marcado como histórico.
--  · Los contactos del celular van a un DIRECTORIO de nombres, no al CRM como leads.
-- ============================================================

-- 1) Cuenta conectada: modo y estado de las sincronizaciones (solo se pueden pedir una vez)
ALTER TABLE public.agente_whatsapp_cuentas
  ADD COLUMN IF NOT EXISTS modo text NOT NULL DEFAULT 'nuevo',          -- 'nuevo' | 'coexistencia'
  ADD COLUMN IF NOT EXISTS sync_contactos_en timestamptz,
  ADD COLUMN IF NOT EXISTS sync_historial_en timestamptz,
  ADD COLUMN IF NOT EXISTS sync_mensaje text;

-- 2) Historial importado: se distingue de las conversaciones atendidas por el agente
ALTER TABLE public.conversation_history
  ADD COLUMN IF NOT EXISTS importado boolean NOT NULL DEFAULT false;

-- 3) Pausas del bot por conversación (respuesta del dueño desde la app)
CREATE TABLE IF NOT EXISTS public.bot_pausas (
  empresa        integer NOT NULL,
  contact_id     text    NOT NULL,
  hasta          timestamptz NOT NULL,
  motivo         text,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, contact_id)
);
ALTER TABLE public.bot_pausas ENABLE ROW LEVEL SECURITY;
-- Panel: ver la pausa (Conversaciones) y quitarla al reactivar el bot con el botón
GRANT SELECT, DELETE ON public.bot_pausas TO dashboard_rw;
DROP POLICY IF EXISTS dashboard_rw_pausas ON public.bot_pausas;
CREATE POLICY dashboard_rw_pausas ON public.bot_pausas FOR ALL TO dashboard_rw USING (true) WITH CHECK (true);
GRANT SELECT ON public.bot_pausas TO dashboard_ro;
DROP POLICY IF EXISTS dashboard_ro_pausas ON public.bot_pausas;
CREATE POLICY dashboard_ro_pausas ON public.bot_pausas FOR SELECT TO dashboard_ro USING (true);

-- 4) Directorio de contactos del celular del negocio (nombres, NO leads)
CREATE TABLE IF NOT EXISTS public.whatsapp_contactos (
  empresa        integer NOT NULL,
  telefono       text    NOT NULL,
  nombre         text,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, telefono)
);
ALTER TABLE public.whatsapp_contactos ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.whatsapp_contactos TO dashboard_ro;
DROP POLICY IF EXISTS dashboard_ro_contactos ON public.whatsapp_contactos;
CREATE POLICY dashboard_ro_contactos ON public.whatsapp_contactos FOR SELECT TO dashboard_ro USING (true);

-- Verificación:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'agente_whatsapp_cuentas';
-- SELECT * FROM public.bot_pausas; SELECT count(*) FROM public.whatsapp_contactos;
