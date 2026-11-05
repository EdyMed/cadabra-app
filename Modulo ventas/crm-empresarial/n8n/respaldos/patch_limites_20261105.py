"""Fase 0 · punto 3 — Límites duros en el bot (05-11-2026).

1. AI Agent: maxIterations = 6 (por defecto n8n permite 10 vueltas de herramienta por mensaje).
2. Tools HTTP (crm_guardar_lead, mostrar_menu): timeout 15 s.
3. Tope diario de mensajes por contacto (antispam / bot-contra-bot):
   Guarda: ¿bot activo? (ON) -> Tope: contar mensaje (Redis INCR, TTL 26 h)
     -> Tope: evaluar (Code) -> Tope: ¿excedido?
          no -> Buffer: guardar mi marca (flujo normal)
          sí -> Tope: ¿avisar? -> (solo el 1er mensaje sobre el tope) Tope: avisar al contacto (WhatsApp)
   Límite = ficha config.limites.mensajes_dia_contacto (por defecto 100). El rol owner NO tiene tope.
   Si Redis falla, el mensaje sigue normal (fail-open).

Uso: python -I patch_limites_20261105.py [--dry]
"""
import copy, datetime, json, os, re, sys, urllib.request, urllib.error

sys.stdout.reconfigure(encoding="utf-8")
AQUI = os.path.dirname(os.path.abspath(__file__))
BASE = "https://appcadabra-cadabra-project.jmyxxj.easypanel.host/api/v1"
WID = "LspLEGA3ZegcYoIH"
KEY = re.search(r"^N8N_API_KEY=(.*)$", open(os.path.join(AQUI, "..", "..", "..", ".env"), encoding="utf-8-sig").read(),
                re.M).group(1).strip().strip("\"'")
SETTINGS_OK = {"saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution", "saveDataSuccessExecution",
               "executionTimeout", "errorWorkflow", "timezone", "executionOrder", "callerPolicy", "callerIds",
               "timeSavedPerExecution", "binaryMode"}
CRED_REDIS = {"redis": {"id": "Pb4ansRdtu4Fu0yh", "name": "Redis Cadabra"}}
CRED_META = {"httpHeaderAuth": {"id": "AkIBFXVUDXwvv1ta", "name": "Header Auth account"}}
MAX_ITER = 6
LIMITE_DEFECTO = 100


def api(method, path, body=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None,
                                 method=method, headers={"X-N8N-API-KEY": KEY, "content-type": "application/json"})
    try:
        return json.load(urllib.request.urlopen(req, timeout=60))
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} -> {e.code}: {e.read().decode()[:600]}")


CODE_TOPE = r"""
// Lee el contador de Redis y decide. Devuelve el mismo item que traía la guarda (para no romper $json aguas abajo).
const ctx = $('Consolidar contexto').first().json;
const cfg = ($('Resolver empresa').first().json.config) || {};
const limite = Number((cfg.limites || {}).mensajes_dia_contacto) || __LIMITE__;
const r = $input.first().json || {};
let n = 0;
for (const [k, v] of Object.entries(r)) if (k.startsWith('tope:')) n = Number(v) || 0;
const esOwner = ctx.rol === 'owner';
const excedido = !esOwner && n > limite;
const base = $('Guarda: ¿bot activo?').first().json;
return [{ json: { ...base, tope_n: n, tope_limite: limite, tope_excedido: excedido, tope_avisar: excedido && n === limite + 1 } }];
""".replace("__LIMITE__", str(LIMITE_DEFECTO)).strip()


def si(id_, expr):
    return {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose"},
                           "conditions": [{"id": id_, "leftValue": expr, "rightValue": True,
                                           "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
                           "combinator": "and"}, "options": {}}


def main():
    w = api("GET", f"/workflows/{WID}")
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M")
    json.dump(w, open(os.path.join(AQUI, f"{WID}_antes_limites_{stamp}.json"), "w", encoding="utf-8"), ensure_ascii=False)
    N = {n["name"]: n for n in w["nodes"]}
    C = w["connections"]
    if "Tope: contar mensaje" in N:
        raise SystemExit("El patch ya está aplicado (existe 'Tope: contar mensaje').")

    # 1. maxIterations
    N["AI Agent"]["parameters"].setdefault("options", {})["maxIterations"] = MAX_ITER
    # 2. timeouts de tools HTTP
    for t in ("crm_guardar_lead", "mostrar_menu"):
        N[t]["parameters"].setdefault("options", {})["timeout"] = 15000

    # 3. tope diario
    gx, gy = N["Guarda: ¿bot activo?"]["position"]
    nuevos = [
        {"name": "Tope: contar mensaje", "type": "n8n-nodes-base.redis", "typeVersion": 1,
         "position": [gx + 60, gy + 420], "credentials": CRED_REDIS, "onError": "continueRegularOutput",
         "alwaysOutputData": True,
         "parameters": {"operation": "incr",
                        "key": "={{ 'tope:' + $('Consolidar contexto').first().json.empresa + ':' + $('Consolidar contexto').first().json.from + ':' + $now.toFormat('yyyy-MM-dd') }}",
                        "expire": True, "ttl": 93600}},
        {"name": "Tope: evaluar", "type": "n8n-nodes-base.code", "typeVersion": 2,
         "position": [gx + 280, gy + 420], "parameters": {"jsCode": CODE_TOPE}},
        {"name": "Tope: ¿excedido?", "type": "n8n-nodes-base.if", "typeVersion": 2,
         "position": [gx + 500, gy + 420], "parameters": si("tx", "={{ $json.tope_excedido }}")},
        {"name": "Tope: ¿avisar?", "type": "n8n-nodes-base.if", "typeVersion": 2,
         "position": [gx + 720, gy + 300], "parameters": si("ta", "={{ $json.tope_avisar }}")},
        {"name": "Tope: avisar al contacto", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
         "position": [gx + 940, gy + 300], "credentials": CRED_META, "onError": "continueRegularOutput",
         "parameters": {
             "method": "POST",
             "url": "=https://graph.facebook.com/v21.0/{{ $('Consolidar contexto').first().json.phone_number_id }}/messages",
             "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
             "sendBody": True, "specifyBody": "json",
             "jsonBody": "={{ JSON.stringify({ messaging_product:'whatsapp', to: $('Consolidar contexto').first().json.from, type:'text', text:{ body: 'Recibimos muchos mensajes seguidos hoy 🙏 Para atenderte mejor, una persona del equipo seguirá esta conversación.' } }) }}",
             "options": {}}},
    ]
    w["nodes"] += nuevos
    destino_original = C["Guarda: ¿bot activo?"]["main"][0]          # -> Buffer: guardar mi marca
    assert [d["node"] for d in destino_original] == ["Buffer: guardar mi marca"], destino_original
    C["Guarda: ¿bot activo?"]["main"][0] = [{"node": "Tope: contar mensaje", "type": "main", "index": 0}]
    C["Tope: contar mensaje"] = {"main": [[{"node": "Tope: evaluar", "type": "main", "index": 0}]]}
    C["Tope: evaluar"] = {"main": [[{"node": "Tope: ¿excedido?", "type": "main", "index": 0}]]}
    C["Tope: ¿excedido?"] = {"main": [[{"node": "Tope: ¿avisar?", "type": "main", "index": 0}], copy.deepcopy(destino_original)]}
    C["Tope: ¿avisar?"] = {"main": [[{"node": "Tope: avisar al contacto", "type": "main", "index": 0}], []]}

    if "--dry" in sys.argv:
        print("DRY OK: nodos", len(w["nodes"]))
        return
    st = {k: v for k, v in (w.get("settings") or {}).items() if k in SETTINGS_OK}
    r = api("PUT", f"/workflows/{WID}", {"name": w["name"], "nodes": w["nodes"], "connections": C, "settings": st})
    json.dump(r, open(os.path.join(AQUI, f"{WID}_despues_limites_{stamp}.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print("OK active:", r.get("active"), "nodos:", len(r["nodes"]),
          "maxIterations:", next(n for n in r["nodes"] if n["name"] == "AI Agent")["parameters"]["options"].get("maxIterations"))


if __name__ == "__main__":
    main()
