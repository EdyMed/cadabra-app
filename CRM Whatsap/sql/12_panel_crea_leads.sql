-- ============================================================================
-- 12_panel_crea_leads.sql  (19-11-2026)
--
-- Con coexistencia llegan contactos desde el historial de la app WhatsApp Business que todavía no son leads.
-- Para responderles desde el panel hay que apagar el bot, y bot_activo vive en crm.crm_leads: si el lead no
-- existe, el panel lo crea (src/app/api/conversaciones/bot/route.ts).
--
-- Permiso ACOTADO para dashboard_rw: INSERT solo en estas 6 columnas (el resto queda con sus valores por
-- defecto). Sigue sin poder borrar leads ni cambiar otras columnas.
-- ============================================================================
grant insert (empresa, contact_id, phone, estado_crm, origen_lead, bot_activo) on crm.crm_leads to dashboard_rw;

-- Verificación (debe dar true):
-- select has_table_privilege('dashboard_rw', 'crm.crm_leads', 'INSERT');
