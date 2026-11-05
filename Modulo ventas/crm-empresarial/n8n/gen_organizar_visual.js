// gen_organizar_visual.js
// ORGANIZA VISUALMENTE el workflow (posición + color de nodos + sticky notes de sección).
// NO toca lógica, conexiones, expresiones, parámetros, credenciales ni nombres.
// Solo modifica: node.position, node.color y agrega nodos stickyNote (visuales, sin conexión).
//
// Corre SOBRE workflow_final.json -> produce workflow_final_organizado.json
// (se despliega este; la lógica es idéntica).

const fs = require("fs");
const path = require("path");
const DIR = __dirname;
const w = JSON.parse(fs.readFileSync(path.join(DIR, "workflow_final.json"), "utf8").replace(/^﻿/, ""));

// ---- Paleta de colores n8n (1..7). Asignamos un color por sección. ----
// n8n colores nodo: usamos el campo node.color con un HEX (n8n lo respeta en nodos).
const COLORES = {
  entrada:   "#2E86DE", // azul  - Entrada/Canales
  media:     "#8E44AD", // morado- Multimedia
  contexto:  "#16A085", // teal  - Identificación/Contexto
  guarda:    "#E67E22", // naranja- Guarda bot on/off (lógica)
  buffer:    "#E67E22", // naranja- Buffer (lógica)
  agente:    "#9B59B6", // violeta- Agente IA
  respuesta: "#2E86DE", // azul  - Respuesta al cliente (canal)
  crm:       "#27AE60", // verde - CRM/Leads
  humano:    "#C0392B", // rojo  - Derivación a humano
  chatwoot:  "#795548", // café  - Integración Chatwoot
  agenda:    "#F1C40F", // amarillo- Agendamiento
};

// ---- Asignación de cada nodo a su sección ----
const SECCION = {
  // 1 ENTRADA
  "Webhook Verificación (GET)":"entrada","Responder challenge Meta":"entrada","Webhook WhatsApp":"entrada",
  "Switch tipo mensaje":"entrada","Responder 200 (texto)":"entrada","Responder 200 (media)":"entrada",
  "Responder 200 (otros)":"entrada","¿Otros: es mensaje?":"entrada","Enviar aviso (otros)":"entrada",
  // 2 MULTIMEDIA
  "Extraer media":"media","Obtener URL media":"media","Descargar binario":"media","Switch media descargada":"media",
  "Whisper transcribir":"media","Normalizar audio":"media","GPT-4o Vision":"media","Normalizar imagen":"media",
  "Extraer texto PDF":"media","Normalizar documento":"media",
  // 3 IDENTIFICACIÓN & CONTEXTO
  "Extraer campos":"contexto","Resolver empresa":"contexto","Merge empresa+msg":"contexto","Resolver rol":"contexto",
  "Determinar rol":"contexto","Recuperar historial":"contexto","Consolidar contexto":"contexto",
  // 4 GUARDA ON/OFF
  "Guarda: leer bot_activo":"guarda","Guarda: ¿bot activo?":"guarda",
  // 5 BUFFER
  "Buffer: guardar mi marca":"buffer","Buffer: push mensaje":"buffer","Buffer: set timestamp":"buffer",
  "Buffer: esperar 8s":"buffer","Buffer: leer timestamp":"buffer","Buffer: ¿soy el último?":"buffer",
  "Buffer: leer mensajes":"buffer","Buffer: limpiar lista":"buffer","Buffer: combinar mensajes":"buffer",
  // 6 AGENTE IA
  "AI Agent":"agente","OpenAI GPT-4o":"agente","stock_producto":"agente","ventas_periodo":"agente",
  "top_productos":"agente","saldo_cliente":"agente","mostrar_menu":"agente",
  "verificar_disponibilidad":"agente","crear_reunion":"agente","crm_guardar_lead":"agente","crm_actualizar_estado":"agente",
  // 7 RESPUESTA
  "Guardar turno":"respuesta","IF ¿enviar texto?":"respuesta","Enviar WhatsApp":"respuesta",
  // 8 CRM/LEADS
  "Detectar interés (auto)":"crm","¿Registrar lead?":"crm","Registrar lead (auto)":"crm",
  // 9 HUMANO
  "¿Alertar vendedor?":"humano","Alertar vendedor":"humano",
  // 10 CHATWOOT
  "Espejar a Chatwoot":"chatwoot",
  // 11 AGENDA
  "Detectar agenda (auto)":"agenda","¿Agendar?":"agenda","Crear evento (Calendar)":"agenda","Confirmar agenda (WhatsApp)":"agenda",
};

// ---- Layout: cada sección en una BANDA vertical (Y), nodos en orden X dentro de la banda ----
// bandas (top Y de cada sección) - separadas para no solaparse
const BANDA_Y = {
  entrada:   0,
  media:     420,
  contexto:  820,
  guarda:    1120,
  buffer:    1320,
  agente:    1700,
  respuesta: 2200,
  crm:       2420,
  humano:    2640,
  chatwoot:  2820,
  agenda:    3000,
};
// Orden X de los nodos dentro de cada banda (secuencia lógica). Los no listados van al final.
const ORDEN_X = {
  entrada: ["Webhook Verificación (GET)","Responder challenge Meta","Webhook WhatsApp","Switch tipo mensaje","Responder 200 (texto)","Responder 200 (media)","Responder 200 (otros)","¿Otros: es mensaje?","Enviar aviso (otros)"],
  media: ["Extraer media","Obtener URL media","Descargar binario","Switch media descargada","Whisper transcribir","Normalizar audio","GPT-4o Vision","Normalizar imagen","Extraer texto PDF","Normalizar documento"],
  contexto: ["Extraer campos","Resolver empresa","Merge empresa+msg","Resolver rol","Determinar rol","Recuperar historial","Consolidar contexto"],
  guarda: ["Guarda: leer bot_activo","Guarda: ¿bot activo?"],
  buffer: ["Buffer: guardar mi marca","Buffer: push mensaje","Buffer: set timestamp","Buffer: esperar 8s","Buffer: leer timestamp","Buffer: ¿soy el último?","Buffer: leer mensajes","Buffer: limpiar lista","Buffer: combinar mensajes"],
  agente: ["AI Agent","OpenAI GPT-4o","stock_producto","ventas_periodo","top_productos","saldo_cliente","mostrar_menu","verificar_disponibilidad","crear_reunion","crm_guardar_lead","crm_actualizar_estado"],
  respuesta: ["Guardar turno","IF ¿enviar texto?","Enviar WhatsApp"],
  crm: ["Detectar interés (auto)","¿Registrar lead?","Registrar lead (auto)"],
  humano: ["¿Alertar vendedor?","Alertar vendedor"],
  chatwoot: ["Espejar a Chatwoot"],
  agenda: ["Detectar agenda (auto)","¿Agendar?","Crear evento (Calendar)","Confirmar agenda (WhatsApp)"],
};

const X0 = 300;      // X inicial de cada banda (deja espacio a la izquierda para el sticky)
const DX = 260;      // separación horizontal entre nodos
const SUB_DY = 150;  // separación vertical para sub-nodos (2a fila dentro de banda)

// aplicar SOLO posición (el color de nodo normal no lo acepta la API de n8n;
// la separación visual la dan las bandas + los sticky notes de color por sección)
for (const n of w.nodes) {
  const sec = SECCION[n.name];
  if (!sec) continue;
  const orden = ORDEN_X[sec] || [];
  let idx = orden.indexOf(n.name);
  if (idx === -1) idx = orden.length;
  n.position = [X0 + idx * DX, BANDA_Y[sec]];
}

// Ajuste: los sub-nodos del AGENTE (tools + LLM) van en una 2a fila bajo el AI Agent
const agenteSub = ["OpenAI GPT-4o","stock_producto","ventas_periodo","top_productos","saldo_cliente","mostrar_menu","verificar_disponibilidad","crear_reunion","crm_guardar_lead","crm_actualizar_estado"];
agenteSub.forEach((nm, i) => {
  const n = w.nodes.find(x => x.name === nm);
  if (n) n.position = [X0 + i * DX, BANDA_Y.agente + SUB_DY];
});
// el AI Agent centrado arriba de sus tools
const agent = w.nodes.find(x => x.name === "AI Agent");
if (agent) agent.position = [X0 + 4 * DX, BANDA_Y.agente];

// ---- Sticky notes de sección (nodos visuales, NO se conectan) ----
// color: número de color de sticky note de n8n (1..7):
// 1 amarillo, 2 naranja/rojo, 3 rojo, 4 azul/cyan, 5 verde, 6 morado, 7 gris
const SECCIONES_INFO = [
  { sec:"entrada",   color:4, titulo:"1 · ENTRADA / CANALES",              desc:"Webhooks de Meta (WhatsApp), verificación, switch por tipo de mensaje y ACK 200 (<5s anti-duplicados)." },
  { sec:"media",     color:6, titulo:"2 · PROCESAMIENTO MULTIMEDIA",       desc:"Descarga y convierte a texto: audio (Whisper), imagen (GPT-4o Vision), PDF (Extract). Converge al contexto." },
  { sec:"contexto",  color:5, titulo:"3 · IDENTIFICACIÓN & CONTEXTO",      desc:"Extrae campos, resuelve empresa/rol (tenant), recupera historial y consolida el contexto para el agente." },
  { sec:"guarda",    color:2, titulo:"4 · GUARDA BOT ON/OFF",             desc:"Lee bot_activo del CRM. Si el vendedor tomó la conversación (OFF), el bot NO responde." },
  { sec:"buffer",    color:2, titulo:"5 · BUFFER DE MENSAJES (Redis, 8s)", desc:"Agrupa mensajes seguidos del cliente en uno solo (debounce). Solo el último llega al agente." },
  { sec:"agente",    color:6, titulo:"6 · AGENTE IA (Sofía)",             desc:"AI Agent + GPT-4o + tools (stock, ventas, menú, calendario, CRM). Memoria por historial." },
  { sec:"respuesta", color:4, titulo:"7 · RESPUESTA AL CLIENTE",          desc:"Guarda el turno, filtra si hay texto y envía la respuesta por WhatsApp (Meta)." },
  { sec:"crm",       color:5, titulo:"8 · CRM / LEADS (automático)",       desc:"Detecta interés y producto, registra/actualiza el lead en NocoDB (vía webhook upsert). No depende del agente." },
  { sec:"humano",    color:3, titulo:"9 · DERIVACIÓN A HUMANO",          desc:"Si el lead pide vendedor: alerta al vendedor (WhatsApp) + reabre/etiqueta la conversación en Chatwoot." },
  { sec:"chatwoot",  color:7, titulo:"10 · ESPEJO CHATWOOT (bandeja)",     desc:"Copia cada conversación a Chatwoot para que los vendedores la vean y puedan tomar el control." },
  { sec:"agenda",    color:1, titulo:"11 · AGENDAMIENTO (Google Calendar)",desc:"Detecta intención + extrae fecha/hora/correo/motivo, crea el evento real en Calendar y confirma por WhatsApp." },
];

let stickyId = 0;
for (const info of SECCIONES_INFO) {
  const orden = ORDEN_X[info.sec] || [];
  const anchoNodos = Math.max(orden.length, (info.sec==="agente"?11:orden.length));
  const width = Math.max(anchoNodos * DX + 120, 420);
  const y = BANDA_Y[info.sec] - 130; // arriba de la banda
  const height = (info.sec==="agente" || info.sec==="media" || info.sec==="buffer") ? 460 : 260;
  w.nodes.push({
    parameters: {
      content: `## ${info.titulo}\n\n${info.desc}`,
      height, width,
      color: info.color, // color de sticky por sección (separación visual)
    },
    id: `sticky-${stickyId++}-0000-4000-8000-000000000000`.slice(0,36),
    name: `📌 ${info.titulo}`,
    type: "n8n-nodes-base.stickyNote",
    typeVersion: 1,
    position: [X0 - 120, y],
  });
}

// ---- Sticky note de portada (arriba de todo) ----
w.nodes.push({
  parameters: {
    content: "# 🤖 Agente Whatsap CRM Empresarial\n\n**Flujo:** Entrada → Contexto → Guarda → Buffer → Agente IA → Respuesta → CRM → Humano → Chatwoot → Agenda\n\nCRM WhatsApp para panadería mayorista. Cada banda de color es una sección funcional (ver notas).\n\n🔵 Canales  🟣 IA/Multimedia  🟢 CRM  🟠 Lógica  🟡 Agenda  🔴 Humano  🟤 Chatwoot",
    height: 220, width: 640, color: 4,
  },
  id: "sticky-portada-4000-8000-000000000000".slice(0,36),
  name: "📋 PORTADA",
  type: "n8n-nodes-base.stickyNote",
  typeVersion: 1,
  position: [X0 - 120, -320],
});

const outFile = path.join(DIR, "workflow_final_organizado.json");
fs.writeFileSync(outFile, JSON.stringify(w, null, 2), { encoding: "utf8" });
console.log("OK ->", outFile, "| nodos totales (con sticky):", w.nodes.length);
