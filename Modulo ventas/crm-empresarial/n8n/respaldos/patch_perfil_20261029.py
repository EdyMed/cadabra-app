"""Etapas 1+2: ficha del agente por empresa (perfil) + agenda parametrizada.
Uso: python patch_perfil.py <main_in.json> <main_out.json> <sql_out.sql>
Extrae del prompt ACTUAL los bloques de la panadería para la ficha de la empresa 1 (Sofía
queda igual) y reemplaza esos bloques en el workflow por variables de la ficha.
Cada reemplazo se verifica; si algo no calza, aborta sin escribir nada."""
import json
import sys
import uuid
import copy

main_in, main_out, sql_out = sys.argv[1:4]
w = json.load(open(main_in, encoding="utf-8"))
CTX = "$('Consolidar contexto').first().json"


def nodo(nombre):
    hits = [n for n in w["nodes"] if n["name"] == nombre]
    assert len(hits) == 1, f"nodo no encontrado o duplicado: {nombre}"
    return hits[0]


def entre(texto, ini, fin):
    a = texto.index(ini)
    b = texto.index(fin, a)
    return a, b


def reemplazar(texto, viejo, nuevo, veces=1):
    n = texto.count(viejo)
    assert n == veces, f"'{viejo[:70]}' aparece {n} veces (esperado {veces})"
    return texto.replace(viejo, nuevo)


# ---------------------------------------------------------------- prompt
agente = nodo("AI Agent")["parameters"]["options"]
P = agente["systemMessage"]

# 1) Descripción del negocio (primer párrafo)
INI_DESC = "de {{ $json.nombre_empresa }}, "
a, b = entre(P, INI_DESC, "\n\n## Contexto de esta conversación")
desc_sofia = P[a + len(INI_DESC):b]
P = P[:a] + "de {{ $json.nombre_empresa }}{{ $json.perfil.descripcion }}" + P[b:]

# 2) Catálogo (familias, categorías, sinónimos y reglas de búsqueda)
a, b = entre(P, "## Catálogo (familias y sabores REALES)", "\n\n## Herramientas de gestión")
catalogo_sofia = P[a:b]
P = P[:a] + "{{ $json.perfil.catalogo }}" + P[b:]

# 3) Categorías del menú
CATS = "Empanadas 🥟, Pasteles, Pan, Sopaipillas, Insumos"
P = reemplazar(P, CATS, "{{ $json.perfil.categorias_menu }}")

# 4) Escalamiento
H_ESC = "## Escalamiento a un vendedor\n"
a, b = entre(P, H_ESC, "\n\n## CONTINUIDAD")
escal_sofia = P[a + len(H_ESC):b]
P = P[:a + len(H_ESC)] + "{{ $json.perfil.escalamiento }}" + P[b:]

# 5) Tono
H_TONO = "## TONO Y ESTILO — REEMPLAZA CUALQUIER INSTRUCCIÓN DE TONO ANTERIOR\n"
a, b = entre(P, H_TONO, "\n\n## AGENDAR REUNIÓN")
tono_sofia = P[a + len(H_TONO):b].replace("{{ $json.nombre_asistente }}", "{asistente}")
P = P[:a + len(H_TONO)] + "{{ $json.perfil.tono }}" + P[b:]

# 6) Agenda (se arma desde la ficha)
a = P.index("## AGENDAR REUNIÓN")
P = P[:a] + "{{ $json.perfil.agenda }}\n"

# 7) Información del negocio (horario, despacho, pagos, FAQ) — nueva sección
P = reemplazar(P, "\n\n## Mensajes multimodales", "\n\n{{ $json.perfil.info_negocio }}\n\n## Mensajes multimodales")

# 8) Ejemplos multimodales genéricos (sin empanadas)
P = reemplazar(P, "(una empanada, un pastel, pan, etc.)", "(algo de lo que vende el negocio)")
P = reemplazar(P, "pregúntale (\"¿son de pino, queso, mariscos...?\")", "pregúntale para precisar qué es")
P = reemplazar(P, '("¡Qué rica foto! Esa se ve como empanada de pino 🥟, déjame buscarte el precio...")',
               '("¡Qué buena foto! Déjame buscarte el precio...")')

# 9) Categorías válidas del CRM
LINEA_CRM = "- USA VALORES EXACTOS de estado/producto (con tildes). SIEMPRE en segundo plano: nunca menciones el CRM al cliente."
P = reemplazar(P, LINEA_CRM, LINEA_CRM + "\n- Categorías válidas para producto_interes: {{ $json.perfil.categorias_interes }} (o 'Otro' si no calza ninguna).")

P = reemplazar(P, '(ej. "¿te refieres a empanada de pino al horno o frita?")',
               "(ej. preguntándole qué tipo o variante busca)")

import re as _re
for _linea in P.split("\n"):
    if _re.search("mpanad|pastel|sopaipill|🥟", _linea):
        print("RESTO:", _linea[:220].encode("ascii", "replace").decode())
agente["systemMessage"] = P

# ---------------------------------------------------------------- datos de entrada
p = nodo("Resolver empresa")["parameters"]
p["query"] = ("select l.empresa, l.nombre_empresa, l.nombre_asistente,\n"
              "       coalesce(c.config, '{}'::jsonb) as config\n"
              "from public.agente_lineas_whatsapp l\n"
              "left join public.agente_empresas_config c on c.empresa = l.empresa\n"
              "where l.phone_number_id = $1 and l.activo = true\nlimit 1;")

p = nodo("Merge empresa+msg")["parameters"]
p["jsCode"] = reemplazar(p["jsCode"], "  nombre_asistente: empresaRow.nombre_asistente ?? 'Asistente',\n",
                         "  nombre_asistente: empresaRow.nombre_asistente ?? 'Asistente',\n  config: empresaRow.config || {},\n")

CONSOLIDAR = r"""const ctx = $('Determinar rol').first().json;
const rows = $input.all().map(i => i.json).filter(r => r && r.role && r.content).reverse();
const history = rows.map(r => ({ role: r.role, content: r.content }));
const historyText = history.map(h => h.role + ': ' + h.content).join('\n');

// ---- Ficha del agente por empresa (agente_empresas_config.config) ----
// Cada bloque tiene un texto por defecto genérico; la empresa 1 (Sofía) guarda en su
// ficha el texto original de la panadería, así que su comportamiento no cambia.
const cfg = (ctx.config && typeof ctx.config === 'object') ? ctx.config : {};
const asist = ctx.nombre_asistente || 'Asistente';
const empresaNom = ctx.nombre_empresa || 'la empresa';
const t = (v, d) => (typeof v === 'string' && v.trim()) ? v.trim() : d;
const sub = s => String(s || '').split('{asistente}').join(asist).split('{empresa}').join(empresaNom);
const neg = cfg.negocio || {}, cat = cfg.catalogo || {}, tono = cfg.tono || {}, ag = cfg.agenda || {};
const menu = cfg.menu || {}, interes = cfg.interes || {};
const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

const descripcion = t(neg.descripcion, '')
  ? ', ' + sub(neg.descripcion)
  : '. Respondes consultas de productos y precios, ayudas a tus clientes y agendas citas, siempre usando las HERRAMIENTAS disponibles.';

const categorias_menu = t(cat.categorias_menu, 'las categorías de nuestro catálogo');

let catalogo = t(cat.texto, '');
if (!catalogo) {
  const l = ['## Catálogo — cómo atender consultas de productos',
    '- Categorías principales del negocio: ' + categorias_menu + '.',
    '- Si el cliente pregunta en general ("qué venden", "qué productos tienes"), menciona brevemente esas categorías y pregúntale cuál quiere ver CON PRECIO. No recites productos de memoria.',
    '- Cuando elija una categoría o nombre un producto, usa stock_producto pasando SOLO la(s) palabra(s) clave (sin relleno como "de" o "por favor"). Si da vacío, reintenta con una palabra más general antes de decir que no hay.',
    '- DISPONIBILIDAD: ' + t(cat.disponibilidad, 'los productos que devuelve la herramienta están disponibles; para pedidos grandes o urgentes, sugiere confirmar con un vendedor.')];
  if (t(cat.unidad, '')) l.push('- Unidad de venta: ' + cat.unidad + '. Si no especifican, aclara la unidad.');
  if (Array.isArray(cat.sinonimos)) cat.sinonimos.forEach(s => { if (s && s.dice && s.buscar) l.push('- Si el cliente dice "' + s.dice + '" → busca "' + s.buscar + '".'); });
  catalogo = l.join('\n');
}
catalogo = sub(catalogo);

const escalamiento = sub(t(cfg.escalamiento, 'Ofrece derivar a un vendedor cuando: el cliente quiera cerrar un pedido, negociar precios o condiciones, haya un reclamo, o lleves 3 turnos sin resolver su necesidad.'));

let tonoTxt = t(tono.texto, '');
if (!tonoTxt) {
  const usted = tono.trato === 'usted';
  tonoTxt = [
    usted ? 'Habla cordial y respetuoso, tratando al cliente de USTED (nunca de tú). Cálido pero profesional.'
          : 'Habla CERCANO Y NATURAL, tuteando al cliente (de TÚ, no de usted). Cálido pero profesional, sin sonar acartonado.',
    '- Frases CORTAS y directas. Evita fórmulas rígidas ("no dude en", "hágamelo saber").',
    '- Saludo/bienvenida en el primer mensaje: ' + t(tono.saludo, usted ? "'¡Hola! 😊 Soy {asistente}, de {empresa}. ¿En qué le puedo ayudar?'" : "'¡Hola! 😊 Soy {asistente}. Cuéntame, ¿en qué te puedo ayudar?'"),
    '- Emojis con moderación (' + t(tono.emojis, '😊') + '), no en cada frase.',
    '- Respuestas BREVES para WhatsApp: máximo 4-5 frases.',
    '- Formatea montos en pesos chilenos: $1.234 (punto de miles, sin decimales).',
    '- Muestra los productos con el nombre tal como viene del catálogo (stock_producto).'
  ].join('\n');
}
tonoTxt = sub(tonoTxt);

const info = [];
if (t(neg.horario, '')) info.push('- Horario de atención: ' + neg.horario + '.');
if (t(neg.direccion, '')) info.push('- Dirección: ' + neg.direccion + '.');
if (t(neg.despacho, '')) info.push('- Despacho / delivery: ' + neg.despacho);
if (t(neg.pagos, '')) info.push('- Medios de pago: ' + neg.pagos);
if (t(neg.pedido_minimo, '')) info.push('- Pedido mínimo: ' + neg.pedido_minimo);
if (t(neg.politicas, '')) info.push('- Políticas: ' + neg.politicas);
if (t(neg.no_prometer, '')) info.push('- NUNCA prometas: ' + neg.no_prometer);
if (Array.isArray(cfg.faq)) cfg.faq.forEach(f => { if (f && f.p && f.r) info.push('- Si preguntan "' + f.p + '" → ' + f.r); });
const info_negocio = info.length ? '## Información del negocio (úsala para responder; no inventes nada fuera de esto)\n' + sub(info.join('\n')) : '';

const categorias_interes = (Array.isArray(interes.categorias) ? interes.categorias.map(c => c && c.nombre).filter(Boolean) : []).join(', ') || 'Otro';

let agenda;
if (ag.activa === false) {
  agenda = '## AGENDA\nEste negocio NO agenda citas por WhatsApp. Si el cliente quiere agendar, ofrécele que un vendedor lo contacte para coordinar. NO uses las tools de calendario.';
} else {
  const tipo = t(ag.tipo, 'reunión');
  const pideCorreo = ag.pide_correo !== false;
  const datos = pideCorreo ? 'fecha, hora y correo' : 'fecha y hora';
  let horario = '';
  if (Array.isArray(ag.dias) && ag.dias.length) horario += 'Días disponibles: ' + ag.dias.map(d => DIAS[d]).filter(Boolean).join(', ') + '. ';
  if (ag.hora_inicio && ag.hora_fin) horario += 'Horario: de ' + ag.hora_inicio + ' a ' + ag.hora_fin + ' hrs. ';
  if (ag.duracion_min) horario += 'Cada ' + tipo + ' dura ' + ag.duracion_min + ' minutos. ';
  if (ag.anticipacion_horas) horario += 'Se agenda con al menos ' + ag.anticipacion_horas + ' horas de anticipación. ';
  if (ag.lugar) horario += 'Lugar: ' + ag.lugar + '. ';
  agenda = [
    '## AGENDAR ' + tipo.toUpperCase() + ' — EL SISTEMA LA CREA, TÚ SOLO PIDES LOS DATOS',
    'El sistema agenda la ' + tipo + ' AUTOMÁTICAMENTE en segundo plano cuando tiene ' + datos + '. Tu única tarea es RECOPILAR esos datos con naturalidad.',
    horario ? '- ' + horario.trim() + ' Si el cliente pide un día u hora fuera de esto, explícale con amabilidad y ofrécele otra opción dentro del horario.' : '',
    '- Para agendar solo necesitas: **' + datos + '** (el motivo es opcional). **NO pidas el nombre del local/negocio.**',
    '- Si FALTAN datos, pídelos' + (pideCorreo ? " ('¿para qué fecha y hora? ¿a qué correo te envío la invitación?')." : " ('¿para qué fecha y hora te acomoda?')."),
    "- **PROHIBIDO afirmar que agendaste.** Cuando el cliente da " + datos + ", tu ÚNICA respuesta permitida es EXACTAMENTE algo como: 'Perfecto, coordino la " + tipo + " y te llega la confirmación en un momento 😊'. NUNCA digas 'quedó agendada', 'está agendada', 'te envié la invitación', 'nos vemos ahí' ni menciones la hora como confirmada — el SISTEMA agenda y confirma él mismo justo después de tu mensaje. Si tú también confirmas, el cliente recibe DOS confirmaciones (mala experiencia). Solo di que estás coordinando, nada más.",
    '- NO uses las tools de calendario tú mismo; el sistema se encarga.'
  ].filter(Boolean).join('\n');
}

const menuDef = {
  texto_owner: 'Hola 👋 ¿Qué necesita? Elija una opción o escríbame directo (ej: "ventas de enero", "top productos").',
  texto_cliente: 'Hola 👋 ¿En qué le ayudo? Elija una opción o escríbame su consulta.',
  botones_owner: [{ id: 'ventas_periodo', title: 'Ventas' }, { id: 'buscar_producto', title: 'Buscar producto' }, { id: 'agendar', title: 'Agendar reunión' }],
  botones_cliente: [{ id: 'ver_productos', title: 'Ver productos' }, { id: 'precios', title: 'Precios' }, { id: 'agendar', title: 'Agendar' }]
};
const perfilMenu = {
  texto_owner: t(menu.texto_owner, menuDef.texto_owner),
  texto_cliente: t(menu.texto_cliente, menuDef.texto_cliente),
  botones_owner: Array.isArray(menu.botones_owner) && menu.botones_owner.length ? menu.botones_owner.slice(0, 3) : menuDef.botones_owner,
  botones_cliente: Array.isArray(menu.botones_cliente) && menu.botones_cliente.length ? menu.botones_cliente.slice(0, 3) : menuDef.botones_cliente
};

return [{ json: {
  empresa: ctx.empresa,
  nombre_empresa: ctx.nombre_empresa,
  nombre_asistente: ctx.nombre_asistente,
  rol: ctx.rol,
  rut_cliente: ctx.rut_cliente,
  from: ctx.from,
  phone_number_id: ctx.phone_number_id,
  user_message: ctx.user_message,
  message_id: ctx.message_id,
  history,
  history_text: historyText || '(sin historial previo)',
  config: cfg,
  perfil: { descripcion, catalogo, categorias_menu, escalamiento, tono: tonoTxt, info_negocio, categorias_interes, agenda, menu: perfilMenu, calendar_id: String(ag.calendar_id || 'primary') }
}}];"""
nodo("Consolidar contexto")["parameters"]["jsCode"] = CONSOLIDAR

# ---------------------------------------------------------------- interés (CRM)
p = nodo("Detectar interés (auto)")["parameters"]
code = p["jsCode"]
a = code.index("let producto = null;")
b = code.index("\n", code.index("const interes = /("))
interes_sofia_regex = code[code.index("const interes = /(") + len("const interes = /"):code.index("/.test(msg);", code.index("const interes = /("))]
code = code[:a] + r"""const cfgI = (ctx.config && ctx.config.interes) || {};
const cats = Array.isArray(cfgI.categorias) ? cfgI.categorias : [];
let producto = null;
for (const c of cats) { try { if (c && c.regex && new RegExp(c.regex, 'i').test(msg)) { producto = c.nombre; break; } } catch (e) { /* regex inválida en la ficha */ } }
// Señales de interés comercial: base genérica + las del rubro (ficha)
let interes = /(precio|valor|cu[aá]nto|cotiza|comprar|pedido|encargo|reserva|disponib|stock)/.test(msg);
if (!interes && cfgI.senales) { try { interes = new RegExp(cfgI.senales, 'i').test(msg); } catch (e) {} }
// Sin categorías en la ficha, el interés comercial basta para registrarlo como 'Otro'
if (!producto && interes && cats.length === 0) producto = 'Otro';""" + code[b:]
p["jsCode"] = code

p = nodo("crm_guardar_lead")
pp = p["parameters"]
pp["toolDescription"] = reemplazar(pp["toolDescription"], "(Empanadas/Pasteles/Pan/Sopaipillas/Mixto/Otro)",
                                  "(una de las categorías válidas del negocio indicadas en tus instrucciones, u Otro)")
pp["jsonBody"] = reemplazar(pp["jsonBody"], "'Empanadas/Pasteles/Pan/Sopaipillas/Mixto/Otro'",
                            "'categoría de interés del negocio (ver instrucciones) u Otro'")

# ---------------------------------------------------------------- menú
p = nodo("mostrar_menu")["parameters"]
p["jsonBody"] = """={{ (() => {
  const to = """ + CTX + """.from;
  const m = """ + CTX + """.perfil.menu;
  const tipo = $fromAI('tipo_menu', "owner o cliente", 'string');
  const botones = tipo === 'owner' ? m.botones_owner : m.botones_cliente;
  return JSON.stringify({
    messaging_product: 'whatsapp', to, type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: tipo === 'owner' ? m.texto_owner : m.texto_cliente },
      action: { buttons: botones.map(b => ({ type: 'reply', reply: { id: b.id, title: String(b.title).slice(0, 20) } })) }
    }
  });
})() }}"""

# ---------------------------------------------------------------- agenda
p = nodo("Detectar agenda (auto)")["parameters"]
code = p["jsCode"]
OLD_Q = "const quiereAgendar = /(agendar|agenda|reuni[oó]n|reunirnos|c[ií]ta|juntarnos|reservar hora|hora para)/.test(lowFull);"
code = reemplazar(code, OLD_Q, """const ag = (ctx.config && ctx.config.agenda) || {};
if (ag.activa === false) return [{ json: { agendar:false, motivo:'agenda desactivada' } }];
const tipoAg = String(ag.tipo || 'reunión');
const quiereAgendar = /(agendar|agenda|reuni[oó]n|reunirnos|c[ií]ta|juntarnos|reservar hora|hora para)/.test(lowFull) || lowFull.includes(tipoAg.toLowerCase());""")
code = reemplazar(code, "const completo = !!(fecha && hh!==null && correo && wa);",
                  "const pideCorreo = ag.pide_correo !== false;\nconst completo = !!(fecha && hh!==null && (correo || !pideCorreo) && wa);")
OLD_FIN = "const finH = (hh+1)%24;\nconst fin = `${y}-${mo}-${d}T${pad(finH)}:${pad(mm)}:00`;"
code = reemplazar(code, OLD_FIN, r"""// duración y horario permitido desde la ficha de la empresa
const durMin = Number(ag.duracion_min) || 60;
const finDate = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), hh, mm + durMin);
const fin = `${finDate.getFullYear()}-${pad(finDate.getMonth()+1)}-${pad(finDate.getDate())}T${pad(finDate.getHours())}:${pad(finDate.getMinutes())}:00`;
const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const hm = s => { const m = String(s||'').match(/(\d{1,2}):(\d{2})/); return m ? parseInt(m[1])*60 + parseInt(m[2]) : null; };
const iniLim = hm(ag.hora_inicio), finLim = hm(ag.hora_fin), t0 = hh*60 + mm, t1 = t0 + durMin;
const diasOk = !Array.isArray(ag.dias) || !ag.dias.length || ag.dias.includes(fecha.getDay());
const horaOk = iniLim === null || finLim === null || (t0 >= iniLim && t1 <= finLim);
const antMs = (Number(ag.anticipacion_horas) || 0) * 3600000;
const cuando = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), hh, mm);
const antOk = cuando.getTime() - now.getTime() >= antMs;
if (!diasOk || !horaOk || !antOk) {
  const dTxt = Array.isArray(ag.dias) && ag.dias.length ? ag.dias.map(x => DIAS[x]).join(', ') : 'todos los días';
  const hTxt = (iniLim !== null && finLim !== null) ? ` de ${ag.hora_inicio} a ${ag.hora_fin} hrs` : '';
  const aTxt = antMs ? ` y con al menos ${ag.anticipacion_horas} horas de anticipación` : '';
  const usted = !!(ctx.config && ctx.config.tono && ctx.config.tono.trato === 'usted');
  return [{ json: { agendar:false, fuera_horario:true, wa, aviso: `Uy, ese horario no lo tengo disponible 😕. Agendo ${dTxt}${hTxt}${aTxt}. ¿Qué otro día u hora ${usted ? 'le' : 'te'} acomoda?` } }];
}""")
OLD_RET = "return [{ json: { agendar:true, wa, correo, inicio, fin, motivo, titulo: motivo } }];"
code = reemplazar(code, OLD_RET, r"""const correoNeg = ag.correo_negocio ? String(ag.correo_negocio).trim() : null;
const attendees = [correo, correoNeg].filter(Boolean);
const tipoCap = tipoAg.charAt(0).toUpperCase() + tipoAg.slice(1);
const titulo = (motivo && motivo !== 'Reunión') ? `${tipoCap}: ${motivo}` : `${tipoCap} con cliente WhatsApp +${wa}`;
const descripcion = `${motivo === 'Reunión' ? tipoCap : motivo}\nCliente WhatsApp: +${wa}` + (correo ? `\nCorreo: ${correo}` : '') + `\nAgendado por ${ctx.nombre_asistente || 'el asistente'} (${ctx.nombre_empresa || ''})`;
return [{ json: { agendar:true, wa, correo, inicio, fin, motivo, titulo, descripcion, attendees, calendar_id: String(ag.calendar_id || 'primary'), lugar: ag.lugar || '', tipo: tipoAg, mensaje_ok: ag.mensaje_confirmacion || '' } }];""")
p["jsCode"] = code

ev = nodo("Crear evento (Calendar)")["parameters"]
ev["calendar"] = {"__rl": True, "value": "={{ $json.calendar_id }}", "mode": "id"}
ev["additionalFields"]["attendees"] = "={{ $json.attendees }}"
ev["additionalFields"]["description"] = "={{ $json.descripcion }}"
ev["additionalFields"]["location"] = "={{ $json.lugar }}"

conf = nodo("Confirmar agenda (WhatsApp)")
conf["parameters"]["jsonBody"] = """={{ (() => { const d = $('Detectar agenda (auto)').first().json; const ok = $json && ($json.id || $json.htmlLink); const f = d.inicio.slice(0,10).split('-').reverse().join('-'); const h = d.inicio.slice(11,16); let txt; if (ok) { txt = d.mensaje_ok ? d.mensaje_ok.split('{tipo}').join(d.tipo).split('{fecha}').join(f).split('{hora}').join(h).split('{correo}').join(d.correo || '') : ('Listo ✅ Te agendé la ' + d.tipo + ' para el ' + f + ' a las ' + h + (d.lugar ? ' (' + d.lugar + ')' : '') + '.' + (d.correo ? ' Te llegó la invitación a ' + d.correo + ' 😊' : ' 😊')); } else { txt = 'Uf, no pude agendar la ' + d.tipo + ' ahora mismo 😕. Un vendedor te contactará para coordinar.'; } return JSON.stringify({ messaging_product:'whatsapp', to: d.wa, type:'text', text:{ body: txt } }); })() }}"""

for tool in ("verificar_disponibilidad", "crear_reunion"):
    nodo(tool)["parameters"]["calendar"] = {"__rl": True, "value": "={{ " + CTX + ".perfil.calendar_id }}", "mode": "id"}

# Nuevos nodos: aviso de fuera de horario (rama "no agendar" de ¿Agendar?)
agendar_if = nodo("¿Agendar?")
fuera = copy.deepcopy(agendar_if)
fuera["id"] = str(uuid.uuid4())
fuera["name"] = "¿Fuera de horario?"
fuera["position"] = [832, 3216]
fuera["parameters"]["conditions"]["conditions"][0]["id"] = "c-fh"
fuera["parameters"]["conditions"]["conditions"][0]["leftValue"] = "={{ $json.fuera_horario }}"
aviso = copy.deepcopy(conf)
aviso["id"] = str(uuid.uuid4())
aviso["name"] = "Avisar horario (WhatsApp)"
aviso["position"] = [1088, 3216]
aviso["parameters"]["jsonBody"] = "={{ JSON.stringify({ messaging_product:'whatsapp', to: $json.wa, type:'text', text:{ body: $json.aviso } }) }}"
assert not any(n["name"] in (fuera["name"], aviso["name"]) for n in w["nodes"]), "los nodos nuevos ya existen"
w["nodes"] += [fuera, aviso]
c = w["connections"]
assert c["¿Agendar?"]["main"][1] == [], "la rama 'no' de ¿Agendar? ya tenía conexión"
c["¿Agendar?"]["main"][1] = [{"node": "¿Fuera de horario?", "type": "main", "index": 0}]
c["¿Fuera de horario?"] = {"main": [[{"node": "Avisar horario (WhatsApp)", "type": "main", "index": 0}], []]}

json.dump(w, open(main_out, "w", encoding="utf-8"), ensure_ascii=False)

# ---------------------------------------------------------------- fichas (SQL)
sofia = {
    "negocio": {"descripcion": desc_sofia},
    "catalogo": {"texto": catalogo_sofia, "categorias_menu": CATS},
    "escalamiento": escal_sofia,
    "tono": {"texto": tono_sofia},
    "interes": {
        "categorias": [
            {"nombre": "Empanadas", "regex": "empanad"},
            {"nombre": "Pasteles", "regex": "pastel|torta|kuchen|berlin|alfajor|brazo de reina|chilenito|delicia|dona"},
            {"nombre": "Pan", "regex": "\\bpan\\b|marraqueta|hallulla|molde|baguet"},
            {"nombre": "Sopaipillas", "regex": "sopaipilla"},
        ],
        "senales": interes_sofia_regex,
    },
    "menu": {
        "texto_owner": 'Hola 🥟 ¿Qué anda buscando? Elija una opción o escríbame directo (ej: "ventas de enero", "top productos", "deuda de cliente X").',
        "texto_cliente": "Hola 🥟 ¿En qué le ayudo? Elija una opción o escríbame su consulta.",
        "botones_owner": [{"id": "ventas_periodo", "title": "Ventas"}, {"id": "buscar_producto", "title": "Buscar producto"}, {"id": "agendar", "title": "Agendar reunión"}],
        "botones_cliente": [{"id": "ver_productos", "title": "Ver productos"}, {"id": "precios", "title": "Precios"}, {"id": "agendar", "title": "Agendar"}],
    },
    "agenda": {"activa": True, "tipo": "reunión", "duracion_min": 60, "pide_correo": True, "calendar_id": "primary"},
}
prueba = {
    "negocio": {
        "descripcion": "una tienda de alimentos de prueba que vende productos para la despensa a pymes y público general. Respondes consultas de productos y precios, ayudas a tus clientes y agendas visitas, siempre usando las HERRAMIENTAS disponibles.",
        "horario": "lunes a viernes de 9:00 a 18:00",
        "despacho": "despacho en Santiago centro; el costo depende de la comuna.",
        "pagos": "transferencia o efectivo.",
        "no_prometer": "descuentos ni plazos de entrega exactos sin consultar a un vendedor.",
    },
    "tono": {"trato": "usted", "emojis": "🙂", "saludo": "'¡Hola! 🙂 Soy {asistente}, de {empresa}. ¿En qué le puedo ayudar?'"},
    "catalogo": {"categorias_menu": "Despensa, Bebidas, Snacks", "unidad": "por unidad"},
    "faq": [{"p": "¿Hacen despacho?", "r": "sí, en Santiago centro; el costo depende de la comuna."}],
    "interes": {"categorias": [
        {"nombre": "Despensa", "regex": "arroz|aceite|az[uú]car|fideo|harina"},
        {"nombre": "Bebidas", "regex": "bebida|jugo|agua"},
    ]},
    "agenda": {
        "activa": True, "tipo": "visita", "duracion_min": 30, "dias": [1, 2, 3, 4, 5],
        "hora_inicio": "09:00", "hora_fin": "18:00", "anticipacion_horas": 2,
        "pide_correo": False, "correo_negocio": "emaurm1@gmail.com", "calendar_id": "primary",
        "lugar": "Oficina de prueba (dirección por confirmar)",
        "mensaje_confirmacion": "Listo ✅ Le agendé la {tipo} para el {fecha} a las {hora}. Lo esperamos 🙂",
    },
}


def dq(obj):
    s = json.dumps(obj, ensure_ascii=False, indent=1)
    assert "$cfg$" not in s
    return "$cfg$" + s + "$cfg$::jsonb"


sql = f"""-- ============================================================
-- Ficha del agente por empresa (perfil) — Supabase cexowmypklxngbjsxryf
-- Ejecutar UNA vez en Supabase → SQL Editor (como postgres), DESPUÉS de 04.
-- n8n lee agente_empresas_config.config para armar el prompt, el menú, la detección
-- de interés y la agenda de cada empresa. Lo que falte en la ficha usa un texto
-- genérico. La empresa 1 (Sofía) recibe EXACTAMENTE el texto actual de la panadería.
-- Generado por patch_perfil.py (29-10-2026).
-- ============================================================

ALTER TABLE public.agente_empresas_config
  ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{{}}'::jsonb;

-- Empresa 1 — Sofía (panadería): texto original extraído del prompt vigente.
INSERT INTO public.agente_empresas_config (empresa, nombre_asistente, config)
VALUES (1, 'Sofía', {dq(sofia)})
ON CONFLICT (empresa) DO UPDATE SET config = EXCLUDED.config, actualizado_en = now();

-- Empresa 3 — Prueba Conexión WA (Sonia): ficha de ejemplo para probar la parametrización
-- (trato de usted, visitas de 30 min L-V 9-18, sin pedir correo, copia al correo de prueba).
INSERT INTO public.agente_empresas_config (empresa, nombre_asistente, config)
VALUES (3, 'Sonia', {dq(prueba)})
ON CONFLICT (empresa) DO UPDATE SET config = EXCLUDED.config, actualizado_en = now();

-- Verificación:
-- SELECT empresa, nombre_asistente, jsonb_object_keys(config) FROM public.agente_empresas_config ORDER BY 1;
"""
open(sql_out, "w", encoding="utf-8", newline="\n").write(sql)
print("OK prompt parametrizado | largo:", len(P))
print("OK desc_sofia:", len(desc_sofia), "| catalogo_sofia:", len(catalogo_sofia), "| escal:", len(escal_sofia), "| tono:", len(tono_sofia))
print("OK nodos:", len(w["nodes"]))
