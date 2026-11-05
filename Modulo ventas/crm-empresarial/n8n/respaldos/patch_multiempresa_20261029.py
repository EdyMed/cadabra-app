"""Parche multiempresa del bot (n8n). Uso: python patch_multiempresa.py <main_in> <main_out> <alerta_in> <alerta_out>
Cada reemplazo debe ocurrir exactamente las veces esperadas; si no, aborta sin escribir nada."""
import json
import sys

main_in, main_out, al_in, al_out = sys.argv[1:5]
CTX = "$('Consolidar contexto').first().json"


def nodo(w, nombre):
    hits = [n for n in w["nodes"] if n["name"] == nombre]
    assert len(hits) == 1, f"nodo no encontrado o duplicado: {nombre}"
    return hits[0]


def reemplazar(params, clave, viejo, nuevo, veces=1):
    actual = params[clave]
    n = actual.count(viejo)
    assert n == veces, f"'{viejo[:60]}' aparece {n} veces en {clave} (esperado {veces})"
    params[clave] = actual.replace(viejo, nuevo)


w = json.load(open(main_in, encoding="utf-8"))
cambios = []

# A) Estado del bot: por empresa + contacto (antes solo por contacto -> se mezclaba entre empresas).
p = nodo(w, "Guarda: leer bot_activo")["parameters"]
reemplazar(p, "query", "WHERE contact_id = $1 LIMIT 1", "WHERE contact_id = $1 AND empresa = $2 LIMIT 1")
p["options"]["queryReplacement"] = "={{ [ " + CTX + ".from, " + CTX + ".empresa || 1 ] }}"
cambios.append("Guarda: leer bot_activo -> filtra empresa")

# B) Tool del agente que guarda el lead: envía la empresa al sub-workflow crm-upsert.
p = nodo(w, "crm_guardar_lead")["parameters"]
reemplazar(p, "jsonBody", "    origen_lead: 'whatsapp'\n  };",
           "    origen_lead: 'whatsapp',\n    empresa: " + CTX + ".empresa || 1\n  };")
cambios.append("crm_guardar_lead -> envía empresa")

# C) Registro automático del lead: envía la empresa.
p = nodo(w, "Registrar lead (auto)")["parameters"]
reemplazar(p, "jsonBody", "nombre_negocio: $json.nombre_negocio };",
           "nombre_negocio: $json.nombre_negocio, empresa: " + CTX + ".empresa || 1 };")
cambios.append("Registrar lead (auto) -> envía empresa")

# D) Alerta al vendedor: empresa (vendedores de ESA empresa) + número desde el que se envía.
p = nodo(w, "Alertar vendedor")["parameters"]
reemplazar(p, "jsonBody", "nombre_negocio || '' }) }}",
           "nombre_negocio || '', empresa: " + CTX + ".empresa || 1, phone_number_id: " + CTX + ".phone_number_id }) }}")
cambios.append("Alertar vendedor -> envía empresa y phone_number_id")

# E) Confirmación de agenda: sale por el número de la empresa (estaba fijo el de Sofía).
p = nodo(w, "Confirmar agenda (WhatsApp)")["parameters"]
reemplazar(p, "url", "/v21.0/1168256669712210/messages",
           "/v21.0/{{ " + CTX + ".phone_number_id }}/messages")
cambios.append("Confirmar agenda -> número de la empresa")

# F) Prompt: el nombre del asistente sale de la empresa (estaba 'Sofía' escrito a mano).
p = nodo(w, "AI Agent")["parameters"]["options"]
n_sofia = p["systemMessage"].count("Sofía")
assert n_sofia >= 1, "no se encontró 'Sofía' en el prompt"
p["systemMessage"] = p["systemMessage"].replace("Sofía", "{{ $json.nombre_asistente }}")
cambios.append(f"AI Agent prompt -> {n_sofia} 'Sofía' reemplazados por nombre_asistente")

json.dump(w, open(main_out, "w", encoding="utf-8"), ensure_ascii=False)

# Sub-workflow Alerta Vendedor: enviar desde el número de la empresa (fallback: el de Cadabra).
a = json.load(open(al_in, encoding="utf-8"))
p = nodo(a, "Avisar al vendedor (WhatsApp)")["parameters"]
reemplazar(p, "url", "/v21.0/1168256669712210/messages",
           "/v21.0/{{ $('Webhook Alerta').first().json.body.phone_number_id || '1168256669712210' }}/messages")
cambios.append("Alerta Vendedor (sub) -> número de la empresa")
json.dump(a, open(al_out, "w", encoding="utf-8"), ensure_ascii=False)

for c in cambios:
    print("OK", c)
