"""Fase 2 · paso 2 (v3) — En la prueba el bot tomó la nota interna "paga con transferencia" y respondió
"aceptamos transferencias" como si fuera política del negocio. Solución: la ficha que ve el LLM ya NO incluye
notas internas ni condición de pago (texto libre/acuerdos de ESE cliente). Se refuerza el uso del nombre.

Uso: python -I patch_ficha_cliente_v3_20261105.py [--dry]
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

JS_CAMBIOS = [
    ("['Etapa comercial', v(l.estado)], ['Comuna', v(l.comuna)], ['Condición de pago', v(l.pago)],",
     "['Etapa comercial', v(l.estado)], ['Comuna', v(l.comuna)],"),
    ("    ['Notas internas del equipo', v(l.notas) ? String(l.notas).slice(0, 400) : null],\n", ""),
]
SM_CAMBIOS = [
    ("ÚSALOS con naturalidad: si tienes su nombre, trátalo por su nombre;",
     "ÚSALOS con naturalidad: si tienes su nombre, úsalo SIEMPRE en el saludo ('¡Hola Pedro!', '¡Buenas, Pedro!');"),
    ("- NUNCA le leas la ficha ni menciones \"CRM\", \"ficha\", \"etapa\" o \"notas\". Las notas internas del equipo son solo para que entiendas el contexto: jamás las cites ni las repitas.",
     "- NUNCA le leas la ficha ni menciones \"CRM\", \"ficha\" o \"etapa\".\n"
     "- La ficha describe a ESTE cliente, NO las políticas del negocio. Formas de pago, horarios, despacho o precios: respóndelos SOLO con la información del negocio y las herramientas, nunca con la ficha."),
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
    json.dump(w, open(os.path.join(AQUI, f"{WID}_antes_ficha_v3_{stamp}.json"), "w", encoding="utf-8"), ensure_ascii=False)
    N = {n["name"]: n for n in w["nodes"]}
    js = N["Consolidar contexto"]["parameters"]["jsCode"]
    for a, b in JS_CAMBIOS:
        assert js.count(a) == 1, a[:50]
        js = js.replace(a, b, 1)
    N["Consolidar contexto"]["parameters"]["jsCode"] = js
    sm = N["AI Agent"]["parameters"]["options"]["systemMessage"]
    for a, b in SM_CAMBIOS:
        assert sm.count(a) == 1, a[:50]
        sm = sm.replace(a, b, 1)
    N["AI Agent"]["parameters"]["options"]["systemMessage"] = sm
    print("systemMessage:", len(sm), "chars | notas en ficha:", "Notas internas" in js)
    if "--dry" in sys.argv:
        return
    st = {k: v for k, v in (w.get("settings") or {}).items() if k in SETTINGS_OK}
    r = api("PUT", f"/workflows/{WID}", {"name": w["name"], "nodes": w["nodes"], "connections": w["connections"], "settings": st})
    json.dump(r, open(os.path.join(AQUI, f"{WID}_despues_ficha_v3_{stamp}.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print("OK active:", r.get("active"), "nodos:", len(r["nodes"]))


if __name__ == "__main__":
    main()
