-- ============================================================
-- Embedded Signup ("Conectar WhatsApp") — Supabase cexowmypklxngbjsxryf
-- Ejecutar UNA vez en Supabase → SQL Editor (como postgres).
--
-- 1) Tabla agente_whatsapp_cuentas: la cuenta de WhatsApp Business (WABA) que
--    cada empresa conectó, con su token de Meta CIFRADO (AES-256-GCM, la llave
--    vive solo en el servidor del panel: META_TOKEN_KEY).
-- 2) Rol dashboard_whatsapp: lo usa SOLO la ruta /api/whatsapp/*. Puede leer y
--    escribir esa tabla y las líneas que n8n usa para enrutar mensajes; nada más
--    (no ve leads, conversaciones ni usuarios).
-- ============================================================

-- 1) Tabla
CREATE TABLE IF NOT EXISTS public.agente_whatsapp_cuentas (
  empresa             integer PRIMARY KEY,
  waba_id             text NOT NULL,
  business_id         text,
  phone_number_id     text,
  display_phone       text,
  verified_name       text,
  token_cifrado       text,          -- token de integración del negocio (cifrado)
  pin_cifrado         text,          -- PIN de verificación en 2 pasos del número (cifrado)
  system_user_asignado boolean NOT NULL DEFAULT false, -- usuario del sistema de Cadabra con acceso a la WABA
  estado              text NOT NULL DEFAULT 'conectado',
  ultimo_error        text,
  conectado_por       uuid,
  conectado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agente_whatsapp_cuentas ENABLE ROW LEVEL SECURITY;
-- Sin políticas para anon/authenticated: desde el navegador NADIE la lee.

-- 2) Rol de la app
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dashboard_whatsapp') THEN
    CREATE ROLE dashboard_whatsapp LOGIN PASSWORD 'Kw7WfmwkYLtWc4_wYumxRhYvr4ttC-62';
  END IF;
END$$;

GRANT USAGE ON SCHEMA public TO dashboard_whatsapp;

GRANT SELECT, INSERT, UPDATE ON public.agente_whatsapp_cuentas TO dashboard_whatsapp;
DROP POLICY IF EXISTS dashboard_whatsapp_all ON public.agente_whatsapp_cuentas;
CREATE POLICY dashboard_whatsapp_all ON public.agente_whatsapp_cuentas
  FOR ALL TO dashboard_whatsapp USING (true) WITH CHECK (true);

-- Líneas que n8n usa para saber de qué empresa es cada número (phone_number_id).
-- SELECT es necesario por el ON CONFLICT y el WHERE de los UPDATE.
GRANT SELECT, INSERT, UPDATE ON public.agente_lineas_whatsapp TO dashboard_whatsapp;
DROP POLICY IF EXISTS dashboard_whatsapp_lineas ON public.agente_lineas_whatsapp;
CREATE POLICY dashboard_whatsapp_lineas ON public.agente_lineas_whatsapp
  FOR ALL TO dashboard_whatsapp USING (true) WITH CHECK (true);

-- Verificación (debe devolver 1 fila con las columnas, 0 registros):
-- SELECT * FROM public.agente_whatsapp_cuentas;
