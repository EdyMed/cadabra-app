# Panel de Negocio — CRM WhatsApp (Cadabra)

App web del portal `Panel.cadabra.cl`: cada dueño de negocio entra con su login y ve **solo sus
datos** de leads/conversaciones captados por el Agente WhatsApp.

## Stack
- Next.js 14 (App Router) + TypeScript + Tailwind
- Supabase Auth (login)
- Postgres de NocoDB (datos de leads, solo lectura) vía `pg`
- Recharts (gráficos)

## Arquitectura
```
Navegador ─► Next.js (server) ─► Postgres NocoDB (crm_leads, solo lectura, filtrado por empresa)
   │ login          │ sesión + tenant
   └─ Supabase Auth ┘
```
El navegador nunca toca la BD. Cada request server-side valida la sesión, resuelve la `empresa`
del usuario (tabla `dashboard_usuarios` en Supabase) y filtra los leads por esa empresa.

## Puesta en marcha (local)

1. **Reactivar Supabase** si está pausado (panel Supabase → Resume).

2. **SQL — una vez:**
   - En Supabase (SQL Editor): correr `sql/01_supabase_dashboard_usuarios.sql`.
   - En el Postgres de NocoDB (`psql -U postgres -d appcadabra`): correr
     `sql/02_nocodb_add_empresa_y_dash_ro.sql` (agrega columna `empresa` + crea usuario `dash_ro`).

3. **Crear usuario demo:** Supabase → Authentication → Add user (email+password). Copiar su UUID
   y ejecutar el `insert` comentado al final de `sql/01...` con ese UUID (empresa=1).

4. **Variables:** copiar `.env.example` a `.env.local` y completar:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase → Settings → API)
   - `NOCODB_PG_*` (host, user `dash_ro`, password, `NOCODB_PG_SCHEMA=p14vch8or5d3r3s`)
   - En local, el Postgres de NocoDB corre en EasyPanel: usa la IP/host público o un túnel SSH.

5. **Instalar y correr:**
   ```bash
   npm install
   npm run dev
   ```
   Abrir http://localhost:3000 → redirige a /login.

## Estado (Entrega 1)
- ✅ Login + protección de rutas + multi-tenant (aislamiento por empresa)
- ✅ Dashboard: KPIs, actividad 7 días, ¿qué hizo tu agente?, embudo, eficiencia, vendedores
- ⏳ Próximas entregas: Alertas, "Pregúntale a tu negocio", Kanban, deploy EasyPanel

## Deploy (EasyPanel) — entrega posterior
`next.config.mjs` usa `output: "standalone"`. Se añadirá Dockerfile.
