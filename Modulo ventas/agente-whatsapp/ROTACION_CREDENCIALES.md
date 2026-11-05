# 🔒 Rotación de credenciales — Agente WhatsApp Ventas

Guía para rotar las 3 credenciales pendientes antes de producción.
Ordenadas por urgencia. Marca cada casilla al completarla.

> Contexto: son acciones en interfaces externas (n8n, Supabase). El SQL ya está
> preparado en `sql/50_rotar_credenciales.sql`. Fuente de verdad del diseño: `CLAUDE.md`.

---

## 1. 🔴 URGENTE — Rotar API Key de n8n (expira 2026-08-13)

La API Key actual expira en pocos días. Al expirar, no podrás gestionar el workflow
por API (deploys, activación). El workflow YA activo seguiría corriendo, pero pierdes
el control programático.

**Pasos (n8n → `https://appcadabra-cadabra-project.jmyxxj.easypanel.host`):**

- [ ] Entrar a n8n → menú usuario (abajo izq.) → **Settings** → **n8n API**.
- [ ] **Create an API key** (nueva). Copiar el valor UNA vez (no se vuelve a mostrar).
- [ ] Guardarla en tu gestor de contraseñas (NO pegarla en el chat).
- [ ] **Revocar / eliminar** la API key vieja (la que expira el 2026-08-13).
- [ ] Actualizar la clave donde la uses para deploys (script de generación de workflow,
      variable de entorno, etc.). Si no automatizas deploys ahora mismo, basta con
      tenerla guardada para la próxima vez.

> Nota: rotar la API key NO afecta las credenciales internas del workflow (Supabase,
> OpenAI, Meta, Google). Solo cambia cómo te autenticas TÚ contra la API de n8n.

---

## 2. 🟠 Cambiar contraseña del rol read-only de Supabase (`agente_readonly`)

Hoy es `123456` (temporal, quedó escrita en scripts). La usa la tool `stock_producto`
y las demás tools de consulta.

**Paso 2.1 — Elegir contraseña nueva y editar el SQL:**
- [ ] Abrir `sql/50_rotar_credenciales.sql`.
- [ ] Reemplazar `<<<NUEVA_CLAVE_READONLY>>>` por una contraseña fuerte
      (≥16 caracteres, sin comillas simples `'`).

**Paso 2.2 — Ejecutar el SQL con psql (usa la connection RW / owner):**
- [ ] Obtener la connection string RW: Supabase dashboard → botón verde **Connect**
      → **Session pooler** (puerto 5432).
- [ ] En PowerShell:
      ```powershell
      $psql = "C:\Program Files\PostgreSQL\15\bin\psql.exe"
      $DB   = "postgresql://postgres.cexowmypklxngbjsxryf:<PASS_RW>@aws-1-us-west-2.pooler.supabase.com:5432/postgres"
      & $psql --dbname="$DB" --file="D:\Cadabra - Power BI\Integracion y Automatizacion-2026\app\Modulo ventas\agente-whatsapp\sql\50_rotar_credenciales.sql"
      ```
- [ ] Verificar en la salida: `rolcanlogin = t` y `rolbypassrls = t`
      (bypassrls DEBE quedar en `t`, si no la tool deja de encontrar productos).

**Paso 2.3 — Actualizar la MISMA contraseña en n8n:**
- [ ] n8n → **Credentials** → `Supabase Ventas (Read-Only)` → cambiar el campo
      **Password** por la nueva → **Save** → **Test connection**
      (debe decir "Connection tested successfully").
- [ ] Recordatorio: esa credencial necesita **"Ignore SSL Issues" = ON** y el host
      escrito a mano `aws-1-us-west-2.pooler.supabase.com` (un carácter invisible
      dio "host not found" antes).

**Paso 2.4 — Probar el bot:**
- [ ] Escribir a Sofía por WhatsApp: "¿tienen empanadas de mariscos?" → debe responder
      con productos y precios (si falla, revisar la credencial RO en n8n).

---

## 3. 🟠 Rotar la contraseña de la DB (`Motoco.2026`) — pasó por el chat

La contraseña del usuario `postgres` de Supabase se compartió por chat, así que conviene
rotarla. OJO: esto afecta a TODAS las credenciales RW que la usan.

**Paso 3.1 — Cambiarla en Supabase:**
- [ ] Supabase dashboard → **Project Settings** → **Database** → **Reset database password**.
- [ ] Generar/definir una nueva y guardarla en el gestor.

**Paso 3.2 — Actualizarla en TODAS partes que la usan:**
- [ ] n8n → credencial **Supabase Ventas (Read-Write)** (la usan ~4 nodos:
      memoria, guardar turno, etc.) → campo Password → nueva → Save → Test.
- [ ] Cualquier script local que use la connection RW (scripts de migración en
      `scripts/`, el `.env` de `Modulo ventas/` si guarda la pass RW).
- [ ] Probar el bot de nuevo (memoria: que guarde y recupere el historial).

> Si prefieres minimizar el impacto: la contraseña del rol `agente_readonly` (punto 2)
> es la más importante de rotar porque es la que "toca" el LLM. La del `postgres` (punto 3)
> es owner de la base; rótala también, pero ten a mano dónde se usa antes de cambiarla
> para no dejar nodos caídos.

---

## Después de rotar todo

- [ ] Actualizar `ESTADO.md`: marcar la tarea de seguridad como HECHA.
- [ ] Confirmar que estos valores temporales YA NO existen en ningún lado:
      `123456`, `Motoco.2026`, la API key vieja de n8n.
- [ ] Los scripts `20_seeds_y_readonly.sql` y `50_rotar_credenciales.sql` contienen
      contraseñas de ejemplo/placeholder — no subir a repos públicos.
