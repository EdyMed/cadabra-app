# CRM Empresarial WhatsApp — Cadabra (fuente de verdad)

Reconstrucción del producto "Workflow WhatsApp PRO con CRM Autónomo" (Innovarketing)
**adaptada al stack Cadabra**. La clínica de nutrición fue solo la plantilla de ejemplo;
el CRM real sigue la **línea de negocio del módulo de ventas**:
**panadería/pastelería MAYORISTA B2B** (empanadas, pasteles, pan; vende al por mayor a
restaurantes, sushis y almacenes). Es el mismo negocio del agente WhatsApp "Sofía".

> **Nota de alcance:** este CRM es un producto **complementario** al agente de ventas.
> Los archivos están en `app/Modulo ventas/crm-empresarial/` y la tabla en el proyecto
> Supabase del agente, reutilizando su infraestructura (agente WhatsApp, tools de agenda,
> conexión, patrón SQL). La tabla `crm_leads` está **aislada** — sin FKs con
> `movimientos_ventas`/`clientes`/las 144 tablas del ERP — pero modela el MISMO negocio:
> captación y seguimiento de **clientes mayoristas** vía WhatsApp. A futuro puede
> enlazarse con `clientes` (por RUT) cuando un lead se convierte en cliente del ERP.

Arquitectura de 2 escenarios: (1) Validación+Registro (guardas Chatwoot, anti-duplicados,
buffer) → (2) Agente IA+Respuesta (multimodal Whisper/Vision/PDF + TTS, update CRM).

> **⚠️ CAMBIO DE ARQUITECTURA (2026-08-16): NocoDB es la FUENTE DE VERDAD de los leads.**
> Tras varios problemas conectando NocoDB a Supabase (superusuario que ignora el schema,
> RLS, search_path), se decidió que la tabla **`crm_leads` viva NATIVA dentro de NocoDB**,
> no en Supabase. El bot (n8n) escribe los leads vía la **API REST de NocoDB**, no con un
> nodo Postgres. Supabase ya NO guarda leads del CRM. Esto elimina el problema de
> permisos/schema de raíz.
>
> Consecuencias:
> - La tabla se crea importando `nocodb/crm_leads_demo.csv` en NocoDB (Import Data).
> - La Fase 2 (n8n) usa el nodo/HTTP de la **API de NocoDB** (necesita URL base + API Token
>   de NocoDB → Account Settings → Tokens), NO Postgres.
> - Los scripts SQL de Supabase (`10/20/30/40/50_*.sql`) quedan como **legado/opcional**:
>   solo se usarían si algún día se quiere el CRM en Postgres. La tabla `crm.crm_leads` en
>   Supabase puede dejarse o eliminarse; no es la fuente de verdad.

- **Datos (fuente de verdad):** NocoDB (tabla `crm_leads` nativa).
- **Motor:** workflow n8n **"Agente Whatsap CRM Empresarial"** (nuevo, clon del multimodal
  `nI1fEpupB3WKHgZ2` — el original NO se toca) → escribe en NocoDB vía API.
- **Handoff humano:** Chatwoot (obligatorio por políticas Meta 2025).

Plan completo por fases: `C:\Users\admin\.claude\plans\que-hace-el-sgte-snazzy-moon.md`.

---

## Estado

### ✅ Fase 1 — CRM base + UI (BD lista)
- `sql/10_crm_schema.sql` ejecutado en `cexowmypklxngbjsxryf`: tabla `public.crm_leads`
  (negocio mayorista B2B) con checks de embudo/agendamiento, 5 índices, trigger
  `moddatetime`, RLS force deny-by-default (service_role bypassa). Idempotente.
- `sql/20_crm_seeds_demo.sql`: 17 leads mayoristas demo (empresa=1) — locales de comida
  (restaurantes, sushis, almacenes, cafeterías, casinos) de Santiago. Distribución
  verificada: 9 estados del embudo poblados; vistas: Clientes=6, con visita=3,
  Recuperar=3, Requiere Vendedor=2. Vendedor 1=8, Vendedor 2=7. Empanadas es el
  producto de interés líder (6).
- **Pendiente de Fase 1:** montar NocoDB sobre Supabase y crear las 5 vistas (ver abajo).

### 🔜 Fase 2 — Agente escribe en el CRM (workflow nuevo)
Tools `crm_upsert_lead` + `crm_actualizar_estado` + prompt del negocio (panadería
mayorista, reutilizando el de "Sofía"), en el workflow nuevo "Agente Whatsap CRM
Empresarial" (clon del multimodal). NO tocar `nI1fEpupB3WKHgZ2`.

### 🔜 Fase 3 — Escenario 1 (guardas + buffer)   ### 🔜 Fase 4 — Chatwoot   ### 🔜 Fase 5 — TTS

---

## Modelo de datos — `public.crm_leads`

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| empresa | integer | tenant (= ERP.empresa). Demo = 1 |
| nombre | text | persona de contacto |
| nombre_negocio | text | razón social / local del cliente mayorista |
| contact_id, phone, email | text | contact_id = wa_id (dedup). `unique(empresa, contact_id)` |
| comuna | text | para ruteo de reparto |
| origen_lead | text | whatsapp / Link Directo / Referido / Feria / Otro |
| producto_interes | text | Empanadas / Pasteles / Pan / Sopaipillas / Mixto / Otro (familias del catálogo) |
| estado_crm | text | **embudo** (9 estados, ver abajo). Default 'Nuevo Lead' |
| vendedor_asignado | text | reparte cartera (los 2 vendedores reales) |
| condicion_pago | text | Efectivo / Cheque / Crédito 7d |
| estado_agendamiento | text | Pendiente / Confirmado / Cancelado (visita del vendedor) |
| fecha_agendamiento, hora_cita | date / time | visita/reunión agendada |
| bot_activo | boolean | false = humano/vendedor tomó (Chatwoot ON/OFF). Default true |
| ultima_interaccion | timestamptz | expiración de sesión (guarda Escenario 1) |
| comercial_id, notas | text | |
| created_at, updated_at | timestamptz | updated_at por trigger moddatetime |

**Embudo (estado_crm):** Nuevo Lead · En Conversación · Cotización Enviada · Primer Pedido ·
Cliente Activo · Cliente Recurrente · Sin Respuesta · Requiere Vendedor · Inactivo.

---

## Montar NocoDB sobre Supabase (Fase 1, pendiente de infra)

> **La tabla vive en el schema `crm`** (no en `public`), para que NocoDB muestre SOLO el
> CRM y no las 149 tablas del ERP/agente. Al conectar la fuente externa en NocoDB, apuntar
> al schema `crm`. Script que hizo el move: `sql/30_mover_a_schema_crm.sql` (ya ejecutado).
>
> NocoDB guarda SUS metadatos en su propio Postgres/SQLite (en EasyPanel); Supabase entra
> solo como **data source externa**.

**Reconexión al schema `crm` (si ya conectaste apuntando a `public` y ves todo el ERP):**
- En la fuente de datos de NocoDB, editar la conexión y fijar el **Schema = `crm`** (algunos
  builds lo piden al crear la fuente; otros filtran por schema en los ajustes de la base).
- Si tu versión no permite elegir schema, borrar esa fuente y crearla de nuevo: al inferir
  el esquema, solo traerá `crm.crm_leads`. Data Source Name libre, Connection = la de Supabase,
  Database = `postgres`, y el schema `crm`.

1. **Desplegar NocoDB** (EasyPanel/Docker, mismo servidor de n8n). Imagen `nocodb/nocodb`.
   Variable `NC_DB` → su propio Postgres de metadatos (NO el de Supabase).
2. **Conectar Supabase como fuente externa:** NocoDB → Connect External Data → Postgres:
   - Host: `aws-1-us-west-2.pooler.supabase.com`  Port: `5432`
   - Database: `postgres`  **Schema: `crm`**  User: `postgres.cexowmypklxngbjsxryf`  Password: (la del pooler)
   - SSL: require. Permisos: Allow Data Write/Edit = ON, Allow Schema Change = OFF.
   - (Para producción, crear un rol dedicado con permisos solo sobre el schema `crm`.)
3. **Nota RLS:** `crm_leads` tiene RLS force + deny-by-default. El rol `postgres`/service_role
   bypassa; un rol nuevo restringido necesitará policy o bypassrls. Definir según el usuario
   con que conecte NocoDB.
4. **Colores por estado:** convertir `estado_crm` y `estado_agendamiento` a campo Single Select
   en NocoDB (mismos valores del check, carácter por carácter) y asignar color a cada opción.
5. **Crear las 5 vistas:**
   - **1. Calendario** — vista Calendar sobre `fecha_agendamiento` (+ `hora_cita`). Visitas del vendedor.
   - **2. Requiere Vendedor** — Grid, filtro `estado_crm = Requiere Vendedor`.
   - **3. Visitas de Hoy** — Grid, filtro `fecha_agendamiento = today()`.
   - **4. Recuperar** — Grid, filtro `estado_crm` in (Sin Respuesta, Inactivo).
   - **5. Clientes** — Grid, filtro `estado_crm` in (Cliente Activo, Cliente Recurrente).

   (Extra útil: una vista **Por Vendedor** agrupada por `vendedor_asignado` para repartir cartera.)

---

## Ejecutar el SQL (referencia)

psql 15 (`C:\Program Files\PostgreSQL\15\bin\psql.exe`), vía pooler. Lecciones Windows:
usar **connection URI** con las opciones ANTES de `-d` (no `key=value` posicional), y correr
los queries con tildes **desde archivo UTF-8** (el `-c` inline rompe encoding en la consola).

```powershell
$env:PGPASSWORD='***'            # pass del pooler (rotar; ver ROTACION_CREDENCIALES.md del agente)
$psql = "C:\Program Files\PostgreSQL\15\bin\psql.exe"
$uri  = "postgresql://postgres.cexowmypklxngbjsxryf@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require"
& $psql -v ON_ERROR_STOP=1 -d $uri -f "sql\10_crm_schema.sql"
& $psql -v ON_ERROR_STOP=1 -d $uri -f "sql\20_crm_seeds_demo.sql"
```

## Archivos

- `sql/10_crm_schema.sql` — schema `crm` + tabla + índices + trigger + RLS + grants (idempotente).
- `sql/20_crm_seeds_demo.sql` — 17 leads mayoristas demo (idempotente por `on conflict`).
- `sql/30_mover_a_schema_crm.sql` — mueve `public.crm_leads` → `crm.crm_leads` (ya ejecutado; solo se necesita si se recrea en `public`).
- `sql/40_grants_nocodb.sql` — grants + policy RLS permisiva (`using(true)`, DEMO) para que NocoDB lea/edite conectado como `authenticated`/`anon`. Ya ejecutado.
- `CRM.md` — este documento.

> **Fix "No tables" en NocoDB (2026-08-16):** NocoDB conecta con un rol de app
> (`authenticated`), que tras el move NO tenía SELECT y además el RLS force+deny-all lo
> bloqueaba. Solución (`40_grants_nocodb.sql`): grants CRUD sobre `crm.crm_leads` +
> una policy `for all to authenticated,anon,service_role using(true)`. Verificado:
> `set role authenticated; select count(*)` → 17. **Para producción multi-tenant**, cambiar
> `using(true)` por filtro `empresa = <tenant>`.

> **Nota:** la tabla ya está en `crm.crm_leads`. Los scripts base (10/20) ya apuntan a `crm`.
> Todo query o tool del agente debe usar `crm.crm_leads` (no `public.crm_leads`).
