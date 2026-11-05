-- ============================================================
-- Catálogo por empresa (conectores de datos) — Supabase cexowmypklxngbjsxryf
-- Ejecutar UNA vez en Supabase → SQL Editor (como postgres), DESPUÉS de 06.
--
-- Para empresas SIN ERP: su catálogo vive aquí. n8n lo llena desde la fuente que
-- indique la ficha (config.fuentes.catalogo.tipo):
--   'erp_supabase'  → NO usa esta tabla (lee public.productos, como la panadería)
--   'google_sheets' → workflow "Sync catálogo" copia la planilla del cliente aquí
--   'tabla_cadabra' → Cadabra la carga a mano (CSV, PDF corto, etc.)
-- El bot (herramienta stock_producto) busca en la fuente que corresponda.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.catalogo_productos (
  id             bigserial PRIMARY KEY,
  empresa        integer NOT NULL,
  codigo         text    NOT NULL,          -- clave del producto en la fuente del cliente
  nombre         text    NOT NULL,
  categoria      text,
  descripcion    text,
  precio         numeric(14,2),
  unidad         text,                      -- unidad, docena, kg, servicio…
  disponible     boolean NOT NULL DEFAULT true,
  fuente         text    NOT NULL DEFAULT 'tabla_cadabra',
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_catalogo_empresa_codigo UNIQUE (empresa, codigo)
);
CREATE INDEX IF NOT EXISTS idx_catalogo_empresa ON public.catalogo_productos (empresa);
ALTER TABLE public.catalogo_productos ENABLE ROW LEVEL SECURITY;

-- Registro de cada sincronización (para saber cuándo y cómo corrió).
CREATE TABLE IF NOT EXISTS public.catalogo_sync (
  id          bigserial PRIMARY KEY,
  empresa     integer NOT NULL,
  fuente      text    NOT NULL,
  ok          boolean NOT NULL,
  filas       integer,
  mensaje     text,
  ejecutado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_catalogo_sync_empresa ON public.catalogo_sync (empresa, ejecutado_en DESC);
ALTER TABLE public.catalogo_sync ENABLE ROW LEVEL SECURITY;

-- Lectura para el panel (rol del Embedded Signup / configuración), sin escritura.
GRANT SELECT ON public.catalogo_productos, public.catalogo_sync TO dashboard_whatsapp;
DROP POLICY IF EXISTS dashboard_whatsapp_catalogo ON public.catalogo_productos;
CREATE POLICY dashboard_whatsapp_catalogo ON public.catalogo_productos FOR SELECT TO dashboard_whatsapp USING (true);
DROP POLICY IF EXISTS dashboard_whatsapp_catalogo_sync ON public.catalogo_sync;
CREATE POLICY dashboard_whatsapp_catalogo_sync ON public.catalogo_sync FOR SELECT TO dashboard_whatsapp USING (true);

-- La herramienta stock_producto del bot usa la credencial "Supabase Ventas (Read-Only)"
-- = rol agente_readonly (bypass RLS): solo necesita el permiso de lectura.
GRANT SELECT ON public.catalogo_productos TO agente_readonly;

-- La ficha de Sofía declara explícitamente que su catálogo es el ERP (comportamiento actual).
UPDATE public.agente_empresas_config
   SET config = jsonb_set(config, '{fuentes}', '{"catalogo": {"tipo": "erp_supabase"}}'::jsonb, true),
       actualizado_en = now()
 WHERE empresa = 1;

-- Verificación:
-- SELECT empresa, config->'fuentes' FROM public.agente_empresas_config ORDER BY 1;
