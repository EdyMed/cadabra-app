"""Fase 0 · punto 4 — Rota la clave de un rol Postgres que usa una credencial de n8n (05-11-2026).

  python -I rotar_rol_pg_20261105.py agente_readonly wjPmZ5tTlYmg0JSR

1. Workflow temporal (webhook + nodo Postgres con la credencial) -> prueba la conexión ANTES.
2. Genera una clave nueva y la guarda en app/Modulo ventas/.secretos.env (no versionado).
3. ALTER ROLE ... PASSWORD (vía psql con el usuario postgres, clave en env PG_ADMIN_PASSWORD).
4. PATCH de la credencial n8n (prueba variantes de SSL hasta que conecte).
5. Prueba DESPUÉS y borra el workflow temporal.
"""
import json, os, re, secrets, string, subprocess, sys, time, urllib.error, urllib.request

sys.stdout.reconfigure(encoding="utf-8")
AQUI = os.path.dirname(os.path.abspath(__file__))
MV = os.path.normpath(os.path.join(AQUI, "..", "..", ".."))           # app/Modulo ventas
N8N = "https://appcadabra-cadabra-project.jmyxxj.easypanel.host"
KEY = re.search(r"^N8N_API_KEY=(.*)$", open(os.path.join(MV, ".env"), encoding="utf-8-sig").read(), re.M).group(1).strip().strip("\"'")
PSQL = r"C:\Program Files\PostgreSQL\15\bin\psql.exe"
PROY = "cexowmypklxngbjsxryf"
HOST = "aws-1-us-west-2.pooler.supabase.com"
ROL, CRED_ID = sys.argv[1], sys.argv[2]


def api(m, p, b=None):
    req = urllib.request.Request(N8N + "/api/v1" + p, data=json.dumps(b).encode() if b is not None else None, method=m,
                                 headers={"X-N8N-API-KEY": KEY, "content-type": "application/json"})
    try:
        return json.load(urllib.request.urlopen(req, timeout=60))
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{m} {p} -> {e.code}: {e.read().decode()[:400]}")


def probar(path):
    try:
        r = urllib.request.urlopen(urllib.request.Request(f"{N8N}/webhook/{path}", data=b"{}", method="POST"), timeout=40)
        return r.read().decode()[:200]
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code} {e.read().decode()[:200]}"


def main():
    path = f"temp-prueba-{ROL.replace('_', '-')}"
    wf = api("POST", "/workflows", {"name": f"TEMP prueba credencial {ROL} (borrar)", "settings": {"executionOrder": "v1"},
        "nodes": [
            {"name": "Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [0, 0], "webhookId": path,
             "parameters": {"httpMethod": "POST", "path": path, "responseMode": "lastNode", "options": {}}},
            {"name": "Postgres", "type": "n8n-nodes-base.postgres", "typeVersion": 2.6, "position": [240, 0],
             "credentials": {"postgres": {"id": CRED_ID, "name": "x"}}, "onError": "continueRegularOutput",
             "parameters": {"operation": "executeQuery", "query": "select current_user as usuario, 1 as ok", "options": {}}}],
        "connections": {"Webhook": {"main": [[{"node": "Postgres", "type": "main", "index": 0}]]}}})
    try:
        api("POST", f"/workflows/{wf['id']}/activate")
        time.sleep(2)
        antes = probar(path)
        print("ANTES:", antes)
        if '"ok":1' not in antes.replace(" ", ""):
            raise SystemExit("La credencial no conecta ANTES de rotar: no sigo.")

        clave = "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(28))
        with open(os.path.join(MV, ".secretos.env"), "a", encoding="utf-8") as f:
            f.write(f"# {time.strftime('%Y-%m-%d %H:%M')} rol {ROL} (credencial n8n {CRED_ID})\nPG_{ROL.upper()}_PASSWORD={clave}\n")

        r = subprocess.run([PSQL, f"--dbname=host={HOST} port=5432 dbname=postgres user=postgres.{PROY} sslmode=require",
                            "-At", f"--command=alter role {ROL} with password '{clave}'"],
                           capture_output=True, text=True, env={**os.environ})
        print("ALTER ROLE:", r.stdout.strip(), r.stderr.strip())
        if r.returncode != 0:
            raise SystemExit("ALTER ROLE falló; la clave vieja sigue vigente.")

        base = {"host": HOST, "database": "postgres", "user": f"{ROL}.{PROY}", "password": clave, "port": 5432,
                "maxConnections": 100}
        for variante in ({"ssl": "allow", "allowUnauthorizedCerts": True}, {"ssl": "require", "allowUnauthorizedCerts": True},
                         {"ssl": "disable"}):
            api("PATCH", f"/credentials/{CRED_ID}", {"data": {**base, **variante}})
            time.sleep(1)
            despues = probar(path)
            print("DESPUÉS", variante, ":", despues)
            if '"ok":1' in despues.replace(" ", ""):
                print("✅ Rotado y verificado.")
                return
        print("🔴 La credencial nueva no conecta con ninguna variante: revisar en n8n → Credentials.")
    finally:
        api("POST", f"/workflows/{wf['id']}/deactivate")
        api("DELETE", f"/workflows/{wf['id']}")
        print("workflow temporal borrado")


if __name__ == "__main__":
    main()
