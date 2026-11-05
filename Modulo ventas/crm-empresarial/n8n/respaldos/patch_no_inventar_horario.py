"""Agrega al prompt de agenda la regla: la IA no conoce la disponibilidad del calendario.
Uso: python patch_no_inventar_horario.py <in.json> <out.json>"""
import json
import sys

w = json.load(open(sys.argv[1], encoding="utf-8"))
c = [x for x in w["nodes"] if x["name"] == "Consolidar contexto"][0]["parameters"]
ancla = "el sistema se encarga.'\n  ].filter(Boolean).join('\\n');"
nuevo = ("el sistema se encarga.',\n"
         "    '- Tú NO conoces la disponibilidad del calendario: NUNCA digas que un horario está ocupado o no disponible, "
         "ni propongas otra hora por tu cuenta, salvo que el día u hora pedidos estén FUERA de los días/horario indicados arriba. "
         "Si el cliente dio los datos necesarios, responde SOLO la frase de coordinación.'\n"
         "  ].filter(Boolean).join('\\n');")
assert c["jsCode"].count(ancla) == 1, f"ancla encontrada {c['jsCode'].count(ancla)} veces"
c["jsCode"] = c["jsCode"].replace(ancla, nuevo)
json.dump(w, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False)
print("ok")
