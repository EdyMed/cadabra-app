"""Fase 2 · paso 2 (v2) — El bot recibía la ficha pero no la usaba: respondía genérico ("¿en qué puedo ayudarte?").
Lección ya conocida en este bot: las reglas abstractas no bastan, hacen falta ejemplos concretos. La regla de
SALUDO (anterior en el prompt) además pedía un "¡Hola! 😊" genérico. Se ajusta esa regla y se agrega un ejemplo.

Uso: python -I patch_ficha_cliente_v2_20261105.py [--dry]
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

CAMBIOS = [
    ("devuélvele un saludo BREVE y cálido ('¡Hola! 😊' o '¡Buenas!')",
     "devuélvele un saludo BREVE y cálido ('¡Hola! 😊' o '¡Buenas!'; si la ficha del CRM trae su nombre, úsalo: '¡Hola Pedro! 😊')"),
    ("No repitas la presentación larga, solo un saludo corto y sigues con lo que pide.\n",
     "No repitas la presentación larga, solo un saludo corto y sigues con lo que pide.\n"
     "CLIENTE QUE VUELVE: si la ficha del CRM trae datos, NO es su primer contacto (aunque no haya historial reciente): "
     "no hagas la presentación larga; salúdalo por su nombre y RETOMA lo que se venía conversando según la ficha. "
     "Ejemplo: ficha con Nombre: Pedro · Negocio: Almacén Don Pedro · Producto de interés: Empanadas · Etapa comercial: Cotización Enviada, "
     "y el cliente escribe 'hola, quería retomar lo que conversamos' → responde algo como "
     "'¡Hola Pedro! 😊 Claro, habíamos visto las empanadas para el Almacén Don Pedro. ¿Avanzamos con el pedido o prefieres revisar los precios de nuevo?'. "
     "NUNCA respondas un genérico '¿en qué puedo ayudarte?' cuando la ficha te dice de qué venía la conversación.\n"),
]


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
    json.dump(w, open(os.path.join(AQUI, f"{WID}_antes_ficha_v2_{stamp}.json"), "w", encoding="utf-8"), ensure_ascii=False)
    ag = next(n for n in w["nodes"] if n["name"] == "AI Agent")
    sm = ag["parameters"]["options"]["systemMessage"]
    if "CLIENTE QUE VUELVE" in sm:
        raise SystemExit("Ya aplicado.")
    for a, b in CAMBIOS:
        assert sm.count(a) == 1, a[:60]
        sm = sm.replace(a, b, 1)
    ag["parameters"]["options"]["systemMessage"] = sm
    print("systemMessage:", len(sm), "chars")
    if "--dry" in sys.argv:
        return
    st = {k: v for k, v in (w.get("settings") or {}).items() if k in SETTINGS_OK}
    r = api("PUT", f"/workflows/{WID}", {"name": w["name"], "nodes": w["nodes"], "connections": w["connections"], "settings": st})
    json.dump(r, open(os.path.join(AQUI, f"{WID}_despues_ficha_v2_{stamp}.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print("OK active:", r.get("active"), "nodos:", len(r["nodes"]))


if __name__ == "__main__":
    main()
