"""Fase 2 · paso 2 — Memoria de largo plazo: el bot recibe la ficha del cliente desde crm.crm_leads (05-11-2026).

1. "Resolver rol": la misma consulta trae ahora la ficha del lead (LEFT JOIN, siempre 1 fila).
2. "Determinar rol": pasa los campos lead_* hacia adelante.
3. "Consolidar contexto": arma `ficha_cliente` (texto) a partir de esos campos.
4. Prompt: sección "Lo que ya sabes de este cliente" + ajuste de la regla "nunca inventes el nombre".
   La derivación a vendedor NO cambia (la frase para pedir el nombre dispara la captura y el aviso al vendedor).

Uso: python -I patch_ficha_cliente_20261105.py [--dry]
"""
import datetime, json, os, re, sys, urllib.error, urllib.request

sys.stdout.reconfigure(encoding="utf-8")
AQUI = os.path.dirname(os.path.abspath(__file__))
BASE = "https://appcadabra-cadabra-project.jmyxxj.easypanel.host/api/v1"
WID = "LspLEGA3ZegcYoIH"
KEY = re.search(r"^N8N_API_KEY=(.*)$", open(os.path.join(AQUI, "..", "..", "..", ".env"), encoding="utf-8-sig").read(),
                re.M).group(1).strip().strip("\"'")
SETTINGS_OK = {"saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution",
               "executionTimeout", "errorWorkflow", "timezone", "executionOrder", "callerPolicy", "callerIds",
               "timeSavedPerExecution", "binaryMode"}

QUERY_ROL = """select c.rol, c.rut_cliente, c.nombre,
       l.id as lead_id, l.nombre as lead_nombre, l.nombre_negocio as lead_negocio,
       l.producto_interes as lead_producto, l.estado_crm as lead_estado, l.comuna as lead_comuna,
       l.condicion_pago as lead_pago, l.vendedor_asignado as lead_vendedor,
       l.estado_agendamiento as lead_agenda, to_char(l.fecha_agendamiento, 'YYYY-MM-DD') as lead_fecha_cita,
       to_char(l.hora_cita, 'HH24:MI') as lead_hora_cita, l.notas as lead_notas,
       to_char(l.created_at at time zone 'America/Santiago', 'YYYY-MM-DD') as lead_desde
from (select 1) d
left join public.agente_contactos c
  on c.empresa = $1 and c.phone_number = $2 and c.activo = true
left join crm.crm_leads l
  on l.empresa = $1 and l.contact_id = nullif(regexp_replace($2, '[^0-9]', '', 'g'), '')::bigint
limit 1;"""

DETERMINAR_ROL = """const prev = $('Merge empresa+msg').first().json;
const rolRows = $input.all();
const rolRow = rolRows.length > 0 ? rolRows[0].json : {};
// Ficha del CRM (Resolver rol hace LEFT JOIN a crm.crm_leads; null si el contacto no tiene lead).
const lead = rolRow.lead_id ? {
  nombre: rolRow.lead_nombre, negocio: rolRow.lead_negocio, producto: rolRow.lead_producto,
  estado: rolRow.lead_estado, comuna: rolRow.lead_comuna, pago: rolRow.lead_pago,
  vendedor: rolRow.lead_vendedor, agenda: rolRow.lead_agenda, fecha_cita: rolRow.lead_fecha_cita,
  hora_cita: rolRow.lead_hora_cita, notas: rolRow.lead_notas, desde: rolRow.lead_desde
} : null;
return [{ json: {
  ...prev,
  rol: rolRow.rol ?? 'anon',
  rut_cliente: rolRow.rut_cliente ?? null,
  nombre_contacto: rolRow.nombre ?? null,
  lead
}}];"""

FICHA_JS = """
// ---- Ficha del cliente en el CRM (memoria de largo plazo) ----
const fichaCliente = (() => {
  const l = ctx.lead;
  if (!l) return '(Sin ficha en el CRM: es un contacto nuevo o todavía no mostró interés de compra.)';
  const v = (x) => (x === null || x === undefined || String(x).trim() === '') ? null : String(x).trim();
  const filas = [
    ['Nombre', v(l.nombre)], ['Negocio', v(l.negocio)], ['Producto de interés', v(l.producto)],
    ['Etapa comercial', v(l.estado)], ['Comuna', v(l.comuna)], ['Condición de pago', v(l.pago)],
    ['Vendedor asignado', v(l.vendedor)],
    ['Cita', v(l.fecha_cita) ? (l.fecha_cita + (v(l.hora_cita) ? ' ' + l.hora_cita : '') + (v(l.agenda) ? ' (' + l.agenda + ')' : '')) : null],
    ['Notas internas del equipo', v(l.notas) ? String(l.notas).slice(0, 400) : null],
    ['Cliente desde', v(l.desde)],
  ].filter(([, x]) => x);
  return filas.length ? filas.map(([k, x]) => '- ' + k + ': ' + x).join('\\n') : '(Ficha en el CRM sin datos todavía.)';
})();
"""

SECCION = """## Lo que ya sabes de este cliente (ficha del CRM)
{{ $json.ficha_cliente }}
- Son datos que el propio cliente te dio antes o que registró el equipo. ÚSALOS con naturalidad: si tienes su nombre, trátalo por su nombre; NO le vuelvas a preguntar nombre, negocio ni producto que ya aparecen aquí.
- Si ahora dice algo distinto (otro producto, otro local), lo que dice AHORA manda: actualízalo con crm_actualizar_estado.
- NUNCA le leas la ficha ni menciones "CRM", "ficha", "etapa" o "notas". Las notas internas del equipo son solo para que entiendas el contexto: jamás las cites ni las repitas.
- EXCEPCIÓN: al derivar a un vendedor sigue EXACTAMENTE el procedimiento de la sección "CRM — PEDIR NOMBRE Y COMPLETAR DATOS" (pide el nombre con la misma frase aunque ya lo tengas).

"""


def api(m, p, b=None):
    req = urllib.request.Request(BASE + p, data=json.dumps(b).encode() if b is not None else None, method=m,
                                 headers={"X-N8N-API-KEY": KEY, "content-type": "application/json"})
    try:
        return json.load(urllib.request.urlopen(req, timeout=60))
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{m} {p} -> {e.code}: {e.read().decode()[:600]}")


def main():
    w = api("GET", f"/workflows/{WID}")
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M")
    json.dump(w, open(os.path.join(AQUI, f"{WID}_antes_ficha_cliente_{stamp}.json"), "w", encoding="utf-8"), ensure_ascii=False)
    N = {n["name"]: n for n in w["nodes"]}

    rol = N["Resolver rol"]["parameters"]
    assert "agente_contactos" in rol["query"] and "crm_leads" not in rol["query"], "Resolver rol inesperado o ya aplicado"
    rol["query"] = QUERY_ROL
    N["Determinar rol"]["parameters"]["jsCode"] = DETERMINAR_ROL

    cc = N["Consolidar contexto"]["parameters"]
    js = cc["jsCode"]
    ancla = "const ctx = $('Determinar rol').first().json;\n"
    assert js.count(ancla) == 1 and "history_text: historyText" in js
    js = js.replace(ancla, ancla + FICHA_JS, 1)
    js = js.replace("  history_text: historyText", "  ficha_cliente: fichaCliente,\n  history_text: historyText", 1)
    cc["jsCode"] = js

    sm = N["AI Agent"]["parameters"]["options"]["systemMessage"]
    assert sm.count("## Reglas duras") == 1
    sm = sm.replace("## Reglas duras", SECCION + "## Reglas duras", 1)
    viejo = "solo guárdalo si el cliente lo dijo explícitamente en ESTA conversación; nunca del historial ni del número."
    assert sm.count(viejo) == 1
    sm = sm.replace(viejo, viejo + " (El nombre que YA está en la ficha del CRM sí puedes usarlo para tratarlo por su nombre: lo dio el cliente antes.)", 1)
    N["AI Agent"]["parameters"]["options"]["systemMessage"] = sm
    print("systemMessage:", len(sm), "chars")

    if "--dry" in sys.argv:
        print("DRY OK")
        return
    st = {k: v for k, v in (w.get("settings") or {}).items() if k in SETTINGS_OK}
    r = api("PUT", f"/workflows/{WID}", {"name": w["name"], "nodes": w["nodes"], "connections": w["connections"], "settings": st})
    json.dump(r, open(os.path.join(AQUI, f"{WID}_despues_ficha_cliente_{stamp}.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print("OK active:", r.get("active"), "nodos:", len(r["nodes"]))


if __name__ == "__main__":
    main()
