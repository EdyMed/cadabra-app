"""Fase 1 — "Guardar turno" escribe conversation_history.recibido_at (hora en que Meta recibió el mensaje).

Requiere CRM Whatsap/sql/10_metricas_valor.sql aplicado. Toma el timestamp del webhook de Meta (segundos unix);
Number() evita inyección. Si no viene (casos raros), queda NULL y la métrica simplemente no lo cuenta.
Uso: python -I patch_recibido_at_20261105.py [--dry]
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
TS = ("{{ (() => { const t = $('Webhook WhatsApp').first().json.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.timestamp;"
      " return t ? 'to_timestamp(' + Number(t) + ')' : 'null'; })() }}")


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
    json.dump(w, open(os.path.join(AQUI, f"{WID}_antes_recibido_at_{stamp}.json"), "w", encoding="utf-8"), ensure_ascii=False)
    n = next(x for x in w["nodes"] if x["name"] == "Guardar turno")
    q = n["parameters"]["query"]
    if "recibido_at" in q:
        raise SystemExit("Ya aplicado.")
    viejo_cols = "(empresa, phone_number, role, content, message_id)"
    assert q.count(viejo_cols) == 1, "columnas inesperadas"
    q = q.replace(viejo_cols, "(empresa, phone_number, role, content, message_id, recibido_at)")
    # fila user: termina en message_id '...'),   fila assistant: termina en null);
    q, n1 = re.subn(r"(json\.message_id \}\}')\)", r"\1, " + TS.replace("\\", "\\\\") + ")", q, count=1)
    q, n2 = re.subn(r"', null\);\s*$", "', null, null);", q, count=1)
    assert n1 == 1 and n2 == 1, (n1, n2)
    n["parameters"]["query"] = q
    print(q)
    if "--dry" in sys.argv:
        return
    st = {k: v for k, v in (w.get("settings") or {}).items() if k in SETTINGS_OK}
    r = api("PUT", f"/workflows/{WID}", {"name": w["name"], "nodes": w["nodes"], "connections": w["connections"], "settings": st})
    json.dump(r, open(os.path.join(AQUI, f"{WID}_despues_recibido_at_{stamp}.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print("OK active:", r.get("active"), "nodos:", len(r["nodes"]))


if __name__ == "__main__":
    main()
