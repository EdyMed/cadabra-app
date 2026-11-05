// gen_guarda_onoff.js
// Inserta la GUARDA BOT ON/OFF (handoff humano) en el workflow buffer.
// Antes de procesar, consulta NocoDB: si el lead de ese número tiene bot_activo=false,
// el bot NO responde (un humano lo está atendiendo). Si no existe o está true, sigue.
//
// Corre SOBRE workflow_crm_empresarial_buffer.json → produce workflow_final.json
//
// Inserción: Consolidar contexto -> [Buscar bot_activo (HTTP GET NocoDB)] ->
//            [IF ¿bot activo?] -> sí: "Buffer: guardar mi marca" / no: (termina)

const fs = require("fs");
const path = require("path");
const DIR = __dirname;

const w = JSON.parse(fs.readFileSync(path.join(DIR, "workflow_crm_empresarial_buffer.json"), "utf8").replace(/^﻿/, ""));

const NOCODB_BASE = "https://appcadabra-nocodb.jmyxxj.easypanel.host";
const TABLE_ID = "mcp3sx8fm259gn6";
const RECORDS = `${NOCODB_BASE}/api/v2/tables/${TABLE_ID}/records`;
const CRED_NOCODB = { httpHeaderAuth: { id: "jErLq0zOrAIRE72s", name: "NocoDB xc-token" } };

// 1) Buscar el lead por contact_id para leer bot_activo
const nodeBuscar = {
  parameters: {
    method: "GET",
    url: `=${RECORDS}`,
    authentication: "genericCredentialType",
    genericAuthType: "httpHeaderAuth",
    sendQuery: true,
    queryParameters: {
      parameters: [
        { name: "where", value: "=(contact_id,eq,{{ $('Consolidar contexto').first().json.from }})" },
        { name: "limit", value: "1" },
        { name: "fields", value: "Id,contact_id,bot_activo" },
      ],
    },
    options: {},
  },
  id: "e0000000-0000-4000-8000-000000000001",
  name: "Guarda: leer bot_activo",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [1120, 400],
  credentials: CRED_NOCODB,
  // No romper el flujo si NocoDB falla: continuar (mejor responder que caerse)
  onError: "continueRegularOutput",
};

// 2) IF ¿bot activo? -> true si NO existe el lead, o si existe y bot_activo != false
const nodeIf = {
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "loose" },
      conditions: [
        {
          id: "c-onoff",
          // bot_activo del lead encontrado; si no hay lista o está vacía => activo (true).
          leftValue:
            "={{ ($json.list && $json.list.length > 0) ? ($json.list[0].bot_activo === false ? 'OFF' : 'ON') : 'ON' }}",
          rightValue: "ON",
          operator: { type: "string", operation: "equals" },
        },
      ],
      combinator: "and",
    },
    options: {},
  },
  id: "e0000000-0000-4000-8000-000000000002",
  name: "Guarda: ¿bot activo?",
  type: "n8n-nodes-base.if",
  typeVersion: 2,
  position: [1340, 400],
};

// Con el bot APAGADO (rama OFF) igual hay que ESPEJAR el mensaje del cliente a Chatwoot,
// para que el vendedor que tomó el control vea lo que el cliente sigue escribiendo.
// (Sin respuesta_bot, porque el bot no responde — el sub-workflow espejo solo mete el
//  mensaje entrante cuando respuesta_bot viene vacío.)
const nodeEspejoOff = {
  parameters: {
    method: "POST",
    url: "https://appcadabra-cadabra-project.jmyxxj.easypanel.host/webhook/chatwoot-espejo",
    sendHeaders: true,
    headerParameters: { parameters: [{ name: "Content-Type", value: "application/json" }] },
    sendBody: true,
    specifyBody: "json",
    jsonBody:
      "={{ JSON.stringify({ " +
      "wa_id: $('Consolidar contexto').first().json.from, " +
      "nombre: $('Consolidar contexto').first().json.nombre_contacto || '', " +
      "mensaje_cliente: $('Consolidar contexto').first().json.user_message || '' " +
      "}) }}",
    options: {},
  },
  id: "e0000000-0000-4000-8000-000000000010",
  name: "Espejar cliente (bot OFF)",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [1340, 560],
  onError: "continueRegularOutput", // si Chatwoot falla, no pasa nada
};

// CONTADOR DE CONVERSACIONES: en cada mensaje, llama al sub-workflow contador (ventana 24h
// vía Redis). Cuenta conversaciones únicas para facturar por plan. Rama paralela, no bloquea.
const nodeContador = {
  parameters: {
    method: "POST",
    url: "https://appcadabra-cadabra-project.jmyxxj.easypanel.host/webhook/contar-conversacion",
    sendHeaders: true,
    headerParameters: { parameters: [{ name: "Content-Type", value: "application/json" }] },
    sendBody: true,
    specifyBody: "json",
    jsonBody:
      "={{ JSON.stringify({ empresa: $('Consolidar contexto').first().json.empresa || 1, wa_id: $('Consolidar contexto').first().json.from }) }}",
    options: {},
  },
  id: "e0000000-0000-4000-8000-000000000020",
  name: "Contar conversación",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [1120, 240],
  onError: "continueRegularOutput", // si el contador falla, el bot sigue normal
};

w.nodes.push(nodeBuscar, nodeIf, nodeEspejoOff, nodeContador);

// Reconectar: Consolidar contexto -> [Guarda leer bot_activo] + [Contar conversación] (paralelo)
w.connections["Consolidar contexto"] = { main: [[
  { node: "Guarda: leer bot_activo", type: "main", index: 0 },
  { node: "Contar conversación", type: "main", index: 0 },
]] };
w.connections["Guarda: leer bot_activo"] = { main: [[{ node: "Guarda: ¿bot activo?", type: "main", index: 0 }]] };
w.connections["Guarda: ¿bot activo?"] = {
  main: [
    [{ node: "Buffer: guardar mi marca", type: "main", index: 0 }], // ON -> sigue al bot
    [{ node: "Espejar cliente (bot OFF)", type: "main", index: 0 }], // OFF -> espeja el mensaje del cliente a Chatwoot
  ],
};

// --- ESPEJO A CHATWOOT: tras responder el bot, copiar la conversación a Chatwoot ---
// Cuelga de "Guardar turno" en paralelo (no bloquea el envío al cliente).
const nodeEspejo = {
  parameters: {
    method: "POST",
    url: "https://appcadabra-cadabra-project.jmyxxj.easypanel.host/webhook/chatwoot-espejo",
    sendHeaders: true,
    headerParameters: { parameters: [{ name: "Content-Type", value: "application/json" }] },
    sendBody: true,
    specifyBody: "json",
    jsonBody:
      "={{ JSON.stringify({ " +
      "wa_id: $('Consolidar contexto').first().json.from, " +
      "nombre: $('Consolidar contexto').first().json.nombre_contacto || '', " +
      "mensaje_cliente: $('Consolidar contexto').first().json.user_message || '', " +
      "respuesta_bot: ($('AI Agent').first() ? $('AI Agent').first().json.output : '') || '' " +
      "}) }}",
    options: {},
  },
  id: "e0000000-0000-4000-8000-000000000003",
  name: "Espejar a Chatwoot",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [1120, 760],
  onError: "continueRegularOutput", // si Chatwoot falla, el bot NO se cae
};
w.nodes.push(nodeEspejo);
// Colgar de "Guardar turno" (añadir a las ramas existentes)
if (w.connections["Guardar turno"] && w.connections["Guardar turno"].main && w.connections["Guardar turno"].main[0]) {
  w.connections["Guardar turno"].main[0].push({ node: "Espejar a Chatwoot", type: "main", index: 0 });
}

const outFile = path.join(DIR, "workflow_final.json");
fs.writeFileSync(outFile, JSON.stringify(w, null, 2), { encoding: "utf8" });
console.log("OK ->", outFile, "| total nodos:", w.nodes.length);
