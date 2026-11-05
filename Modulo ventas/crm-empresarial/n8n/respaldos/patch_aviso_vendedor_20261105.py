"""Fase 2 · paso 1 — Alerta Vendedor con plantilla `aviso_vendedor` (05-11-2026).

Problema: el aviso salía como texto libre; Meta solo lo entrega si el vendedor escribió al número de la empresa
en las últimas 24 h. Ahora: plantilla utility primero (llega siempre) y, si Meta la rechaza (no existe o no está
aprobada en la WABA de esa empresa), cae al texto de siempre.

Plantilla (crear en Panel -> Plantillas, en la WABA de CADA empresa), categoría UTILITY, idioma es:
  Hola, el cliente {{1}} pidió hablar con un vendedor por WhatsApp. Respóndele aquí: https://wa.me/{{2}} o revisa la conversación en el CRM.

Uso: python -I patch_aviso_vendedor_20261105.py [--dry]
"""
import datetime, json, os, re, sys, urllib.error, urllib.request

sys.stdout.reconfigure(encoding="utf-8")
AQUI = os.path.dirname(os.path.abspath(__file__))
BASE = "https://appcadabra-cadabra-project.jmyxxj.easypanel.host/api/v1"
WID = "rImoJOhAKuxQrS59"
KEY = re.search(r"^N8N_API_KEY=(.*)$", open(os.path.join(AQUI, "..", "..", "..", ".env"), encoding="utf-8-sig").read(),
                re.M).group(1).strip().strip("\"'")
SETTINGS_OK = {"saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution",
               "executionTimeout", "errorWorkflow", "timezone", "executionOrder", "callerPolicy", "callerIds",
               "timeSavedPerExecution", "binaryMode"}
TEMPLATE, LANG = "aviso_vendedor", "es"


def api(m, p, b=None):
    req = urllib.request.Request(BASE + p, data=json.dumps(b).encode() if b is not None else None, method=m,
                                 headers={"X-N8N-API-KEY": KEY, "content-type": "application/json"})
    try:
        return json.load(urllib.request.urlopen(req, timeout=60))
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{m} {p} -> {e.code}: {e.read().decode()[:600]}")


CODE_ITEMS = r"""
const prev = $('Reabrir+etiquetar CRM').first().json;
const b = $('Webhook Alerta').first().json.body || {};
// Variables de la plantilla: sin saltos de línea (Meta los rechaza en parámetros).
const limpia = (x) => String(x || '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
let quien = limpia(b.nombre) || 'sin nombre';
if (limpia(b.negocio)) quien += ' de ' + limpia(b.negocio);
const vends = $input.all().map(i => String(i.json.whatsapp || '').replace(/[^0-9]/g,'')).filter(Boolean);
if (vends.length === 0) return [];   // sin vendedores activos: no hay a quién avisar
return vends.map(v => ({ json: { convId: prev.convId, texto: prev.texto, vendedor: v, quien, wa: prev.wa } }));
""".strip()


def main():
    w = api("GET", f"/workflows/{WID}")
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M")
    json.dump(w, open(os.path.join(AQUI, f"{WID}_antes_aviso_vendedor_{stamp}.json"), "w", encoding="utf-8"), ensure_ascii=False)
    N = {n["name"]: n for n in w["nodes"]}
    if "Aviso (plantilla)" in N:
        raise SystemExit("Ya aplicado.")
    texto = N["Avisar al vendedor (WhatsApp)"]
    url = texto["parameters"]["url"]
    N["Armar items por vendedor"]["parameters"]["jsCode"] = CODE_ITEMS

    x, y = texto["position"]
    plantilla = {
        "name": "Aviso (plantilla)", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
        "position": [x, y], "credentials": texto["credentials"], "onError": "continueRegularOutput",
        "parameters": {
            "method": "POST", "url": url, "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
            "sendBody": True, "specifyBody": "json",
            "jsonBody": "={{ JSON.stringify({ messaging_product:'whatsapp', to: $json.vendedor, type:'template', template:{ name:'"
                        + TEMPLATE + "', language:{ code:'" + LANG + "' }, components:[{ type:'body', parameters:[ "
                        "{ type:'text', text: $json.quien.slice(0,200) }, { type:'text', text: String($json.wa) } ] }] } }) }}",
            "options": {}}}
    fallo = {
        "name": "¿Plantilla falló?", "type": "n8n-nodes-base.if", "typeVersion": 2, "position": [x + 220, y],
        "parameters": {"conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
            "conditions": [{"id": "pf", "leftValue": "={{ !($json.messages && $json.messages.length) }}", "rightValue": True,
                            "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
            "combinator": "and"}, "options": {}}}
    # El texto de respaldo toma vendedor/texto del item emparejado (el $json aquí es la respuesta de Meta).
    texto["position"] = [x + 440, y]
    texto["parameters"]["jsonBody"] = ("={{ JSON.stringify({ messaging_product:'whatsapp', to: $('Armar items por vendedor').item.json.vendedor,"
                                       " type:'text', text:{ body: $('Armar items por vendedor').item.json.texto } }) }}")
    w["nodes"] += [plantilla, fallo]
    C = w["connections"]
    C["Armar items por vendedor"] = {"main": [[{"node": "Aviso (plantilla)", "type": "main", "index": 0}]]}
    C["Aviso (plantilla)"] = {"main": [[{"node": "¿Plantilla falló?", "type": "main", "index": 0}]]}
    C["¿Plantilla falló?"] = {"main": [[{"node": "Avisar al vendedor (WhatsApp)", "type": "main", "index": 0}], []]}
    if "--dry" in sys.argv:
        print("DRY OK", len(w["nodes"]), "nodos")
        return
    st = {k: v for k, v in (w.get("settings") or {}).items() if k in SETTINGS_OK}
    r = api("PUT", f"/workflows/{WID}", {"name": w["name"], "nodes": w["nodes"], "connections": C, "settings": st})
    json.dump(r, open(os.path.join(AQUI, f"{WID}_despues_aviso_vendedor_{stamp}.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print("OK active:", r.get("active"), "nodos:", len(r["nodes"]))


if __name__ == "__main__":
    main()
