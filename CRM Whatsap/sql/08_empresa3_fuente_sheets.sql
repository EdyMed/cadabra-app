-- ============================================================
-- Empresa 3 (Prueba Conexión WA): su catálogo viene de una planilla de Google Sheets.
-- Solo declara la FUENTE del catálogo; NO configura negocio (el bot sigue respondiendo
-- "falta configurar el negocio" hasta que se cargue negocio.descripcion).
-- Planilla: Drive → Agente WhatsApp Cadabra / Catálogos clientes /
--           "Catálogo prueba - Empresa 3 (Prueba Conexión WA)"
-- Debe estar compartida como "Cualquier persona con el enlace → Lector".
-- ============================================================

UPDATE public.agente_empresas_config
   SET config = jsonb_set(config, '{fuentes}',
         '{"catalogo": {"tipo": "google_sheets", "sheet_id": "1x84dV4jMEwWYkVtguy_VSxZczqavBD02qCBv5LmCxlc", "gid": 0, "frecuencia_horas": 6}}'::jsonb,
         true),
       actualizado_en = now()
 WHERE empresa = 3;

-- Verificación:
-- SELECT empresa, config->'fuentes' FROM public.agente_empresas_config ORDER BY 1;
