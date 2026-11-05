"""Si la empresa aún no tiene su negocio configurado en la ficha, el bot no pasa por la IA:
responde un mensaje fijo de "agente configurado, falta configurar el negocio".
Uso: python patch_negocio_pendiente.py <main_in.json> <main_out.json>"""
import copy
import json
import sys
import uuid

w = json.load(open(sys.argv[1], encoding="utf-8"))


def nodo(nombre):
    h = [n for n in w["nodes"] if n["name"] == nombre]
    assert len(h) == 1, nombre
    return h[0]


# 1) Consolidar contexto marca si el negocio está configurado.
#    Configurado = la ficha tiene descripción del negocio (o config.configurado === true).
#    config.configurado === false lo fuerza a "pendiente" aunque tenga descripción.
c = nodo("Consolidar contexto")["parameters"]
viejo = "  config: cfg,\n"
nuevo = ("  config: cfg,\n"
         "  negocio_configurado: cfg.configurado === true || (cfg.configurado !== false && !!t(neg.descripcion, '')),\n")
assert c["jsCode"].count(viejo) == 1
c["jsCode"] = c["jsCode"].replace(viejo, nuevo)

# 2) Nodos nuevos: IF + aviso por WhatsApp (copiados de la rama de horario, misma credencial)
base_if = nodo("¿Fuera de horario?")
base_msg = nodo("Avisar horario (WhatsApp)")
consol = nodo("Consolidar contexto")
x, y = consol["position"]

si = copy.deepcopy(base_if)
si["id"] = str(uuid.uuid4())
si["name"] = "¿Negocio configurado?"
si["position"] = [x + 120, y - 220]
si["parameters"]["conditions"]["conditions"] = [{
    "id": "c-negocio", "leftValue": "={{ $json.negocio_configurado }}", "rightValue": True,
    "operator": {"type": "boolean", "operation": "true", "singleValue": True}}]

msg = copy.deepcopy(base_msg)
msg["id"] = str(uuid.uuid4())
msg["name"] = "Avisar negocio pendiente (WhatsApp)"
msg["position"] = [x + 360, y - 380]
msg["parameters"]["jsonBody"] = (
    "={{ JSON.stringify({ messaging_product:'whatsapp', to: $json.from, type:'text', text:{ body: "
    "'✅ Agente configurado correctamente. Falta configurar el negocio asociado a este número "
    "(catálogo, horarios y datos de atención). Mientras tanto, el asistente no responderá consultas.' } }) }}")

assert not any(n["name"] in (si["name"], msg["name"]) for n in w["nodes"])
w["nodes"] += [si, msg]

# 3) Conexiones: Consolidar → ¿Negocio configurado? → (sí) flujo normal / (no) aviso
con = w["connections"]
siguiente = con["Consolidar contexto"]["main"][0]
assert siguiente == [{"node": "Guarda: leer bot_activo", "type": "main", "index": 0}], siguiente
con["Consolidar contexto"]["main"][0] = [{"node": si["name"], "type": "main", "index": 0}]
con[si["name"]] = {"main": [siguiente, [{"node": msg["name"], "type": "main", "index": 0}]]}

json.dump(w, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False)
print("OK nodos:", len(w["nodes"]), "| url aviso:", msg["parameters"]["url"][:90])
