"""Fase 0 · punto 4A — Aplica la rotación de los 6 roles Postgres del Panel (05-11-2026).

Lee las claves nuevas de app/Modulo ventas/.secretos_A_panel.env (generadas antes y ya pegadas en EasyPanel),
hace ALTER ROLE en Supabase, prueba el login de cada rol con su clave nueva y actualiza app/CRM Whatsap/.env.local
(guarda primero una copia .env.local.bak_20261105).

Uso:  PGPASSWORD=<clave postgres> python -I rotar_roles_panel_20261105.py
"""
import os, re, shutil, subprocess, sys

sys.stdout.reconfigure(encoding="utf-8")
AQUI = os.path.dirname(os.path.abspath(__file__))
APP = os.path.normpath(os.path.join(AQUI, "..", "..", "..", ".."))
SECRETOS = os.path.join(APP, "Modulo ventas", ".secretos_A_panel.env")
ENV_LOCAL = os.path.join(APP, "CRM Whatsap", ".env.local")
PSQL = r"C:\Program Files\PostgreSQL\15\bin\psql.exe"
PROY, HOST = "cexowmypklxngbjsxryf", "aws-1-us-west-2.pooler.supabase.com"
ROLES = {"NOCODB_PG_PASSWORD": "dashboard_ro", "CRM_RW_PG_PASSWORD": "dashboard_rw",
         "VEND_PG_PASSWORD": "dashboard_vendedores", "EMPRESA_PG_PASSWORD": "dashboard_empresa_rw",
         "ADMIN_PG_PASSWORD": "dashboard_admin", "WA_PG_PASSWORD": "dashboard_whatsapp"}


def psql(user, password, sql):
    env = {**os.environ, "PGPASSWORD": password}
    r = subprocess.run([PSQL, f"--dbname=host={HOST} port=5432 dbname=postgres user={user}.{PROY} sslmode=require",
                        "-At", f"--command={sql}"], capture_output=True, text=True, env=env)
    return r.returncode, (r.stdout + r.stderr).strip()


def main():
    claves = dict(re.findall(r"^([A-Z_]+)=(.+)$", open(SECRETOS, encoding="utf-8").read(), re.M))
    assert set(ROLES) <= set(claves), "faltan claves en .secretos_A_panel.env"
    admin_pw = os.environ["PGPASSWORD"]

    sql = "; ".join(f"alter role {r} with password '{claves[v]}'" for v, r in ROLES.items())
    rc, out = psql("postgres", admin_pw, f"begin; {sql}; commit;")
    print("ALTER ROLE x6:", rc, out.replace("\n", " "))
    if rc != 0:
        raise SystemExit("Falló el ALTER ROLE (transacción revertida, claves viejas siguen vigentes).")

    ok = True
    for v, r in ROLES.items():
        rc, out = psql(r, claves[v], "select current_user")
        print(f"  login {r}: {'OK' if rc == 0 else 'FALLA ' + out[:120]}")
        ok &= rc == 0

    shutil.copy2(ENV_LOCAL, ENV_LOCAL + ".bak_20261105")
    txt = open(ENV_LOCAL, encoding="utf-8").read()
    for v in ROLES:
        txt, n = re.subn(rf"^{v}=[^\r\n]*", f"{v}={claves[v]}", txt, flags=re.M)
        assert n == 1, v
    open(ENV_LOCAL, "w", encoding="utf-8", newline="").write(txt)
    print(".env.local actualizado (copia en .env.local.bak_20261105)")
    print("✅ Listo: ahora Implementar en EasyPanel." if ok else "⚠️ Algún login falló: revisar antes de implementar.")


if __name__ == "__main__":
    main()
