"""La frase "si piden fuera de esto, ofrece otra opción" solo va si la empresa tiene días u horario
configurados. Con solo duración/lugar, la IA inventaba rechazos.
Uso: python patch_horario_condicional.py <in.json> <out.json>"""
import json
import sys

w = json.load(open(sys.argv[1], encoding="utf-8"))
c = [x for x in w["nodes"] if x["name"] == "Consolidar contexto"][0]["parameters"]
code = c["jsCode"]
ancla = "    horario ? '- ' + horario.trim() + ' Si el cliente pide"
assert code.count(ancla) == 1, f"ancla: {code.count(ancla)}"
ini = code.index(ancla)
fin = code.index("' : '',", ini) + len("' : '',")
frase_vieja = code[ini:fin]
resto = frase_vieja[len("    horario ? '- ' + horario.trim() + '"):-len("' : '',")]  # texto de la regla de rechazo
nueva = ("    horario ? '- ' + horario.trim() + (restringido ? '" + resto + "' : '') : '',")
code = code[:ini] + nueva + code[fin:]
# variable "restringido": hay días u horario definidos
ancla2 = "  let horario = '';\n"
assert code.count(ancla2) == 1, "no encontré 'let horario'"
code = code.replace(ancla2, "  let horario = '';\n  const restringido = (Array.isArray(ag.dias) && ag.dias.length > 0) || !!(ag.hora_inicio && ag.hora_fin);\n")
c["jsCode"] = code
json.dump(w, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False)
print("ok")
