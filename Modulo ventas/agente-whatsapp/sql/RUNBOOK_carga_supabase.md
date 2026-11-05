# Runbook — Carga del ERP + Agente en Supabase (proyecto nuevo)

Proyecto destino: **`cexowmypklxngbjsxryf`** → https://cexowmypklxngbjsxryf.supabase.co
Estado: **vacío** (sin tablas, sin `usuarios`).
Objetivo: dejar el proyecto con las **144 tablas del ERP + datos (749.699 filas)** y las
**5 tablas del agente**, listo para conectar n8n.

> El backup pesa **249 MB / 751.417 líneas** → NO cabe en el SQL Editor web.
> Por eso se carga con **psql** (cliente de línea de comandos).

---

## Paso 0 — Requisitos (una sola vez)

### 0.1 Instalar psql (cliente PostgreSQL) en Windows
Opción rápida con winget (PowerShell):
```powershell
winget install PostgreSQL.PostgreSQL.17
```
Luego cierra y reabre la terminal. Verifica:
```powershell
psql --version    # debe imprimir: psql (PostgreSQL) 17.x
```
> Si `psql` no queda en PATH, está en `C:\Program Files\PostgreSQL\17\bin\psql.exe`.

### 0.2 Obtener la connection string del proyecto nuevo
Supabase → tu proyecto → **Project Settings → Database → Connection string → URI**.
Usa el modo **Session** (puerto 5432) o **Transaction pooler** (6543) para cargas grandes.
Se ve así (copia la tuya, incluye tu contraseña):
```
postgresql://postgres.cexowmypklxngbjsxryf:TU_PASSWORD@aws-0-<region>.pooler.supabase.com:5432/postgres
```
> Guarda esa URI; abajo la usamos como `$DB`.

---

## Paso 1 — Definir la conexión (PowerShell)

```powershell
# Pega TU connection string real aquí:
$DB = "postgresql://postgres.cexowmypklxngbjsxryf:TU_PASSWORD@aws-0-XXXX.pooler.supabase.com:5432/postgres"

# Carpeta con los SQL del ERP:
$OUT   = "D:\Cadabra - Power BI\Integracion y Automatizacion-2026\app\Modulo ventas\output"
$BACK  = "D:\Cadabra - Power BI\Integracion y Automatizacion-2026\app\Modulo ventas\backups"
$AGENT = "D:\Cadabra - Power BI\Integracion y Automatizacion-2026\app\Modulo ventas\agente-whatsapp\sql"
```

Prueba de conexión antes de cargar nada:
```powershell
psql $DB -c "select version();"
```
Debe imprimir la versión de PostgreSQL 17. Si falla → revisa password/región/puerto.

---

## Paso 2 — Cargar en ORDEN (cada comando espera al anterior)

> `-v ON_ERROR_STOP=1` aborta al primer error (no seguir a ciegas).
> `-f` ejecuta el archivo. Los tiempos son estimados.

```powershell
# 2.1 ESQUEMA — crea las 144 tablas (~148 KB, segundos)
psql $DB -v ON_ERROR_STOP=1 -f "$OUT\01_schema.sql"

# 2.2 DATOS — backup FILTRADO a 2025-2026 (~54 MB, 209.396 filas). Más rápido.
#      Maestras completas + transaccionales solo desde 2025-01-01.
#      (Si quisieras TODO el histórico, usa backup_ventas_2026-07-09.sql en su lugar.)
psql $DB -f "$BACK\backup_ventas_desde_2025.sql"

# 2.3 ÍNDICES (~45 KB)
psql $DB -v ON_ERROR_STOP=1 -f "$OUT\05_indexes.sql"

# 2.4 FUNCIONES (~1 KB)
psql $DB -v ON_ERROR_STOP=1 -f "$OUT\03_functions.sql"

# 2.5 RLS del ERP — depende de public.usuarios (ya creada en 2.1). (~68 KB)
psql $DB -v ON_ERROR_STOP=1 -f "$OUT\02_rls.sql"

# 2.6 AGENTE — las 5 tablas del bot + RLS deny-by-default + rol read-only (comentado)
psql $DB -v ON_ERROR_STOP=1 -f "$AGENT\10_agente_schema.sql"
```

> **Orden importa:** esquema → datos → índices → funciones → RLS → agente.
> Cargar índices DESPUÉS de los datos hace la inserción mucho más rápida.

---

## Paso 3 — Verificación

```powershell
# ¿Cuántas tablas hay? (esperado: ~149 = 144 ERP + 5 agente)
psql $DB -c "select count(*) from information_schema.tables where table_schema='public';"

# Conteos de las tablas núcleo (deben coincidir con el reporte de migración):
psql $DB -c "select
  (select count(*) from movimientos_ventas) as movimientos,
  (select count(*) from facturas_venta)     as facturas,
  (select count(*) from clientes)           as clientes,
  (select count(*) from productos)          as productos;"
# Esperado aprox: movimientos=455962, facturas=7420, clientes=360, productos=169

# ¿Las 5 tablas del agente existen?
psql $DB -c "select table_name from information_schema.tables
  where table_schema='public'
    and (table_name like 'agente_%' or table_name='conversation_history')
  order by 1;"
```

---

## Paso 4 — Rol read-only + Seeds (en el SQL Editor web, sí caben)

Estos son pequeños; puedes ejecutarlos en Supabase → SQL Editor:

1. **Rol read-only** para la tool `sql_readonly`: descomenta ese bloque en
   `10_agente_schema.sql`, cambia `'CAMBIA_ESTA_CLAVE'` por una contraseña real y ejecútalo.
2. **Seeds** (también en `10_agente_schema.sql`): descomenta e inserta
   - tu `phone_number_id` de Meta ↔ `empresa`
   - tu número (E.164) como `owner`

Para saber qué valor de `empresa` usar:
```powershell
psql $DB -c "select distinct empresa from clientes order by 1;"
```

---

## Notas y problemas comunes

- **`password authentication failed`** → revisa la password en la URI (la reseteas en
  Project Settings → Database → Reset database password).
- **`SSL required`** → añade `?sslmode=require` al final de la URI.
- **Carga muy lenta** → usa el **pooler en modo Session (5432)**; para 249 MB tarda
  típicamente 3-10 min según red.
- **Reintentar**: `01_schema.sql`, `05_indexes.sql`, `10_agente_schema.sql` son
  idempotentes (`IF NOT EXISTS`). El backup de datos NO: si lo cargas dos veces habrá
  duplicados. Si necesitas re-cargar datos, primero vacía con `truncate` o recrea el proyecto.
- **service_role vs psql**: psql con la connection string entra como `postgres`
  (propietario), por eso puede crear todo. El agente n8n usará la **service_role key**
  (API REST), que también bypassa RLS.

---

## Resumen de archivos

| Orden | Archivo | Qué hace | Tamaño |
|---|---|---|---|
| 1 | `output/01_schema.sql` | 144 tablas ERP | 148 KB |
| 2 | `backups/backup_ventas_desde_2025.sql` | Datos 2025-2026 (209.396 filas) | 54 MB |
| 3 | `output/05_indexes.sql` | Índices | 45 KB |
| 4 | `output/03_functions.sql` | Funciones | 1 KB |
| 5 | `output/02_rls.sql` | RLS ERP (por empresa) | 68 KB |
| 6 | `agente-whatsapp/sql/10_agente_schema.sql` | 5 tablas del agente | — |

### Sobre el backup filtrado (paso 2)

`backup_ventas_desde_2025.sql` lo genera el script
`agente-whatsapp/sql/filtrar_backup_por_fecha.py` a partir del backup completo:
- **Maestras/catálogo** (clientes 360, productos 169, vendedores, comunas…) → completas.
- **Transaccionales** → solo filas con fecha de negocio **>= 2025-01-01**.
- Resultado: 209.396 filas (vs 749.699). movimientos_ventas=81.313, guias=15.537,
  facturas=1.174. Boletas y notas de crédito/débito = 0 (no se usaron desde 2016).
- Para regenerarlo con otro rango: cambiar `FECHA_CORTE` en el script y re-ejecutar
  (`py filtrar_backup_por_fecha.py`).
