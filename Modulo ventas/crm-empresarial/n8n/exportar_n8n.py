"""Exporta TODOS los workflows de n8n a n8n/prod/ (un archivo por workflow, nombre estable por id)
para versionarlos en git. Quita campos volátiles para que el diff muestre solo cambios reales.

Uso (desde cualquier carpeta):
    python -I exportar_n8n.py                 # solo exporta
    python -I exportar_n8n.py --commit "msg"  # exporta + git add n8n/prod + commit si hubo cambios
"""
import json, os, re, subprocess, sys, urllib.request

sys.stdout.reconfigure(encoding="utf-8")
AQUI = os.path.dirname(os.path.abspath(__file__))
ENV = os.path.normpath(os.path.join(AQUI, "..", "..", ".env"))          # app/Modulo ventas/.env
BASE = "https://appcadabra-cadabra-project.jmyxxj.easypanel.host/api/v1"
DESTINO = os.path.join(AQUI, "prod")
VOLATILES = {"updatedAt", "createdAt", "versionId", "activeVersionId", "versionCounter", "staticData",
             "shared", "triggerCount", "meta", "pinData", "activeVersion"}

KEY = re.search(r"^N8N_API_KEY=(.*)$", open(ENV, encoding="utf-8-sig").read(), re.M).group(1).strip().strip("\"'")


def get(p):
    req = urllib.request.Request(BASE + p, headers={"X-N8N-API-KEY": KEY, "accept": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=60))


def limpiar(w):
    w = {k: v for k, v in w.items() if k not in VOLATILES}
    w["nodes"] = sorted(w.get("nodes", []), key=lambda n: n["name"])
    return w


def main():
    os.makedirs(DESTINO, exist_ok=True)
    wfs, cur = [], None
    while True:
        d = get("/workflows?limit=100" + (f"&cursor={cur}" if cur else ""))
        wfs += d["data"]
        cur = d.get("nextCursor")
        if not cur:
            break
    vivos = set()
    indice = []
    for w in sorted(wfs, key=lambda x: x["id"]):
        full = limpiar(get(f"/workflows/{w['id']}"))
        slug = re.sub(r"[^a-z0-9]+", "-", w["name"].lower().encode("ascii", "ignore").decode()).strip("-")[:50]
        fn = f"{w['id']}__{slug}.json"
        vivos.add(fn)
        with open(os.path.join(DESTINO, fn), "w", encoding="utf-8", newline="\n") as f:
            json.dump(full, f, ensure_ascii=False, indent=2, sort_keys=True)
            f.write("\n")
        indice.append(f"| {'🟢' if w['active'] else '⚪'} | `{w['id']}` | {w['name']} | {len(full['nodes'])} |")
    for fn in os.listdir(DESTINO):            # workflows borrados en n8n -> se borran aquí también
        if fn.endswith(".json") and fn not in vivos:
            os.remove(os.path.join(DESTINO, fn))
    with open(os.path.join(DESTINO, "README.md"), "w", encoding="utf-8", newline="\n") as f:
        f.write("# Workflows n8n en producción (export automático)\n\nGenerado por `../exportar_n8n.py`. "
                "No editar a mano: los cambios se hacen en n8n (o por API) y se vuelven a exportar.\n\n"
                "| Activo | Id | Nombre | Nodos |\n|---|---|---|---|\n" + "\n".join(indice) + "\n")
    print(f"{len(vivos)} workflows exportados a {DESTINO}")

    if "--commit" in sys.argv:
        msg = sys.argv[sys.argv.index("--commit") + 1] if len(sys.argv) > sys.argv.index("--commit") + 1 else "n8n: export"
        subprocess.run(["git", "add", "-A", DESTINO], cwd=AQUI, check=True)
        if subprocess.run(["git", "diff", "--cached", "--quiet", "--", DESTINO], cwd=AQUI).returncode == 0:
            print("sin cambios en n8n, no hay commit")
        else:
            subprocess.run(["git", "commit", "-m", msg, "--", DESTINO], cwd=AQUI, check=True)


if __name__ == "__main__":
    main()
