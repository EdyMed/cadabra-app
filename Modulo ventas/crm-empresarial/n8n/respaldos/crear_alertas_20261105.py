"""Fase 0 · punto 1 — Alertas de falla + health check (05-11-2026).

Crea (o actualiza si ya existen, por nombre):
  1. Credencial httpHeaderAuth "Resend API" (Bearer, leída de app/CRM Whatsap/.env.local)
  2. Workflow "Alertas Cadabra (errores)"  -> Error Trigger -> WhatsApp + correo al admin
  3. Workflow "Health check Cadabra"        -> cada 15 min revisa Supabase, Calendar, OpenAI, Meta y Panel

Uso:  python -I crear_alertas_20261105.py           (crea/actualiza los 2 workflows)
      python -I crear_alertas_20261105.py --asignar (además asigna el Error Workflow a los activos)
"""
import json, re, sys, urllib.request, urllib.error

sys.stdout.reconfigure(encoding="utf-8")
ROOT = r"D:/Cadabra - Power BI/Integracion y Automatizacion-2026/app"
BASE = "https://appcadabra-cadabra-project.jmyxxj.easypanel.host/api/v1"


def env(path, key):
    txt = open(path, encoding="utf-8-sig").read()
    return re.search(rf"^{key}=(.*)$", txt, re.M).group(1).strip().strip("\"'")


KEY = env(ROOT + "/Modulo ventas/.env", "N8N_API_KEY")
RESEND_KEY = env(ROOT + "/CRM Whatsap/.env.local", "RESEND_API_KEY")
RESEND_FROM = env(ROOT + "/CRM Whatsap/.env.local", "RESEND_FROM_EMAIL")

# --- Destinatarios de las alertas (cambiar aquí) ---
ADMIN_WA = "56995649108"
ADMIN_EMAIL = "contacto@cadabra.cl"
PHONE_ID = "1168256669712210"          # número de Sofía, desde donde sale el aviso
CRED_META = {"httpHeaderAuth": {"id": "AkIBFXVUDXwvv1ta", "name": "Header Auth account"}}
CRED_PG = {"postgres": {"id": "BIM03WKClC8bnUc8", "name": "Supabase Ventas (RW)"}}
CRED_GCAL = {"googleCalendarOAuth2Api": {"id": "bpCcBAeM6BGoXB2L", "name": "Google Calendar account"}}
CRED_OPENAI = {"openAiApi": {"id": "m7BC6hEy8r3b2qLs", "name": "OpenAI account"}}

ACTIVOS = ["LspLEGA3ZegcYoIH", "aiV5ye7IxY1DGFrK", "H0Q3kX8qW5y9xfnE", "rImoJOhAKuxQrS59",
           "cH5tw8gqrSPQCuB4", "WJ73HaQ5lwYelsbp", "5Q02kFHe0G5yuGKD"]
SETTINGS_OK = {"saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution",
               "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone",
               "executionOrder", "callerPolicy", "callerIds", "timeSavedPerExecution", "binaryMode"}


def api(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={
        "X-N8N-API-KEY": KEY, "accept": "application/json", "content-type": "application/json"})
    try:
        return json.load(urllib.request.urlopen(req, timeout=60))
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} -> {e.code}: {e.read().decode()[:500]}")


def todos_workflows():
    out, cur = [], None
    while True:
        d = api("GET", "/workflows?limit=100" + (f"&cursor={cur}" if cur else ""))
        out += d["data"]
        cur = d.get("nextCursor")
        if not cur:
            return out


# ---------- nodos de envío (compartidos) ----------
def nodo_whatsapp(pos):
    return {
        "name": "Avisar por WhatsApp", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
        "position": pos, "credentials": CRED_META, "onError": "continueRegularOutput",
        "parameters": {
            "method": "POST", "url": f"https://graph.facebook.com/v21.0/{PHONE_ID}/messages",
            "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
            "sendBody": True, "specifyBody": "json",
            "jsonBody": "={{ JSON.stringify({ messaging_product:'whatsapp', to:'" + ADMIN_WA
                        + "', type:'text', text:{ body: $json.texto } }) }}",
            "options": {}}}


def nodo_correo(cred_resend, pos):
    return {
        "name": "Avisar por correo", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
        "position": pos, "credentials": {"httpHeaderAuth": cred_resend}, "onError": "continueRegularOutput",
        "parameters": {
            "method": "POST", "url": "https://api.resend.com/emails",
            "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
            "sendBody": True, "specifyBody": "json",
            "jsonBody": "={{ JSON.stringify({ from:'Alertas Cadabra <" + RESEND_FROM + ">', to:['"
                        + ADMIN_EMAIL + "'], subject:$json.asunto, text:$json.texto.replace(/\\*/g,'') }) }}",
            "options": {}}}


# ---------- 1. workflow de errores ----------
CODE_ERROR = r"""
// Arma la alerta y evita avalanchas: el mismo error (workflow+nodo+mensaje) se avisa 1 vez cada 30 min.
const d = $input.first().json;
const ex = d.execution || {};
const wf = d.workflow || {};
const err = ex.error || (d.trigger && d.trigger.error) || {};
const partes = [err.description, err.message].filter(Boolean).map(String);
const msg = partes.length ? [...new Set(partes)].join(': ') : 'Error sin mensaje';
const nodo = ex.lastNodeExecuted || (err.node && err.node.name) || '(trigger)';
const clave = [wf.id, nodo, msg.slice(0, 80)].join('|');

const s = $getWorkflowStaticData('global');
s.vistos = s.vistos || {};
const ahora = Date.now();
for (const k of Object.keys(s.vistos)) if (ahora - s.vistos[k].t > 6 * 3600e3) delete s.vistos[k];
const v = s.vistos[clave];
if (v && ahora - v.t < 30 * 60e3) { v.omitidos = (v.omitidos || 0) + 1; return []; }
const omitidos = v ? (v.omitidos || 0) : 0;
s.vistos[clave] = { t: ahora, omitidos: 0 };

const hora = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });
const texto = '🚨 *Falla en n8n*\n'
  + 'Workflow: ' + (wf.name || wf.id || '?') + '\n'
  + 'Nodo: ' + nodo + '\n'
  + 'Error: ' + msg.slice(0, 300) + '\n'
  + 'Ejecución: ' + (ex.id || '-') + ' (' + (ex.mode || '-') + ')\n'
  + (ex.url ? 'Ver: ' + ex.url + '\n' : '')
  + (omitidos ? 'Repeticiones omitidas en los últimos 30 min: ' + omitidos + '\n' : '')
  + 'Hora: ' + hora;
return [{ json: { texto, asunto: '🚨 Falla n8n · ' + (wf.name || '') + ' · ' + nodo } }];
"""


def wf_errores(cred_resend):
    nodes = [
        {"name": "Error Trigger", "type": "n8n-nodes-base.errorTrigger", "typeVersion": 1,
         "position": [0, 0], "parameters": {}},
        {"name": "Armar alerta", "type": "n8n-nodes-base.code", "typeVersion": 2,
         "position": [240, 0], "parameters": {"jsCode": CODE_ERROR.strip()}},
        nodo_whatsapp([500, -100]),
        nodo_correo(cred_resend, [500, 100]),
    ]
    con = {"Error Trigger": {"main": [[{"node": "Armar alerta", "type": "main", "index": 0}]]},
           "Armar alerta": {"main": [[{"node": "Avisar por WhatsApp", "type": "main", "index": 0},
                                      {"node": "Avisar por correo", "type": "main", "index": 0}]]}}
    return {"name": "Alertas Cadabra (errores)", "nodes": nodes, "connections": con,
            "settings": {"executionOrder": "v1", "timezone": "America/Santiago"}}


# ---------- 2. health check ----------
CODE_HEALTH = r"""
// Evalúa cada chequeo. Avisa cuando algo CAE, recuerda cada 2 h si sigue caído y avisa cuando se RECUPERA.
const leer = (n) => { try { return $(n).first().json || {}; } catch (e) { return { error: 'nodo no ejecutado' }; } };
const errTxt = (j) => {
  const e = j.error;
  if (!e) return '';
  return typeof e === 'string' ? e : (e.message || e.description || JSON.stringify(e)).toString();
};
const checks = [
  { k: 'supabase', nombre: 'Supabase (base de datos del bot)', nodo: 'Check Supabase',
    ok: (j) => !j.error && Number(j.ok) === 1,
    ayuda: 'Revisar si el proyecto está PAUSADO en supabase.com → Resume.' },
  { k: 'calendar', nombre: 'Google Calendar (agenda)', nodo: 'Check Google Calendar',
    ok: (j) => !j.error,
    ayuda: 'n8n → Credentials → "Google Calendar account" → Reconnect.' },
  { k: 'openai', nombre: 'OpenAI (cerebro del bot)', nodo: 'Check OpenAI',
    ok: (j) => !j.error && Array.isArray(j.choices),
    ayuda: 'Revisar saldo en platform.openai.com → Billing.' },
  { k: 'meta', nombre: 'Meta WhatsApp API (token del número)', nodo: 'Check Meta',
    ok: (j) => !j.error && !!j.id && j.quality_rating !== 'RED',
    ayuda: 'Revisar token/System User y calidad del número en WhatsApp Manager.' },
  { k: 'panel', nombre: 'Panel CRM (agente.appcadabra.cl)', nodo: 'Check Panel',
    ok: (j) => !j.error,
    ayuda: 'Revisar el servicio crm-panel en EasyPanel.' },
];

const s = $getWorkflowStaticData('global');
s.estado = s.estado || {};
const ahora = Date.now();
let forzar = false;
try { forzar = !!$('Probar ahora').first(); } catch (e) {}

const caidos = [], recuperados = [], resumen = [];
for (const c of checks) {
  const j = leer(c.nodo);
  const ok = c.ok(j);
  const det = ok ? '' : (errTxt(j) || (j.quality_rating === 'RED' ? 'calidad del número en ROJO' : 'respuesta inesperada')).slice(0, 200);
  const prev = s.estado[c.k] || { fail: false };
  resumen.push((ok ? '✅ ' : '❌ ') + c.nombre + (ok ? '' : ': ' + det));
  if (!ok) {
    const nuevo = !prev.fail;
    const recordar = prev.fail && (ahora - (prev.ultimoAviso || 0) > 2 * 3600e3);
    if (nuevo || recordar) {
      caidos.push({ c, det, desde: nuevo ? ahora : prev.desde });
      s.estado[c.k] = { fail: true, desde: nuevo ? ahora : prev.desde, ultimoAviso: ahora };
    } else s.estado[c.k] = prev;
  } else {
    if (prev.fail) recuperados.push({ c, desde: prev.desde });
    s.estado[c.k] = { fail: false };
  }
}

const hora = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' });
const min = (t) => Math.round((ahora - t) / 60000);
if (!caidos.length && !recuperados.length) {
  if (!forzar) return [];
  return [{ json: { asunto: 'Health check Cadabra · prueba manual', texto: '🩺 *Health check (prueba)*\n' + resumen.join('\n') + '\nHora: ' + hora } }];
}
let texto = '';
if (caidos.length) texto += '🔴 *Servicio caído*\n' + caidos.map(x => '• ' + x.c.nombre + ' (hace ' + min(x.desde) + ' min)\n  ' + x.det + '\n  👉 ' + x.c.ayuda).join('\n') + '\n';
if (recuperados.length) texto += (texto ? '\n' : '') + '🟢 *Recuperado*\n' + recuperados.map(x => '• ' + x.c.nombre + ' (estuvo caído ' + min(x.desde) + ' min)').join('\n') + '\n';
texto += 'Hora: ' + hora;
const asunto = caidos.length ? '🔴 Cadabra: ' + caidos.map(x => x.c.nombre).join(', ') : '🟢 Cadabra: servicio recuperado';
return [{ json: { texto, asunto } }];
"""


def wf_health(cred_resend):
    cont = {"onError": "continueRegularOutput", "alwaysOutputData": True}
    nodes = [
        {"name": "Cada 15 min", "type": "n8n-nodes-base.scheduleTrigger", "typeVersion": 1.2,
         "position": [0, 0], "parameters": {"rule": {"interval": [{"field": "minutes", "minutesInterval": 15}]}}},
        {"name": "Probar ahora", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [0, 200],
         "webhookId": "health-check-cadabra",
         "parameters": {"httpMethod": "POST", "path": "health-check-cadabra", "responseMode": "onReceived", "options": {}}},
        {"name": "Check Supabase", "type": "n8n-nodes-base.postgres", "typeVersion": 2.6, "position": [240, 100],
         "credentials": CRED_PG, **cont,
         "parameters": {"operation": "executeQuery", "query": "select 1 as ok", "options": {}}},
        {"name": "Check Google Calendar", "type": "n8n-nodes-base.googleCalendar", "typeVersion": 1.3,
         "position": [460, 100], "credentials": CRED_GCAL, **cont,
         "parameters": {"operation": "getAll", "calendar": {"__rl": True, "mode": "list", "value": "primary"},
                        "limit": 1, "options": {}}},
        {"name": "Check OpenAI", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [680, 100],
         "credentials": CRED_OPENAI, **cont,
         "parameters": {"method": "POST", "url": "https://api.openai.com/v1/chat/completions",
                        "authentication": "predefinedCredentialType", "nodeCredentialType": "openAiApi",
                        "sendBody": True, "specifyBody": "json",
                        "jsonBody": "{\"model\":\"gpt-4o-mini\",\"max_tokens\":1,\"messages\":[{\"role\":\"user\",\"content\":\"ok\"}]}",
                        "options": {"timeout": 20000}}},
        {"name": "Check Meta", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [900, 100],
         "credentials": CRED_META, **cont,
         "parameters": {"method": "GET",
                        "url": f"https://graph.facebook.com/v21.0/{PHONE_ID}?fields=id,quality_rating,display_phone_number",
                        "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
                        "options": {"timeout": 20000}}},
        {"name": "Check Panel", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [1120, 100],
         **cont,
         "parameters": {"method": "GET", "url": "https://agente.appcadabra.cl/crm/login",
                        "options": {"timeout": 20000, "response": {"response": {"responseFormat": "text"}}}}},
        {"name": "Evaluar", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [1340, 100],
         "parameters": {"jsCode": CODE_HEALTH.strip()}},
        nodo_whatsapp([1580, 0]),
        nodo_correo(cred_resend, [1580, 200]),
    ]
    nxt = lambda n: {"main": [[{"node": n, "type": "main", "index": 0}]]}
    con = {"Cada 15 min": nxt("Check Supabase"), "Probar ahora": nxt("Check Supabase"),
           "Check Supabase": nxt("Check Google Calendar"), "Check Google Calendar": nxt("Check OpenAI"),
           "Check OpenAI": nxt("Check Meta"), "Check Meta": nxt("Check Panel"), "Check Panel": nxt("Evaluar"),
           "Evaluar": {"main": [[{"node": "Avisar por WhatsApp", "type": "main", "index": 0},
                                 {"node": "Avisar por correo", "type": "main", "index": 0}]]}}
    return {"name": "Health check Cadabra", "nodes": nodes, "connections": con,
            "settings": {"executionOrder": "v1", "timezone": "America/Santiago"}}


def crear_o_actualizar(wf, existentes):
    prev = next((w for w in existentes if w["name"] == wf["name"]), None)
    if prev:
        r = api("PUT", f"/workflows/{prev['id']}", wf)
        print("actualizado", r["id"], wf["name"])
    else:
        r = api("POST", "/workflows", wf)
        print("creado", r["id"], wf["name"])
    return r["id"]


def main():
    import os
    ids_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_alertas_ids.json")
    ids = json.load(open(ids_file)) if os.path.exists(ids_file) else {}
    if "cred_resend" not in ids:
        c = api("POST", "/credentials", {"name": "Resend API", "type": "httpHeaderAuth",
                                         "data": {"name": "Authorization", "value": "Bearer " + RESEND_KEY}})
        ids["cred_resend"] = c["id"]
        print("credencial Resend creada", c["id"])
    cred_resend = {"id": ids["cred_resend"], "name": "Resend API"}

    existentes = todos_workflows()
    ids["errores"] = crear_o_actualizar(wf_errores(cred_resend), existentes)
    hc = wf_health(cred_resend)
    hc["settings"]["errorWorkflow"] = ids["errores"]
    ids["health"] = crear_o_actualizar(hc, existentes)
    json.dump(ids, open(ids_file, "w"), indent=1)
    # En n8n 2.x el Error Workflow también debe estar publicado/activo, si no nunca se ejecuta.
    api("POST", f"/workflows/{ids['errores']}/activate")
    api("POST", f"/workflows/{ids['health']}/activate")
    print("alertas y health check activos")

    if "--asignar" in sys.argv:
        for wid in ACTIVOS:
            w = api("GET", f"/workflows/{wid}")
            st = {k: v for k, v in (w.get("settings") or {}).items() if k in SETTINGS_OK}
            st["errorWorkflow"] = ids["errores"]
            if wid == "H0Q3kX8qW5y9xfnE":
                # Contador: respondía 500 "No item to return" cuando no cruzaba el 80 % (IF sin salida).
                # Nadie usa su respuesta (el nodo "Contar conversación" es terminal) -> responder al recibir.
                for n in w["nodes"]:
                    if n["type"] == "n8n-nodes-base.webhook":
                        n["parameters"]["responseMode"] = "onReceived"
            r = api("PUT", f"/workflows/{wid}", {"name": w["name"], "nodes": w["nodes"],
                                                  "connections": w["connections"], "settings": st})
            print("errorWorkflow asignado:", wid, w["name"], "| active:", r.get("active"),
                  "| nodos:", len(r["nodes"]))


if __name__ == "__main__":
    main()
