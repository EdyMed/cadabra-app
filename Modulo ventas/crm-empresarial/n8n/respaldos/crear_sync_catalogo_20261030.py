"""Arma (1) el workflow nuevo "Sync catálogo (Google Sheets)" y (2) el parche del bot para que
stock_producto busque en la fuente de catálogo que indique la ficha.
Uso: python crear_sync_catalogo.py <main_in.json> <main_out.json> <sync_out.json>"""
import json
import sys
import uuid

main_in, main_out, sync_out = sys.argv[1:4]
PG_RW = {"postgres": {"id": "BIM03WKClC8bnUc8", "name": "Supabase Ventas (RW)"}}

# ------------------------------------------------------------------ workflow de sincronización
LEER_Y_PREPARAR = r"""// Lee la planilla de cada empresa (exportada como CSV, compartida "cualquiera con el enlace")
// y la convierte en filas limpias para catalogo_productos.
const quitarTildes = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
function parseCSV(txt) {
  const filas = []; let fila = [], campo = '', comillas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (comillas) {
      if (c === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else comillas = false; }
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter(f => f.some(x => String(x).trim() !== ''));
}
function precio(v) {
  let s = String(v || '').replace(/[$\s]/g, '');
  if (!s) return null;
  if (s.includes('.') && s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');      // 1.290,50
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');                        // 1.290
  else s = s.replace(',', '.');                                                             // 1290,5
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function disponible(v) {
  const s = quitarTildes(v).trim().toLowerCase();
  if (!s) return true;
  return !['no', 'false', '0', 'agotado', 'sin stock'].includes(s);
}
const out = [];
for (const it of $input.all()) {
  const empresa = it.json.empresa;
  const f = it.json.fuente || {};
  try {
    if (!f.sheet_id) throw new Error('La ficha no tiene fuentes.catalogo.sheet_id');
    const url = `https://docs.google.com/spreadsheets/d/${f.sheet_id}/export?format=csv&gid=${f.gid || 0}`;
    const txt = String(await this.helpers.httpRequest({ method: 'GET', url, json: false }));
    if (txt.trim().startsWith('<')) throw new Error('La planilla no es pública: compártela como "Cualquier persona con el enlace puede ver"');
    const filas = parseCSV(txt);
    if (filas.length < 2) throw new Error('La planilla está vacía');
    const cab = filas[0].map(h => quitarTildes(h).trim().toLowerCase());
    const col = n => cab.indexOf(n);
    if (col('codigo') < 0 || col('nombre') < 0) throw new Error('Faltan las columnas obligatorias "codigo" y "nombre" en la fila 1');
    const vistos = new Set(), datos = [];
    for (const r of filas.slice(1)) {
      const g = n => (col(n) >= 0 ? String(r[col(n)] ?? '').trim() : '');
      const codigo = g('codigo'), nombre = g('nombre');
      if (!codigo || !nombre || vistos.has(codigo)) continue;
      vistos.add(codigo);
      datos.push({ codigo, nombre, categoria: g('categoria') || null, descripcion: g('descripcion') || null,
                   precio: precio(g('precio')), unidad: g('unidad') || null, disponible: disponible(g('disponible')) });
    }
    if (!datos.length) throw new Error('No hay filas válidas (cada producto necesita codigo y nombre)');
    out.push({ json: { empresa, ok: true, filas: datos, total: datos.length } });
  } catch (e) {
    out.push({ json: { empresa, ok: false, mensaje: String(e.message || e).slice(0, 400) } });
  }
}
return out;"""

GUARDAR_SQL = """with datos as (
  select * from jsonb_to_recordset($2::jsonb)
    as x(codigo text, nombre text, categoria text, descripcion text, precio numeric, unidad text, disponible boolean)
), up as (
  insert into public.catalogo_productos (empresa, codigo, nombre, categoria, descripcion, precio, unidad, disponible, fuente, actualizado_en)
  select $1::int, codigo, nombre, categoria, descripcion, precio, unidad, coalesce(disponible, true), 'google_sheets', now() from datos
  on conflict (empresa, codigo) do update set
    nombre = excluded.nombre, categoria = excluded.categoria, descripcion = excluded.descripcion,
    precio = excluded.precio, unidad = excluded.unidad, disponible = excluded.disponible,
    fuente = excluded.fuente, actualizado_en = now()
  returning codigo
), del as (
  delete from public.catalogo_productos p
   where p.empresa = $1::int and p.fuente = 'google_sheets'
     and not exists (select 1 from datos d where d.codigo = p.codigo)
  returning 1
)
insert into public.catalogo_sync (empresa, fuente, ok, filas, mensaje)
values ($1::int, 'google_sheets', true, (select count(*) from up), 'eliminados: ' || (select count(*) from del))
returning empresa, ok, filas, mensaje;"""

EMPRESAS_SQL = """select c.empresa, c.config->'fuentes'->'catalogo' as fuente
from public.agente_empresas_config c
where c.config->'fuentes'->'catalogo'->>'tipo' = 'google_sheets'
  and (
    ($1::int > 0 and c.empresa = $1::int)
    or ($1::int <= 0 and coalesce(
          (select max(s.ejecutado_en) from public.catalogo_sync s where s.empresa = c.empresa and s.ok),
          'epoch'::timestamptz)
        < now() - make_interval(hours => coalesce((c.config->'fuentes'->'catalogo'->>'frecuencia_horas')::int, 6)))
  );"""


def n(name, typ, ver, pos, params, creds=None, **extra):
    d = {"id": str(uuid.uuid4()), "name": name, "type": typ, "typeVersion": ver, "position": pos, "parameters": params}
    if creds:
        d["credentials"] = creds
    d.update(extra)
    return d


sync = {
    "name": "Sync catálogo (Google Sheets)",
    "nodes": [
        n("Cada hora", "n8n-nodes-base.scheduleTrigger", 1.2, [0, 0],
          {"rule": {"interval": [{"field": "hours", "hoursInterval": 1}]}}),
        n("Webhook sync manual", "n8n-nodes-base.webhook", 2, [0, 220],
          {"httpMethod": "POST", "path": "sync-catalogo", "responseMode": "lastNode", "options": {}},
          webhookId=str(uuid.uuid4())),
        n("Empresas a sincronizar", "n8n-nodes-base.postgres", 2.6, [260, 100],
          {"operation": "executeQuery", "query": EMPRESAS_SQL,
           "options": {"queryReplacement": "={{ [ $json.body && $json.body.empresa ? Number($json.body.empresa) : 0 ] }}"}},
          PG_RW, alwaysOutputData=False),
        n("Leer y preparar planilla", "n8n-nodes-base.code", 2, [520, 100], {"jsCode": LEER_Y_PREPARAR}),
        n("¿Planilla OK?", "n8n-nodes-base.if", 2.2, [760, 100],
          {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
                          "conditions": [{"id": "c-ok", "leftValue": "={{ $json.ok }}", "rightValue": True,
                                          "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
                          "combinator": "and"}, "options": {}}),
        n("Guardar catálogo", "n8n-nodes-base.postgres", 2.6, [1000, 0],
          {"operation": "executeQuery", "query": GUARDAR_SQL,
           "options": {"queryReplacement": "={{ [ $json.empresa, JSON.stringify($json.filas) ] }}"}}, PG_RW),
        n("Registrar error", "n8n-nodes-base.postgres", 2.6, [1000, 220],
          {"operation": "executeQuery",
           "query": "insert into public.catalogo_sync (empresa, fuente, ok, mensaje) values ($1::int, 'google_sheets', false, $2) returning empresa, ok, mensaje;",
           "options": {"queryReplacement": "={{ [ $json.empresa, $json.mensaje ] }}"}}, PG_RW),
    ],
    "connections": {
        "Cada hora": {"main": [[{"node": "Empresas a sincronizar", "type": "main", "index": 0}]]},
        "Webhook sync manual": {"main": [[{"node": "Empresas a sincronizar", "type": "main", "index": 0}]]},
        "Empresas a sincronizar": {"main": [[{"node": "Leer y preparar planilla", "type": "main", "index": 0}]]},
        "Leer y preparar planilla": {"main": [[{"node": "¿Planilla OK?", "type": "main", "index": 0}]]},
        "¿Planilla OK?": {"main": [[{"node": "Guardar catálogo", "type": "main", "index": 0}],
                                   [{"node": "Registrar error", "type": "main", "index": 0}]]},
    },
    "settings": {"executionOrder": "v1", "timezone": "America/Santiago"},
}
json.dump(sync, open(sync_out, "w", encoding="utf-8"), ensure_ascii=False)

# ------------------------------------------------------------------ parche del bot
w = json.load(open(main_in, encoding="utf-8"))


def nodo(nombre):
    h = [x for x in w["nodes"] if x["name"] == nombre]
    assert len(h) == 1, nombre
    return h[0]


# perfil.fuente_catalogo (por defecto erp_supabase = comportamiento actual)
c = nodo("Consolidar contexto")["parameters"]
viejo = "calendar_id: String(ag.calendar_id || 'primary') }"
nuevo = ("calendar_id: String(ag.calendar_id || 'primary'), "
         "fuente_catalogo: String(((cfg.fuentes || {}).catalogo || {}).tipo || 'erp_supabase') }")
assert c["jsCode"].count(viejo) == 1
c["jsCode"] = c["jsCode"].replace(viejo, nuevo)

st = nodo("stock_producto")["parameters"]
q_vieja = st["query"]
assert q_vieja.strip().endswith("limit 12;"), "query de stock_producto inesperada"
cuerpo_erp = q_vieja.strip()[:-len("order by p.nombre\nlimit 12;")].rstrip()
assert cuerpo_erp.endswith(")"), "no se pudo aislar el WHERE del ERP"
q_nueva = cuerpo_erp.replace("select distinct p.nombre, p.precio_venta\nfrom public.productos p",
                             "select distinct p.nombre, p.precio_venta, null::text as unidad\nfrom public.productos p")
assert "null::text as unidad" in q_nueva
q_nueva = q_nueva.replace("where p.empresa = $1\n", "where $3 = 'erp_supabase'\n  and p.empresa = $1\n", 1)
assert "$3 = 'erp_supabase'" in q_nueva
# Rama catálogo propio (Google Sheets / tabla Cadabra): mismas reglas de palabras clave sobre nombre, categoría y descripción
q_nueva = q_nueva.replace("with q as (", "with q as (", 1)
q_nueva += """
union all
select c.nombre || case when c.disponible then '' else ' (agotado)' end, c.precio, c.unidad
from public.catalogo_productos c, q
where $3 <> 'erp_supabase'
  and c.empresa = $1
  and (
    lower(c.codigo) = lower($2)
    or ( array_length(q.palabras,1) is not null
         and not exists (
           select 1 from unnest(q.palabras) w
           where w not in ('de','al','la','el','los','las','y','con','producto','productos')
             and lower(c.nombre || ' ' || coalesce(c.categoria,'') || ' ' || coalesce(c.descripcion,'')) !~ ('\\y'||w||'\\y')
         )
       )
  )
order by 1
limit 12;"""
st["query"] = q_nueva
st["options"]["queryReplacement"] = (
    "={{ " + "$('Consolidar contexto').first().json.empresa }},"
    "{{ $fromAI('busqueda', 'palabras clave del producto, ej: mariscos o pino queso', 'string') }},"
    "{{ $('Consolidar contexto').first().json.perfil.fuente_catalogo }}")

json.dump(w, open(main_out, "w", encoding="utf-8"), ensure_ascii=False)
print("OK sync:", len(sync["nodes"]), "nodos | bot: stock_producto parametrizado")
print(q_nueva[-900:].encode("ascii", "replace").decode())
