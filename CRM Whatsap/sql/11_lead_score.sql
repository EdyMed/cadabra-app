-- ============================================================================
-- 11_lead_score.sql  (05-11-2026) — Fase 2: puntaje de leads con clasificador IA
--
-- Solo AGREGA columnas a crm.crm_leads (las llena el nodo "Score: guardar" de n8n):
--   score          0-100 (el más alto de los últimos 14 días; luego se reemplaza)
--   score_detalle  JSON del clasificador: intencion, categoria, cantidad, es_negocio, urgencia,
--                  pide_humano, resumen, puntos (desglose)
--   score_at       última vez que se calculó
-- dashboard_ro ya tiene SELECT sobre la tabla completa, no requiere grants nuevos.
-- ============================================================================
alter table crm.crm_leads add column if not exists score smallint;
alter table crm.crm_leads add column if not exists score_detalle jsonb;
alter table crm.crm_leads add column if not exists score_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'crm_leads_score_rango') then
    alter table crm.crm_leads add constraint crm_leads_score_rango check (score is null or score between 0 and 100);
  end if;
end $$;

create index if not exists idx_crm_leads_score on crm.crm_leads (empresa, score desc nulls last);

comment on column crm.crm_leads.score is 'Puntaje 0-100 del clasificador IA (n8n). Caliente >= 70, tibio 40-69, frío < 40.';
