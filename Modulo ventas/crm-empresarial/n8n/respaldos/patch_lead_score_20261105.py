"""Fase 2 · paso 3 — Puntaje de leads con clasificador IA (05-11-2026). Requiere CRM Whatsap/sql/11_lead_score.sql.

Rama paralela nueva desde "Guardar turno" (no agrega demora a la respuesta del bot):
  Score: ¿aplica? (rol != owner) -> Score: preparar (Code) -> Score: clasificar (IA) (OpenAI gpt-4o-mini, JSON schema)
  -> Score: calcular (Code, pesos fijos + SQL) -> Score: guardar (Postgres)
El registro por palabras clave ("Detectar interés (auto)") NO cambia: sigue como red de seguridad.
Si la IA detecta interés y el lead no existe, lo crea (ON CONFLICT empresa+contact_id: nunca duplica).
Todo con onError=continue: si OpenAI falla, el bot sigue igual.

Uso: python -I patch_lead_score_20261105.py [--dry]
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
CRED_OPENAI = {"openAiApi": {"id": "m7BC6hEy8r3b2qLs", "name": "OpenAI account"}}
CRED_PG = {"postgres": {"id": "BIM03WKClC8bnUc8", "name": "Supabase Ventas (RW)"}}

PREPARAR = r"""
// Arma la petición al clasificador con los últimos mensajes del cliente y las categorías de la ficha.
const ctx = $('Consolidar contexto').first().json;
const cfg = ctx.config || {};
const cats = (((cfg.interes || {}).categorias) || []).map(c => c && c.nombre).filter(Boolean);
const previos = (ctx.history || []).filter(h => h.role === 'user').slice(-5).map(h => '- ' + String(h.content).slice(0, 400));
const actual = String(ctx.user_message || '').slice(0, 1500);
const negocio = String((cfg.negocio || {}).descripcion || ctx.nombre_empresa || '').slice(0, 400);

const categoria = cats.length
  ? { anyOf: [{ type: 'string', enum: cats }, { type: 'null' }] }
  : { type: ['string', 'null'] };
const schema = {
  type: 'object', additionalProperties: false,
  required: ['intencion', 'categoria', 'cantidad', 'es_negocio', 'urgencia', 'pide_humano', 'resumen'],
  properties: {
    intencion: { type: 'string', enum: ['compra', 'cotizacion', 'agendar', 'consulta_producto', 'soporte_postventa', 'reclamo', 'saludo_o_charla', 'otro'] },
    categoria,
    cantidad: { type: ['string', 'null'], description: 'Cantidad o volumen mencionado (ej. "200 unidades", "3 docenas"), o null' },
    es_negocio: { type: 'boolean', description: 'true si el cliente compra para un negocio (local, restaurant, empresa, almacén, etc.)' },
    urgencia: { type: 'string', enum: ['alta', 'media', 'baja', 'sin_dato'] },
    pide_humano: { type: 'boolean' },
    resumen: { type: 'string', description: 'Qué busca el cliente, en máximo 15 palabras, en español' },
  },
};
const sys = 'Clasificas a clientes que escriben por WhatsApp a un negocio, para priorizar el seguimiento comercial. '
  + 'Negocio: ' + negocio + '. '
  + (cats.length ? 'Categorías de producto válidas: ' + cats.join(', ') + '. ' : '')
  + 'Considera TODO lo que el cliente ha dicho (mensajes previos + actual), no solo el último. '
  + 'intencion: compra = quiere comprar/hacer un pedido; cotizacion = pide precios para comprar o una cotización; agendar = quiere reunión/visita/cita; '
  + 'consulta_producto = pregunta por productos sin intención clara de compra; saludo_o_charla = saludo, gracias o charla sin consulta. '
  + 'urgencia: alta si dice hoy/mañana/urgente/esta semana; media si da un plazo cercano; baja si dice más adelante; si no dice nada, sin_dato. '
  + 'No inventes datos: si algo no se menciona, usa null/false/sin_dato.';
const user = (previos.length ? 'Mensajes anteriores del cliente:\n' + previos.join('\n') + '\n\n' : '') + 'Mensaje actual:\n' + actual;
return [{ json: { body: {
  model: 'gpt-4o-mini', temperature: 0, max_tokens: 250,
  response_format: { type: 'json_schema', json_schema: { name: 'lead', strict: true, schema } },
  messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
} } }];
""".strip()

CALCULAR = r"""
// Puntaje con pesos fijos + SQL de guardado (valores saneados: números con Number(), textos con '' escapado).
let d;
try { d = JSON.parse($json.choices[0].message.content); } catch (e) { return []; }
const PI = { compra: 40, cotizacion: 35, agendar: 30, consulta_producto: 20, soporte_postventa: 5 };
const puntos = {
  intencion: PI[d.intencion] || 0,
  categoria: d.categoria ? 10 : 0,
  cantidad: d.cantidad ? 15 : 0,
  negocio: d.es_negocio ? 15 : 0,
  urgencia: d.urgencia === 'alta' ? 15 : d.urgencia === 'media' ? 8 : 0,
  pide_humano: d.pide_humano ? 5 : 0,
};
const score = Math.min(100, Object.values(puntos).reduce((a, b) => a + b, 0));
const registrar = ['compra', 'cotizacion', 'consulta_producto', 'agendar'].includes(d.intencion) && !!(d.categoria || d.cantidad);

const ctx = $('Consolidar contexto').first().json;
const emp = Number(ctx.empresa);
const cid = Number(String(ctx.from || '').replace(/[^0-9]/g, ''));
if (!emp || !cid) return [];
const esc = (s) => String(s).replace(/'/g, "''");
const det = esc(JSON.stringify({ ...d, puntos, modelo: 'gpt-4o-mini' }));
const prod = d.categoria ? "'" + esc(String(d.categoria).slice(0, 60)) + "'" : 'null';
const viejo = "crm.crm_leads.score is null or crm.crm_leads.score_at < now() - interval '14 days'";
const sql = `insert into crm.crm_leads (empresa, contact_id, phone, producto_interes, estado_crm, origen_lead, bot_activo, score, score_detalle, score_at)
select ${emp}, ${cid}, ${cid}, ${prod}, 'Nuevo Lead', 'WhatsApp (IA)', true, ${score}, '${det}'::jsonb, now()
where ${registrar} or exists (select 1 from crm.crm_leads where empresa = ${emp} and contact_id = ${cid})
on conflict (empresa, contact_id) do update set
  score = case when ${viejo} then excluded.score else greatest(crm.crm_leads.score, excluded.score) end,
  score_detalle = case when ${viejo} or excluded.score >= crm.crm_leads.score then excluded.score_detalle else crm.crm_leads.score_detalle end,
  score_at = now(),
  producto_interes = coalesce(crm.crm_leads.producto_interes, excluded.producto_interes)
returning id, score;`;
return [{ json: { score, registrar, puntos, clasificacion: d, sql } }];
""".strip()


def si(id_, expr):
    return {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
                           "conditions": [{"id": id_, "leftValue": expr, "rightValue": True,
                                           "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
                           "combinator": "and"}, "options": {}}


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
    json.dump(w, open(os.path.join(AQUI, f"{WID}_antes_lead_score_{stamp}.json"), "w", encoding="utf-8"), ensure_ascii=False)
    N = {n["name"]: n for n in w["nodes"]}
    if "Score: clasificar (IA)" in N:
        raise SystemExit("Ya aplicado.")
    x, y = N["Detectar interés (auto)"]["position"]
    y = max(n["position"][1] for n in w["nodes"]) + 260      # debajo de todo, para no encimar nodos
    nuevos = [
        {"name": "Score: ¿aplica?", "type": "n8n-nodes-base.if", "typeVersion": 2, "position": [x, y],
         "parameters": si("sa", "={{ $('Consolidar contexto').first().json.rol !== 'owner' }}")},
        {"name": "Score: preparar", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [x + 240, y],
         "parameters": {"jsCode": PREPARAR}},
        {"name": "Score: clasificar (IA)", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [x + 480, y],
         "credentials": CRED_OPENAI, "onError": "continueRegularOutput",
         "parameters": {"method": "POST", "url": "https://api.openai.com/v1/chat/completions",
                        "authentication": "predefinedCredentialType", "nodeCredentialType": "openAiApi",
                        "sendBody": True, "specifyBody": "json", "jsonBody": "={{ JSON.stringify($json.body) }}",
                        "options": {"timeout": 20000}}},
        {"name": "Score: calcular", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [x + 720, y],
         "parameters": {"jsCode": CALCULAR}},
        {"name": "Score: guardar", "type": "n8n-nodes-base.postgres", "typeVersion": 2.6, "position": [x + 960, y],
         "credentials": CRED_PG, "onError": "continueRegularOutput",
         "parameters": {"operation": "executeQuery", "query": "={{ $json.sql }}", "options": {}}},
    ]
    w["nodes"] += nuevos
    C = w["connections"]
    C["Guardar turno"]["main"][0].append({"node": "Score: ¿aplica?", "type": "main", "index": 0})
    C["Score: ¿aplica?"] = {"main": [[{"node": "Score: preparar", "type": "main", "index": 0}], []]}
    C["Score: preparar"] = {"main": [[{"node": "Score: clasificar (IA)", "type": "main", "index": 0}]]}
    C["Score: clasificar (IA)"] = {"main": [[{"node": "Score: calcular", "type": "main", "index": 0}]]}
    C["Score: calcular"] = {"main": [[{"node": "Score: guardar", "type": "main", "index": 0}]]}
    if "--dry" in sys.argv:
        print("DRY OK", len(w["nodes"]), "nodos")
        return
    st = {k: v for k, v in (w.get("settings") or {}).items() if k in SETTINGS_OK}
    r = api("PUT", f"/workflows/{WID}", {"name": w["name"], "nodes": w["nodes"], "connections": C, "settings": st})
    json.dump(r, open(os.path.join(AQUI, f"{WID}_despues_lead_score_{stamp}.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print("OK active:", r.get("active"), "nodos:", len(r["nodes"]))


if __name__ == "__main__":
    main()
