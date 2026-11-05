-- ============================================================
-- Empresa 3 "Prueba Conexión WA" vuelve a quedar SIN negocio configurado.
-- Ejecutar en Supabase → SQL Editor (proyecto cexowmypklxngbjsxryf).
--
-- Desde el 30-10-2026 el bot (n8n) NO inventa un negocio: si la ficha no tiene
-- negocio.descripcion, responde "Agente configurado correctamente. Falta configurar
-- el negocio asociado a este número…" y no pasa por la IA. Se borra la ficha de
-- ejemplo ("tienda de alimentos de prueba") para que la empresa 3 muestre ese estado,
-- igual que cualquier cliente recién conectado. Se conserva el nombre del asistente.
-- ============================================================

UPDATE public.agente_empresas_config
   SET config = '{}'::jsonb, actualizado_en = now()
 WHERE empresa = 3;

-- Verificación (config debe quedar {}):
-- SELECT empresa, nombre_asistente, config FROM public.agente_empresas_config ORDER BY empresa;
