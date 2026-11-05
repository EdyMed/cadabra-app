// gen_clon_crm.js
// Clona el workflow multimodal (_ref_multimodal_actual.json) en un workflow NUEVO
// "Agente Whatsap CRM Empresarial", SIN tocar el original. Cambios:
//   - name nuevo; se mantiene el webhook path 'whatsapp-agent' (irá al número actual,
//     pero se despliega INACTIVO; el switch prod se hace al final manualmente).
//   - agrega 1 tool toolWorkflow "crm_guardar_lead" que llama al sub-workflow
//     "CRM Upsert (NocoDB)" (id aiV5ye7IxY1DGFrK) → upsert por contact_id.
//   - agrega 1 tool httpRequestTool "crm_actualizar_estado" (PATCH directo por Id).
//   - las conecta al AI Agent por ai_tool.
//   - inyecta en el systemMessage una sección "CRM" (cuándo captar/mover leads).
//   - active:false.
//
// Salida SIN BOM: workflow_crm_empresarial.json

const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const raw = fs.readFileSync(path.join(DIR, "_ref_multimodal_actual.json"), "utf8").replace(/^﻿/, "");
const src = JSON.parse(raw);

const NOCODB_BASE = "https://appcadabra-nocodb.jmyxxj.easypanel.host";
const TABLE_ID = "mcp3sx8fm259gn6";
const RECORDS_URL = `${NOCODB_BASE}/api/v2/tables/${TABLE_ID}/records`;
const SUBWF_UPSERT_ID = "aiV5ye7IxY1DGFrK";
const CRED_NOCODB = { httpHeaderAuth: { id: "jErLq0zOrAIRE72s", name: "NocoDB xc-token" } };

// --- workflow limpio para crear por API v1 ---
const wf = {
  name: "Agente Whatsap CRM Empresarial",
  nodes: JSON.parse(JSON.stringify(src.nodes)),
  connections: JSON.parse(JSON.stringify(src.connections)),
  settings: src.settings || { executionOrder: "v1" },
  staticData: null,
};

// --- 1) Tool toolWorkflow: crm_guardar_lead -> llama al sub-workflow CRM Upsert ---
// Pasa los campos del lead; el sub-workflow deduplica por contact_id.
// crm_guardar_lead: httpRequestTool que llama al WEBHOOK del sub-workflow "CRM Upsert",
// el cual hace GET-by-contact_id → PATCH/POST (upsert REAL, sin duplicar). El sub-workflow
// devuelve {record_id, accion}. Reemplaza al POST directo (que duplicaba).
const UPSERT_HOOK = "https://appcadabra-cadabra-project.jmyxxj.easypanel.host/webhook/crm-upsert";
const toolGuardar = {
  parameters: {
    toolDescription:
      "Registra o actualiza al LEAD/cliente en el CRM sin duplicar (busca por su número). Úsala al conversar con un cliente con interés real. Clasifica producto_interes (Empanadas/Pasteles/Pan/Sopaipillas/Mixto/Otro) y estado_crm con VALOR EXACTO con tildes (Nuevo Lead, En Conversación, Cotización Enviada, Primer Pedido, Cliente Activo, Cliente Recurrente, Sin Respuesta, Requiere Vendedor, Inactivo). El contact_id/phone se toman solos del contexto. Devuelve record_id (úsalo en crm_actualizar_estado).",
    method: "POST",
    url: UPSERT_HOOK,
    sendHeaders: true,
    headerParameters: { parameters: [{ name: "Content-Type", value: "application/json" }] },
    sendBody: true,
    specifyBody: "json",
    jsonBody:
      "={{ (() => {\n" +
      "  const wa = $('Consolidar contexto').first().json.from;\n" +
      "  const body = {\n" +
      "    contact_id: wa,\n" +
      "    phone: wa,\n" +
      "    nombre: $fromAI('nombre', 'nombre de la persona SOLO si lo dijo en la conversación', 'string') || undefined,\n" +
      "    nombre_negocio: $fromAI('nombre_negocio', 'nombre del local/negocio', 'string') || undefined,\n" +
      "    producto_interes: $fromAI('producto_interes', 'Empanadas/Pasteles/Pan/Sopaipillas/Mixto/Otro', 'string') || undefined,\n" +
      "    estado_crm: $fromAI('estado_crm', 'estado del embudo, valor exacto con tildes', 'string') || 'En Conversación',\n" +
      "    comuna: $fromAI('comuna', 'comuna del cliente', 'string') || undefined,\n" +
      "    origen_lead: 'whatsapp'\n" +
      "  };\n" +
      "  Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);\n" +
      "  return JSON.stringify(body);\n" +
      "})() }}",
    options: {},
  },
  id: "c0000000-0000-4000-8000-000000000001",
  name: "crm_guardar_lead",
  type: "n8n-nodes-base.httpRequestTool",
  typeVersion: 4.2,
  position: [1376, 1040],
};

// --- 2) Tool httpRequestTool: crm_actualizar_estado (PATCH directo por record_id) ---
const toolEstado = {
  parameters: {
    toolDescription:
      "Actualiza un lead ya guardado: estado_crm, nombre, nombre_negocio, vendedor_asignado, condicion_pago o estado_agendamiento. Requiere record_id (el Id que devolvió crm_guardar_lead). Úsala para completar el nombre cuando el cliente lo da, o para avanzar el embudo. VALORES EXACTOS con tildes.",
    method: "PATCH",
    url: RECORDS_URL,
    authentication: "genericCredentialType",
    genericAuthType: "httpHeaderAuth",
    sendHeaders: true,
    headerParameters: { parameters: [{ name: "Content-Type", value: "application/json" }] },
    sendBody: true,
    specifyBody: "json",
    jsonBody:
      "={{ (() => {\n" +
      "  const body = {\n" +
      "    Id: $fromAI('record_id', 'Id numérico del lead (de crm_guardar_lead)', 'number'),\n" +
      "    nombre: $fromAI('nombre', 'nombre de la persona de contacto', 'string') || undefined,\n" +
      "    nombre_negocio: $fromAI('nombre_negocio', 'nombre del local/negocio', 'string') || undefined,\n" +
      "    estado_crm: $fromAI('estado_crm', 'nuevo estado del embudo, valor exacto', 'string') || undefined,\n" +
      "    vendedor_asignado: $fromAI('vendedor_asignado', 'Vendedor 1 / Vendedor 2', 'string') || undefined,\n" +
      "    condicion_pago: $fromAI('condicion_pago', 'Efectivo/Cheque/Crédito 7d', 'string') || undefined,\n" +
      "    estado_agendamiento: $fromAI('estado_agendamiento', 'Pendiente/Confirmado/Cancelado', 'string') || undefined,\n" +
      "    bot_activo: $fromAI('bot_activo', 'true o false: pon false SOLO para pasar la conversación a un humano/vendedor', 'boolean')\n" +
      "  };\n" +
      "  if (body.bot_activo === undefined || body.bot_activo === '' || body.bot_activo === null) delete body.bot_activo;\n" +
      "  Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);\n" +
      "  return JSON.stringify(body);\n" +
      "})() }}",
    options: {},
  },
  id: "c0000000-0000-4000-8000-000000000002",
  name: "crm_actualizar_estado",
  type: "n8n-nodes-base.httpRequestTool",
  typeVersion: 4.2,
  position: [1568, 1040],
  credentials: CRED_NOCODB,
};

wf.nodes.push(toolGuardar, toolEstado);

// --- 3) Conectar al AI Agent por ai_tool ---
const aiToolConn = [[{ node: "AI Agent", type: "ai_tool", index: 0 }]];
wf.connections["crm_guardar_lead"] = { ai_tool: aiToolConn };
wf.connections["crm_actualizar_estado"] = { ai_tool: aiToolConn };

// --- 3b) REGISTRO AUTOMÁTICO A NIVEL DE FLUJO (no depende de que el agente llame la tool) ---
// Después de "Guardar turno", un Code decide si el mensaje del cliente tiene interés
// comercial y qué producto; si sí, un HTTP llama al webhook upsert. Rama paralela,
// no bloquea el envío del mensaje al cliente.
const nodeDetectar = {
  parameters: {
    jsCode:
      "const ctx = $('Consolidar contexto').first().json;\n" +
      "// Analizar el mensaje ACTUAL + el historial reciente del cliente (por el buffer,\n" +
      "// un turno puede ser corto como 'de pino'; el interés/producto puede estar en turnos previos).\n" +
      "const histUser = (ctx.history || []).filter(h => h.role === 'user').map(h => h.content).join(' ');\n" +
      "const msg = ((histUser + ' ' + (ctx.user_message || ''))).toLowerCase();\n" +
      "const wa = ctx.from;\n" +
      "// Detectar producto por palabras clave del catálogo real\n" +
      "let producto = null;\n" +
      "if (/empanad/.test(msg)) producto = 'Empanadas';\n" +
      "else if (/pastel|torta|kuchen|berlin|alfajor|brazo de reina|chilenito|delicia|dona/.test(msg)) producto = 'Pasteles';\n" +
      "else if (/\\bpan\\b|marraqueta|hallulla|molde|baguet/.test(msg)) producto = 'Pan';\n" +
      "else if (/sopaipilla/.test(msg)) producto = 'Sopaipillas';\n" +
      "// Señales de interés comercial\n" +
      "const interes = /(precio|valor|cu[aá]nto|cotiza|por mayor|mayorista|cantidad|docena|unidades|kilo|pedido|encargo|comprar|vender|local|negocio|restaurant|caf[eé]|almac[eé]n|sushi)/.test(msg);\n" +
      "// Petición de HANDOFF a humano (mira SOLO el mensaje actual, no el historial)\n" +
      "const msgActual = (ctx.user_message || '').toLowerCase();\n" +
      "const pideHumano = /(vendedor|hablar con (alguien|una persona|un humano|un ejecutivo|un asesor)|con una persona|atenci[oó]n humana|asesor|ejecutivo)/.test(msgActual);\n" +
      "// ¿El ÚLTIMO mensaje del bot pidió el NOMBRE? Entonces la respuesta del cliente ES el nombre.\n" +
      "const hist = ctx.history || [];\n" +
      "let ultimoBot = '';\n" +
      "for (let i = hist.length - 1; i >= 0; i--) { if (hist[i].role === 'assistant') { ultimoBot = (hist[i].content||'').toLowerCase(); break; } }\n" +
      "const botPidioNombre = /(a nombre de qui[eé]n|con qui[eé]n tengo el gusto|nombre de la persona|c[oó]mo te llamas|tu nombre|qui[eé]n eres|a qui[eé]n anoto)/.test(ultimoBot);\n" +
      "// Capturar nombre: el mensaje actual del cliente, limpio (quitar 'soy', 'me llamo', 'local', etc.)\n" +
      "let nombreCap = null, negocioCap = null;\n" +
      "if (botPidioNombre) {\n" +
      "  const t = (ctx.user_message || '').trim();\n" +
      "  // separar posible 'nombre, local X' o 'nombre y el local es X'\n" +
      "  let resto = t;\n" +
      "  // 1) extraer el NEGOCIO si viene con marcador explícito ('local X', 'negocio X', 'mi local es X', 'del local X')\n" +
      "  const mNeg = t.match(/(?:mi\\s+)?(?:local|negocio|tienda|restaurant\\w*|caf[eé]|almac[eé]n|sushi|kiosco|food ?truck)\\s+(?:se\\s+llama\\s+|es\\s+|:\\s*)?([\\wáéíóúñ' ]{2,40})/i);\n" +
      "  if (mNeg) { negocioCap = mNeg[1].trim(); resto = t.replace(mNeg[0], '').trim(); }\n" +
      "  // 2) el NOMBRE es lo que queda antes de una coma/marcador (quitar prefijos 'soy', 'me llamo')\n" +
      "  resto = resto.replace(/[,;].*$/, '').trim();\n" +
      "  resto = resto.replace(/^(hola\\s+)?(soy|me llamo|mi nombre es|es|soy el|soy la)\\s+/i, '').trim();\n" +
      "  resto = resto.replace(/\\s+(del|de la|de|el|la)\\s*$/i, '').trim();\n" +
      "  // si tras quitar el negocio no queda nombre (ej. 'local los tres cerditos'), nombre queda null\n" +
      "  if (resto && resto.length >= 2 && resto.length <= 30 && !/^(local|negocio|el|la|los|las)$/i.test(resto)) nombreCap = resto;\n" +
      "  // capitalizar\n" +
      "  const _min = new Set(['de','del','la','las','los','el','y','o','a','en','con','por','para','un','una']);\n" +
      "  const cap = s => (s||'').split(/\\s+/).map((w,i) => { if(!w) return w; const l=w.toLowerCase(); if(i>0 && _min.has(l)) return l; return w.charAt(0).toUpperCase()+w.slice(1); }).join(' ');\n" +
      "  if (nombreCap) nombreCap = cap(nombreCap);\n" +
      "  if (negocioCap) negocioCap = cap(negocioCap);\n" +
      "}\n" +
      "// ¿Estamos en un handoff pendiente? (la ficha ya está en Requiere Vendedor o el bot pidió nombre tras pedir vendedor)\n" +
      "const enHandoff = /(vendedor|pasar con|te contact|a la brevedad)/.test(ultimoBot);\n" +
      "\n" +
      "const debeRegistrar = (!!producto && interes && !!wa) || (pideHumano && !!wa) || (botPidioNombre && !!nombreCap && !!wa);\n" +
      "const body = { contact_id: wa, phone: wa, origen_lead: 'whatsapp' };\n" +
      "if (producto) body.producto_interes = producto;\n" +
      "if (nombreCap) body.nombre = nombreCap;\n" +
      "if (negocioCap) body.nombre_negocio = negocioCap;\n" +
      "if (pideHumano) { body.estado_crm = 'Requiere Vendedor'; }\n" +
      "// Si el bot pidió nombre en contexto de handoff y el cliente lo dio → guardar + CORTAR (bot_activo=false)\n" +
      "if (botPidioNombre && nombreCap && enHandoff) { body.estado_crm = 'Requiere Vendedor'; body.bot_activo = false; }\n" +
      "if (!body.estado_crm) body.estado_crm = 'En Conversación';\n" +
      "return [{ json: Object.assign({ debeRegistrar, pideHumano, capturoNombre: !!nombreCap, corte: (botPidioNombre && nombreCap && enHandoff) }, body) }];",
    options: {},
  },
  id: "c0000000-0000-4000-8000-000000000003",
  name: "Detectar interés (auto)",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [1120, 620],
};
const nodeIfRegistrar = {
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "loose" },
      conditions: [
        { id: "c-reg", leftValue: "={{ $json.debeRegistrar }}", rightValue: true, operator: { type: "boolean", operation: "true", singleValue: true } },
      ],
      combinator: "and",
    },
    options: {},
  },
  id: "c0000000-0000-4000-8000-000000000004",
  name: "¿Registrar lead?",
  type: "n8n-nodes-base.if",
  typeVersion: 2,
  position: [1340, 620],
};
const nodeRegistrarAuto = {
  parameters: {
    method: "POST",
    url: "https://appcadabra-cadabra-project.jmyxxj.easypanel.host/webhook/crm-upsert",
    sendHeaders: true,
    headerParameters: { parameters: [{ name: "Content-Type", value: "application/json" }] },
    sendBody: true,
    specifyBody: "json",
    jsonBody:
      "={{ (() => { const b = { contact_id: $json.contact_id, phone: $json.phone, producto_interes: $json.producto_interes, estado_crm: $json.estado_crm, origen_lead: $json.origen_lead, nombre: $json.nombre, nombre_negocio: $json.nombre_negocio }; if ($json.bot_activo === false) b.bot_activo = false; Object.keys(b).forEach(k => (b[k] === undefined || b[k] === null || b[k] === '') && delete b[k]); return JSON.stringify(b); })() }}",
    options: {},
  },
  id: "c0000000-0000-4000-8000-000000000005",
  name: "Registrar lead (auto)",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [1560, 540],
};
// IF: ¿fue un corte de handoff? (el detector marcó corte=true → hay que alertar al vendedor)
const nodeIfAlerta = {
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "loose" },
      conditions: [
        { id: "c-alerta", leftValue: "={{ $('Detectar interés (auto)').first().json.corte }}", rightValue: true, operator: { type: "boolean", operation: "true", singleValue: true } },
      ],
      combinator: "and",
    },
    options: {},
  },
  id: "c0000000-0000-4000-8000-000000000006",
  name: "¿Alertar vendedor?",
  type: "n8n-nodes-base.if",
  typeVersion: 2,
  position: [1780, 540],
};
// HTTP: llamar al sub-workflow Alerta Vendedor (reabre+etiqueta Chatwoot + WhatsApp al vendedor)
const nodeAlerta = {
  parameters: {
    method: "POST",
    url: "https://appcadabra-cadabra-project.jmyxxj.easypanel.host/webhook/alerta-vendedor",
    sendHeaders: true,
    headerParameters: { parameters: [{ name: "Content-Type", value: "application/json" }] },
    sendBody: true,
    specifyBody: "json",
    jsonBody:
      "={{ JSON.stringify({ wa_id: $('Detectar interés (auto)').first().json.contact_id, nombre: $('Detectar interés (auto)').first().json.nombre || '', negocio: $('Detectar interés (auto)').first().json.nombre_negocio || '' }) }}",
    options: {},
  },
  id: "c0000000-0000-4000-8000-000000000007",
  name: "Alertar vendedor",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [2000, 480],
  onError: "continueRegularOutput",
};

wf.nodes.push(nodeDetectar, nodeIfRegistrar, nodeRegistrarAuto, nodeIfAlerta, nodeAlerta);

// Colgar la rama automática de "Guardar turno" (además de la rama que ya va a IF ¿enviar texto?)
if (wf.connections["Guardar turno"] && wf.connections["Guardar turno"].main) {
  wf.connections["Guardar turno"].main[0].push({ node: "Detectar interés (auto)", type: "main", index: 0 });
} else {
  wf.connections["Guardar turno"] = { main: [[{ node: "Detectar interés (auto)", type: "main", index: 0 }]] };
}
wf.connections["Detectar interés (auto)"] = { main: [[{ node: "¿Registrar lead?", type: "main", index: 0 }]] };
// Tras registrar el lead → evaluar si hay que alertar (rama true del IF registrar)
wf.connections["¿Registrar lead?"] = { main: [[{ node: "Registrar lead (auto)", type: "main", index: 0 }], []] };
wf.connections["Registrar lead (auto)"] = { main: [[{ node: "¿Alertar vendedor?", type: "main", index: 0 }]] };
wf.connections["¿Alertar vendedor?"] = { main: [[{ node: "Alertar vendedor", type: "main", index: 0 }], []] };

// --- 4) Inyectar sección CRM en el systemMessage del agente ---
const agent = wf.nodes.find((n) => n.type === "@n8n/n8n-nodes-langchain.agent");
if (agent && agent.parameters && agent.parameters.options) {
  const extra =
    "\n\n## CONTINUIDAD DE LA CONVERSACIÓN (CRÍTICO)\n" +
    "SIEMPRE lee el historial antes de responder. Si el ÚLTIMO mensaje del asistente fue una PREGUNTA (p.ej. '¿Con quién tengo el gusto?', '¿de qué producto?', '¿cuántas unidades?'), entonces el siguiente mensaje del cliente ES LA RESPUESTA a esa pregunta — aunque sea una sola palabra (un nombre como 'Alfonso', un número, 'sí'). NO lo trates como un saludo nuevo ni repitas la bienvenida. Continúa el hilo: usa ese dato y sigue donde quedaste.\n" +
    "SALUDO: la bienvenida COMPLETA (presentarte como Sofía + explicar qué haces) va SOLO en el primer mensaje de una conversación sin historial. PERO si el cliente incluye un saludo explícito ('hola', 'buenas', 'buenos días') al inicio de su mensaje, devuélvele un saludo BREVE y cálido ('¡Hola! 😊' o '¡Buenas!') antes de responder su consulta — aunque ya haya historial. No repitas la presentación larga, solo un saludo corto y sigues con lo que pide.\n" +
    "Ejemplo: si preguntaste el nombre y el cliente responde 'Alfonso', guárdalo (crm_actualizar_estado nombre='Alfonso') y CONTINÚA con lo que pidió antes (los precios del pan), no vuelvas a saludar.\n" +
    "\n## CRM — PEDIR NOMBRE Y COMPLETAR DATOS\n" +
    "El sistema registra AUTOMÁTICAMENTE en segundo plano a los clientes interesados, así que NO necesitas crear el lead tú. Tu tarea con el CRM es ENRIQUECERLO:\n" +
    "- **PEDIR EL NOMBRE (en el momento justo):** NO pidas el nombre en cada consulta de precio (es molesto). Pídelo cuando la conversación llega a un punto COMERCIAL: el cliente quiere CERRAR/hacer un pedido, pide que lo contacte un vendedor, o confirma que va a comprar. Ahí sí: '¿A nombre de quién dejo anotado el pedido?' o '¿Con quién tengo el gusto para que el vendedor lo contacte?'. Con naturalidad, sin insistir si no contesta.\n" +
    "- **GUARDAR NOMBRE / AVANZAR ESTADO:** cuando el cliente te dé su nombre (o el de su local), o cuando la venta avance, usa `crm_actualizar_estado`: campos nombre / nombre_negocio; estado 'Cotización Enviada' al pasar precios, 'Primer Pedido' si concreta. Necesitas el record_id: si no lo tienes, llama antes a `crm_guardar_lead` (devuelve record_id).\n" +
    "- **PASAR A UN HUMANO (handoff) — SECUENCIA IMPORTANTE:** cuando el cliente pide hablar con un vendedor/persona o cerrar un pedido:\n" +
    "  1. PRIMERO pídele su nombre (y el del local si no lo tienes): 'Dale, te paso con un vendedor 🙌 ¿A nombre de quién lo anoto?'. NO lo derives todavía.\n" +
    "  2. Cuando te dé el nombre, guárdalo con `crm_actualizar_estado` (nombre, y nombre_negocio si lo dio) + estado_crm='Requiere Vendedor' + **bot_activo=false** (recién AHORA cortas). Confírmale: 'Listo [nombre], un vendedor te contacta a la brevedad 😊'.\n" +
    "  3. Si el cliente NO quiere dar el nombre o insiste en que lo pasen ya, igual haz el corte: `crm_actualizar_estado` estado_crm='Requiere Vendedor' + bot_activo=false.\n" +
    "  Tras el corte, NO sigas respondiendo esa conversación.\n" +
    "- **NUNCA inventes el nombre**: solo guárdalo si el cliente lo dijo explícitamente en ESTA conversación; nunca del historial ni del número.\n" +
    "- USA VALORES EXACTOS de estado/producto (con tildes). SIEMPRE en segundo plano: nunca menciones el CRM al cliente.\n" +
    "\n## TONO Y ESTILO — REEMPLAZA CUALQUIER INSTRUCCIÓN DE TONO ANTERIOR\n" +
    "Habla CERCANO Y NATURAL, tuteando al cliente (de TÚ, no de usted). Cálido pero profesional — como alguien joven y buena onda que atiende bien, sin sonar acartonado ni corporativo.\n" +
    "- **TUTEA siempre:** '¿qué andas buscando?', 'te paso los precios', 'cualquier cosa me dices', 'te tomo el pedido'. NUNCA 'le puedo ayudar', 'usted', '¿qué anda buscando?', '¿desea?'.\n" +
    "- Suena natural y chileno suave, sin jerga fuerte (nada de 'cachái', 'po', 'weá', 'bacán'). Sí puedes usar con moderación: 'dale', 'listo', 'al tiro', 'cualquier cosa me avisas', 'genial'.\n" +
    "- Frases CORTAS y directas. Evita fórmulas rígidas ('no dude en', 'hágamelo saber', 'con gusto le puedo ofrecer'). Mejor: 'te muestro', 'mira', 'te cuento'.\n" +
    "- **Saludo/bienvenida en tono nuevo.** Ej. primer mensaje: '¡Hola! 😊 Soy Sofía. Cuéntame, ¿qué andas buscando? Te puedo pasar precios, tomar tu pedido o agendar con un vendedor.' NO listes funciones tipo menú corporativo ('ventas de un período, deuda de un cliente'); habla natural.\n" +
    "- Emojis con moderación (😊 🥟), no en cada frase.\n" +
    "- Respuestas BREVES para WhatsApp: máximo 4-5 frases.\n" +
    "- Formatea montos en pesos chilenos: $1.234 (punto de miles, sin decimales). Precios mayoristas suelen ser por unidad o docena; si no especifican, aclara la unidad.\n" +
    "- Muestra los productos con el nombre tal como viene del catálogo (stock_producto).\n" +
    "\n## AGENDAR REUNIÓN — EL SISTEMA LA CREA, TÚ SOLO PIDES LOS DATOS\n" +
    "El sistema agenda la reunión AUTOMÁTICAMENTE en segundo plano cuando tiene fecha, hora y correo. Tu única tarea es RECOPILAR esos datos con naturalidad.\n" +
    "- Para agendar solo necesitas: **fecha, hora y correo** (el motivo es opcional). **NO pidas el nombre del local/negocio.**\n" +
    "- Si FALTAN datos, pídelos ('¿para qué fecha y hora? ¿a qué correo te envío la invitación?').\n" +
    "- **PROHIBIDO afirmar que agendaste.** Cuando el cliente da fecha+hora+correo, tu ÚNICA respuesta permitida es EXACTAMENTE algo como: 'Perfecto, coordino la reunión y te llega la confirmación en un momento 😊'. NUNCA digas 'quedó agendada', 'está agendada', 'te envié la invitación', 'nos vemos ahí' ni menciones la hora como confirmada — el SISTEMA agenda y confirma él mismo justo después de tu mensaje. Si tú también confirmas, el cliente recibe DOS confirmaciones (mala experiencia). Solo di que estás coordinando, nada más.\n" +
    "- NO uses las tools de calendario tú mismo; el sistema se encarga.\n";
  // Reemplazar el saludo/bienvenida HARDCODEADO del prompt base (tono viejo "usted"/menú
  // corporativo) por uno con el tono nuevo (tú, natural). Sin esto el LLM lo copia literal.
  let sm0 = agent.parameters.options.systemMessage || "";
  // Cubrir las variantes del saludo owner y cliente que traía el prompt base.
  sm0 = sm0.replace(
    /Le puedo ayudar con:[^"]*?(?:menú"|opciones)\.?\)?/g,
    "¿qué andas buscando? Te paso precios, te tomo el pedido o te agendo con un vendedor. Cuéntame nomás 😊"
  );
  // Neutralizar cualquier "Le puedo ayudar" suelto que quede.
  sm0 = sm0.replace(/Le puedo ayudar/g, "Te puedo ayudar");
  sm0 = sm0.replace(/¿Qué anda buscando\?/g, "¿Qué andas buscando?");

  // ===== OPTIMIZACIÓN FASE A: eliminar secciones VIEJAS contradictorias del prompt base =====
  // (Sus versiones nuevas se inyectan en `extra`. Dejar ambas confunde al agente e infla tokens.)
  // 1) TONO VIEJO ("## Tono y estilo" → hasta "## Reglas duras"): dice USTED, contradice el tono nuevo (tutea).
  sm0 = sm0.replace(/## Tono y estilo\n[\s\S]*?(?=## Reglas duras)/, "");
  // 2) AGENDA VIEJA ("## Herramientas de agenda..." → hasta "## Menú interactivo"): dice "usa las tools de calendario",
  //    pero la agenda ahora es FLUJO DETERMINISTA (el sistema crea el evento). Contradicción directa.
  sm0 = sm0.replace(/## Herramientas de agenda \(verificar_disponibilidad y crear_reunion\)\n[\s\S]*?(?=## Menú interactivo)/, "");
  // 3) BIENVENIDA VIEJA ("## Bienvenida" → hasta "## Escalamiento a un vendedor"): formato corporativo,
  //    reemplazado por el saludo natural del tono nuevo.
  sm0 = sm0.replace(/## Bienvenida\n[\s\S]*?(?=## Escalamiento a un vendedor)/, "");
  // 4) Arreglar referencias HUÉRFANAS a la sección "Bienvenida" (que acabamos de eliminar):
  //    apuntarlas al saludo del tono nuevo, para que no manden a una sección inexistente.
  sm0 = sm0.replace(/ver sección Bienvenida/g, "ver saludo en Tono y estilo");
  sm0 = sm0.replace(/ver la sección Bienvenida/g, "ver el saludo en Tono y estilo");
  // ===========================================================================================

  agent.parameters.options.systemMessage = sm0 + extra;
}

// --- 4a2) Calendar ID: reemplazar el placeholder por 'primary' (calendario principal
// de la cuenta Google conectada). Sin esto, crear_reunion/verificar fallan silenciosamente.
for (const n of wf.nodes) {
  if (n.type === "n8n-nodes-base.googleCalendarTool" && n.parameters && n.parameters.calendar) {
    if (n.parameters.calendar.value === "REEMPLAZAR_CALENDAR_ID") {
      // 'primary' con cachedResultName para que n8n lo acepte como resource locator válido
      n.parameters.calendar = { __rl: true, value: "primary", mode: "list", cachedResultName: "Principal (primary)" };
    }
  }
}

// --- 4b) REINTENTO AUTOMÁTICO en nodos OpenAI (rate limit / errores transitorios) ---
// Si OpenAI da "Rate limit reached" u otro error temporal, reintenta en vez de fallar.
for (const n of wf.nodes) {
  if (/langchain\.agent|lmChatOpenAi|langchain\.openAi/i.test(n.type)) {
    n.retryOnFail = true;
    n.maxTries = 3;
    n.waitBetweenTries = 3000; // 3s entre intentos
  }
}

// --- 5) Escribir SIN BOM ---
const outFile = path.join(DIR, "workflow_crm_empresarial.json");
fs.writeFileSync(outFile, JSON.stringify(wf, null, 2), { encoding: "utf8" });
console.log("OK ->", outFile);
console.log("nodos:", wf.nodes.length, "| name:", wf.name);
console.log("webhook path: whatsapp-agent (se activa manual al final)");
console.log("tools CRM: crm_guardar_lead (toolWorkflow->" + SUBWF_UPSERT_ID + "), crm_actualizar_estado (httpRequestTool)");
