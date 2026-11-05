// gen_agenda_determinista.js
// Agrega al workflow_final.json un FLUJO DETERMINISTA DE AGENDAMIENTO que NO depende
// de que el agente llame las tools (el LLM las omitía siempre).
//
// Rama paralela colgada de "Guardar turno":
//   [Detectar agenda (Code)] -> [IF ¿agendar?] -> [Crear evento Google Calendar] -> [Confirmar por WhatsApp]
//
// El Code detecta intención de agendar + extrae fecha/hora/correo/motivo del mensaje
// (mirando el mensaje actual + historial reciente, porque los datos pueden venir en turnos).
// Si tiene fecha+hora+correo, crea el evento en 'primary'. Confirma al cliente por WhatsApp.
//
// Corre SOBRE workflow_final.json (que ya trae clon+buffer+guarda+chatwoot+alerta).
// Salida: sobrescribe workflow_final.json (queda como el workflow de prod definitivo).

const fs = require("fs");
const path = require("path");
const DIR = __dirname;
const F = path.join(DIR, "workflow_final.json");
const w = JSON.parse(fs.readFileSync(F, "utf8").replace(/^﻿/, ""));

const CRED_GCAL = { googleCalendarOAuth2Api: { id: "bpCcBAeM6BGoXB2L", name: "Google Calendar account" } };
const CRED_META = { httpHeaderAuth: { id: "AkIBFXVUDXwvv1ta", name: "Header Auth account" } };

// 1) Code: detectar intención de agendar y extraer datos
const nodeDetectarAgenda = {
  parameters: {
    jsCode:
      "const ctx = $('Consolidar contexto').first().json;\n" +
      "const hist = ctx.history || [];\n" +
      "// texto = últimos turnos del USUARIO + mensaje actual (los datos pueden venir repartidos)\n" +
      "const histUser = hist.filter(h => h.role==='user').slice(-4).map(h=>h.content).join(' \\n ');\n" +
      "const full = (histUser + ' \\n ' + (ctx.user_message||''));\n" +
      "// INTENCIÓN: puede venir del historial. Pero los DATOS (hora/fecha/correo/motivo)\n" +
      "// se extraen SOLO del mensaje ACTUAL (si no, agarra la hora de una reunión anterior).\n" +
      "const low = (ctx.user_message||'').toLowerCase();\n" +
      "const lowFull = full.toLowerCase();\n" +
      "const wa = ctx.from;\n" +
      "// ¿hay intención de agendar? (mira historial + actual)\n" +
      "const quiereAgendar = /(agendar|agenda|reuni[oó]n|reunirnos|c[ií]ta|juntarnos|reservar hora|hora para)/.test(lowFull);\n" +
      "if (!quiereAgendar) return [{ json: { agendar:false, motivo:'sin intencion' } }];\n" +
      "\n" +
      "// --- extraer CORREO (solo del mensaje actual) ---\n" +
      "const em = (ctx.user_message||'').match(/[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}/i);\n" +
      "const correo = em ? em[0] : null;\n" +
      "\n" +
      "// --- extraer HORA (ej 'a las 12', '12:30', 'las 3 pm') ---\n" +
      "let hh=null, mm=0;\n" +
      "let mh = low.match(/(?:a\\s+las?\\s+|las\\s+)?(\\d{1,2})(?:[:\\.](\\d{2}))?\\s*(am|pm|hrs|horas|h)?/);\n" +
      "// buscar específicamente cerca de 'las' para no agarrar el '12' de otra cosa\n" +
      "let mh2 = low.match(/(?:a\\s+las?|las)\\s+(\\d{1,2})(?:[:\\.](\\d{2}))?\\s*(am|pm)?/);\n" +
      "const use = mh2 || mh;\n" +
      "if (use) { hh = parseInt(use[1]); mm = use[2]?parseInt(use[2]):0; const ap=use[3]; if(ap==='pm'&&hh<12)hh+=12; if(ap==='am'&&hh===12)hh=0; }\n" +
      "\n" +
      "// --- extraer FECHA ---\n" +
      "// base: ahora en Chile\n" +
      "const now = new Date(new Date().toLocaleString('en-US',{timeZone:'America/Santiago'}));\n" +
      "let fecha = null;\n" +
      "if (/pasado\\s+ma[ñn]ana/.test(low)) { fecha = new Date(now); fecha.setDate(fecha.getDate()+2); }\n" +
      "else if (/ma[ñn]ana/.test(low)) { fecha = new Date(now); fecha.setDate(fecha.getDate()+1); }\n" +
      "else if (/hoy/.test(low)) { fecha = new Date(now); }\n" +
      "else {\n" +
      "  // días de la semana: 'el viernes', 'este lunes', 'próximo martes' → el más cercano en el futuro\n" +
      "  const dias = { 'domingo':0,'lunes':1,'martes':2,'mi[eé]rcoles':3,'miercoles':3,'jueves':4,'viernes':5,'s[aá]bado':6,'sabado':6 };\n" +
      "  let diaSemana = null;\n" +
      "  for (const k in dias) { if (new RegExp('\\\\b'+k+'\\\\b').test(low)) { diaSemana = dias[k]; break; } }\n" +
      "  if (diaSemana !== null) {\n" +
      "    fecha = new Date(now);\n" +
      "    let delta = (diaSemana - fecha.getDay() + 7) % 7;\n" +
      "    if (delta === 0) delta = 7; // 'el viernes' cuando hoy es viernes = el próximo\n" +
      "    fecha.setDate(fecha.getDate() + delta);\n" +
      "  } else {\n" +
      "    const dm = (ctx.user_message||'').match(/(\\d{1,2})[\\/\\-](\\d{1,2})(?:[\\/\\-](\\d{2,4}))?/);\n" +
      "    if(dm){ const y=dm[3]?(dm[3].length===2?2000+parseInt(dm[3]):parseInt(dm[3])):now.getFullYear(); fecha=new Date(y, parseInt(dm[2])-1, parseInt(dm[1])); }\n" +
      "  }\n" +
      "}\n" +
      "\n" +
      "// --- MOTIVO: quitar lo ya parseado, tomar frase de motivo ---\n" +
      "let motivo = 'Reunión';\n" +
      "const mm2 = low.match(/(?:motivo|para|sobre|por)\\s+([\\wáéíóúñ ]{3,60})/);\n" +
      "const _min = new Set(['de','del','la','las','los','el','y','o','a','en','con','por','para','un','una']);\n" +
      "const cap = s => (s||'').split(/\\s+/).map((w,i) => { if(!w) return w; const l=w.toLowerCase(); if(i>0 && _min.has(l)) return l; return w.charAt(0).toUpperCase()+w.slice(1); }).join(' ');\n" +
      "if (mm2) motivo = cap(mm2[1].trim());\n" +
      "else { const partes=(ctx.user_message||'').split(',').map(s=>s.trim()).filter(Boolean); const ult=partes[partes.length-1]; if(ult && !/@|\\d{1,2}[:h]|las |ma[ñn]ana|hoy/.test(ult)) motivo=cap(ult); }\n" +
      "\n" +
      "// ¿tenemos lo mínimo? fecha + hora + correo\n" +
      "const completo = !!(fecha && hh!==null && correo && wa);\n" +
      "if (!completo) return [{ json: { agendar:false, incompleto:true, tiene_fecha:!!fecha, tiene_hora:hh!==null, tiene_correo:!!correo } }];\n" +
      "// ANTI-LOOP PRECISO: solo bloquea si en el historial YA se confirmó ESTA MISMA fecha+hora.\n" +
      "// (No bloquea reuniones nuevas con otra fecha/hora, aunque el historial tenga confirmaciones viejas.)\n" +
      "// Construir la etiqueta de esta reunión y buscar si ya se confirmó exactamente esa.\n" +
      "\n" +
      "// armar inicio/fin (1 hora) en formato local SIN zona (el nodo aplica America/Santiago)\n" +
      "const pad=n=>String(n).padStart(2,'0');\n" +
      "const y=fecha.getFullYear(), mo=pad(fecha.getMonth()+1), d=pad(fecha.getDate());\n" +
      "const inicio = `${y}-${mo}-${d}T${pad(hh)}:${pad(mm)}:00`;\n" +
      "const finH = (hh+1)%24;\n" +
      "const fin = `${y}-${mo}-${d}T${pad(finH)}:${pad(mm)}:00`;\n" +
      "// ANTI-LOOP PRECISO: bloquear solo si el bot YA confirmó ('te agendé/agendada') Y menciona\n" +
      "// esta MISMA fecha en el historial. Reuniones con otra fecha SÍ se agendan.\n" +
      "const histBot = hist.filter(h=>h.role==='assistant').map(h=>(h.content||'').toLowerCase()).join(' || ');\n" +
      "const fechaStr = `${y}-${mo}-${d}`;\n" +
      "const confirmoAntes = /(te agend[ée]|reuni[oó]n .{0,30}agendada)/.test(histBot);\n" +
      "const mismaFecha = histBot.includes(fechaStr);\n" +
      "if (confirmoAntes && mismaFecha) return [{ json: { agendar:false, motivo:'ya_agendada_misma_fecha' } }];\n" +
      "return [{ json: { agendar:true, wa, correo, inicio, fin, motivo, titulo: motivo } }];",
    options: {},
  },
  id: "a1000000-0000-4000-8000-000000000001",
  name: "Detectar agenda (auto)",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [1120, 900],
};

// 2) IF ¿agendar?
const nodeIfAgenda = {
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "loose" },
      conditions: [{ id: "c-ag", leftValue: "={{ $json.agendar }}", rightValue: true, operator: { type: "boolean", operation: "true", singleValue: true } }],
      combinator: "and",
    },
    options: {},
  },
  id: "a1000000-0000-4000-8000-000000000002",
  name: "¿Agendar?",
  type: "n8n-nodes-base.if",
  typeVersion: 2,
  position: [1340, 900],
};

// 3) Crear evento en Google Calendar (nodo regular, primary)
const nodeCrearEvento = {
  parameters: {
    resource: "event",
    operation: "create",
    calendar: { __rl: true, value: "primary", mode: "list", cachedResultName: "Principal (primary)" },
    start: "={{ $json.inicio }}",
    end: "={{ $json.fin }}",
    additionalFields: {
      summary: "={{ $json.titulo }}",
      description: "={{ $json.motivo }}",
      attendees: "={{ [$json.correo] }}",
      sendUpdates: "all",
      timezone: { __rl: true, value: "America/Santiago", mode: "list", cachedResultName: "America/Santiago" },
    },
  },
  id: "a1000000-0000-4000-8000-000000000003",
  name: "Crear evento (Calendar)",
  type: "n8n-nodes-base.googleCalendar",
  typeVersion: 1.3,
  position: [1560, 860],
  credentials: CRED_GCAL,
  onError: "continueRegularOutput",
};

// 4) Confirmar por WhatsApp al cliente
const nodeConfirmar = {
  parameters: {
    method: "POST",
    url: "=https://graph.facebook.com/v21.0/1168256669712210/messages",
    authentication: "genericCredentialType",
    genericAuthType: "httpHeaderAuth",
    sendHeaders: true,
    headerParameters: { parameters: [{ name: "Content-Type", value: "application/json" }] },
    sendBody: true,
    specifyBody: "json",
    jsonBody:
      "={{ (() => { const d = $('Detectar agenda (auto)').first().json; const ok = $json && ($json.id || $json.htmlLink); const txt = ok ? ('Listo ✅ Te agendé la reunión para ' + d.inicio.replace('T',' a las ').slice(0,19) + ' (' + d.titulo + '). Te llegó la invitación a ' + d.correo + ' 😊') : ('Uf, no pude agendar la reunión ahora mismo 😕. Un vendedor te contactará para coordinar.'); return JSON.stringify({ messaging_product:'whatsapp', to: d.wa, type:'text', text:{ body: txt } }); })() }}",
    options: {},
  },
  id: "a1000000-0000-4000-8000-000000000004",
  name: "Confirmar agenda (WhatsApp)",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [1780, 860],
  credentials: CRED_META,
  onError: "continueRegularOutput",
};

w.nodes.push(nodeDetectarAgenda, nodeIfAgenda, nodeCrearEvento, nodeConfirmar);

// Colgar de "Guardar turno" (rama paralela, junto a las otras)
if (w.connections["Guardar turno"] && w.connections["Guardar turno"].main && w.connections["Guardar turno"].main[0]) {
  w.connections["Guardar turno"].main[0].push({ node: "Detectar agenda (auto)", type: "main", index: 0 });
}
w.connections["Detectar agenda (auto)"] = { main: [[{ node: "¿Agendar?", type: "main", index: 0 }]] };
w.connections["¿Agendar?"] = { main: [[{ node: "Crear evento (Calendar)", type: "main", index: 0 }], []] };
w.connections["Crear evento (Calendar)"] = { main: [[{ node: "Confirmar agenda (WhatsApp)", type: "main", index: 0 }]] };

fs.writeFileSync(F, JSON.stringify(w, null, 2), { encoding: "utf8" });
console.log("OK agenda determinista | total nodos:", w.nodes.length);
