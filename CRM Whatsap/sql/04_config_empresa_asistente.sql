-- ============================================================
-- Nombre del asistente por EMPRESA — Supabase cexowmypklxngbjsxryf
-- Ejecutar UNA vez en Supabase → SQL Editor (como postgres), DESPUÉS de 03.
--
-- Antes el nombre del asistente vivía solo en agente_lineas_whatsapp, que exige
-- phone_number_id: con Embedded Signup la empresa se crea SIN número (lo conecta
-- el cliente después) y el nombre no tenía dónde guardarse. Ahora se guarda por
-- empresa y el panel lo copia a la línea cuando el cliente conecta su WhatsApp
-- (n8n sigue leyendo agente_lineas_whatsapp.nombre_asistente, sin cambios).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agente_empresas_config (
  empresa          integer PRIMARY KEY,
  nombre_asistente text NOT NULL DEFAULT 'Sofía',
  actualizado_en   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agente_empresas_config ENABLE ROW LEVEL SECURITY;

-- Admin del panel (alta y edición de empresas): lee y escribe.
GRANT SELECT, INSERT, UPDATE ON public.agente_empresas_config TO dashboard_admin;
DROP POLICY IF EXISTS dashboard_admin_config ON public.agente_empresas_config;
CREATE POLICY dashboard_admin_config ON public.agente_empresas_config
  FOR ALL TO dashboard_admin USING (true) WITH CHECK (true);

-- Embedded Signup: solo lee el nombre para copiarlo a la línea nueva.
GRANT SELECT ON public.agente_empresas_config TO dashboard_whatsapp;
DROP POLICY IF EXISTS dashboard_whatsapp_config ON public.agente_empresas_config;
CREATE POLICY dashboard_whatsapp_config ON public.agente_empresas_config
  FOR SELECT TO dashboard_whatsapp USING (true);

-- Carga inicial: el nombre que ya tienen las empresas con línea (ej. Sofía, empresa 1).
INSERT INTO public.agente_empresas_config (empresa, nombre_asistente)
SELECT DISTINCT ON (empresa) empresa, nombre_asistente
  FROM public.agente_lineas_whatsapp
 WHERE nombre_asistente IS NOT NULL AND nombre_asistente <> ''
 ORDER BY empresa, activo DESC
ON CONFLICT (empresa) DO NOTHING;

-- Verificación:
-- SELECT * FROM public.agente_empresas_config ORDER BY empresa;
