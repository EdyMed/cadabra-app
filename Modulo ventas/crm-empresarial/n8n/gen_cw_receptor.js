// gen_cw_receptor.js
// Sub-workflow "Chatwoot Receptor (handoff)": recibe eventos de Chatwoot.
// Flujo: [Webhook] -> [Code: decide + setea bot_activo en NocoDB] -> [IF ¿reenviar?]
//        sí -> [HTTP: enviar a WhatsApp (cred Meta)] ; no -> fin.
//
// - Vendedor responde en Chatwoot (outgoing, sin marca espejo, con contenido):
//     bot_activo=false (bot se calla) + reenviar el texto al cliente por WhatsApp.
// - Conversación resuelta en Chatwoot: bot_activo=true (bot vuelve).
// - Ignora: mensajes espejados (content_attributes.espejo=true), incoming, sin contenido.
//
// El envío a Meta va en un nodo HTTP aparte (httpRequestWithAuthentication NO existe en
// Code node). Salida SIN BOM.

const fs = require("fs");
const path = require("path");

const nodes = [];
const conn = {};

nodes.push({
  parameters: { httpMethod: "POST", path: "chatwoot-eventos", responseMode: "lastNode", options: {} },
  id: "g0000000-0000-4000-8000-000000000001",
  name: "Webhook Chatwoot",
  type: "n8n-nodes-base.webhook",
  typeVersion: 2,
  position: [220, 300],
  webhookId: "chatwoot-eventos-cadabra",
});

// Code: decide y setea bot_activo en NocoDB. Devuelve { reenviar, wa, contenido }.
const code =
  "const NOCODB='https://appcadabra-nocodb.jmyxxj.easypanel.host';\n" +
  "const TID='mcp3sx8fm259gn6';\n" +
  "const NC_TOKEN='REEMPLAZAR_TOKEN_NOCODB';\n" +
  "const b = $input.first().json.body || {};\n" +
  "const req = async (method, url, headers, body) => {\n" +
  "  try { const opt={ method, url, headers, json:true }; if(body) opt.body=body; return await this.helpers.httpRequest(opt); }\n" +
  "  catch(e){ return (e.response&&e.response.body)?e.response.body:{ __err:String(e.message||e) }; }\n" +
  "};\n" +
  "const event = b.event;\n" +
  "const wa = (((b.conversation||{}).meta||{}).sender||{}).identifier " +
  "        || ((b.meta||{}).sender||{}).identifier " +  // conversation_updated pone el sender en b.meta.sender
  "        || (b.sender||{}).identifier " +
  "        || (b.contact||{}).identifier || '';\n" +
  "const NCH={ 'xc-token':NC_TOKEN, 'Content-Type':'application/json' };\n" +
  "const setBot = async (activo) => {\n" +
  "  if(!wa) return;\n" +
  "  const q = await req('GET', `${NOCODB}/api/v2/tables/${TID}/records?where=(contact_id,eq,${wa})&limit=1`, NCH);\n" +
  "  const row = q && q.list && q.list[0];\n" +
  "  if(row) await req('PATCH', `${NOCODB}/api/v2/tables/${TID}/records`, NCH, { Id: row.Id, bot_activo: activo });\n" +
  "};\n" +
  "// PRIORIDAD 1: mensaje de un vendedor (message_created outgoing, sin marca espejo).\n" +
  "// Va PRIMERO: un mensaje del vendedor SIEMPRE toma el control, aunque el evento\n" +
  "// traiga status=resolved heredado de la conversación.\n" +
  "if (event==='message_created') {\n" +
  "  const esOutgoing = (b.message_type==='outgoing' || b.message_type===1);\n" +
  "  const esEspejo = !!(b.content_attributes && b.content_attributes.espejo);\n" +
  "  const contenido = (b.content||'').trim();\n" +
  "  if (esOutgoing && !esEspejo && contenido && wa) {\n" +
  "    await setBot(false);\n" +
  "    return [{ json:{ reenviar:true, wa, contenido } }];\n" +
  "  }\n" +
  "  return [{ json:{ reenviar:false, accion:'ignorado', motivo: esEspejo?'espejo':(!esOutgoing?'incoming':'sin_contenido') } }];\n" +
  "}\n" +
  "// PRIORIDAD 2: conversación RESUELTA (solo en conversation_updated) -> reactivar bot.\n" +
  "if (event==='conversation_updated' || event==='conversation_resolved') {\n" +
  "  const resuelto = (event==='conversation_resolved') || (b.status==='resolved') || (((b.conversation||{}).status)==='resolved');\n" +
  "  if (resuelto) { await setBot(true); return [{ json:{ reenviar:false, accion:'bot_reactivado', wa } }]; }\n" +
  "}\n" +
  "return [{ json:{ reenviar:false, accion:'evento_ignorado', event } }];\n";

nodes.push({
  parameters: { jsCode: code, options: {} },
  id: "g0000000-0000-4000-8000-000000000002",
  name: "Procesar evento Chatwoot",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [440, 300],
});

// IF ¿reenviar?
nodes.push({
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "loose" },
      conditions: [
        { id: "c-reenv", leftValue: "={{ $json.reenviar }}", rightValue: true, operator: { type: "boolean", operation: "true", singleValue: true } },
      ],
      combinator: "and",
    },
    options: {},
  },
  id: "g0000000-0000-4000-8000-000000000003",
  name: "¿Reenviar a WhatsApp?",
  type: "n8n-nodes-base.if",
  typeVersion: 2,
  position: [660, 300],
});

// HTTP: enviar a WhatsApp con la credencial Meta del bot
nodes.push({
  parameters: {
    method: "POST",
    url: "=https://graph.facebook.com/v21.0/1168256669712210/messages",
    authentication: "genericCredentialType",
    genericAuthType: "httpHeaderAuth",
    sendHeaders: true,
    headerParameters: { parameters: [{ name: "Content-Type", value: "application/json" }] },
    sendBody: true,
    specifyBody: "json",
    jsonBody: "={{ JSON.stringify({ messaging_product:'whatsapp', to: $json.wa, type:'text', text:{ body: $json.contenido } }) }}",
    options: {},
  },
  id: "g0000000-0000-4000-8000-000000000004",
  name: "Enviar a WhatsApp (vendedor)",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [880, 220],
  credentials: { httpHeaderAuth: { id: "AkIBFXVUDXwvv1ta", name: "Header Auth account" } },
});

conn["Webhook Chatwoot"] = { main: [[{ node: "Procesar evento Chatwoot", type: "main", index: 0 }]] };
conn["Procesar evento Chatwoot"] = { main: [[{ node: "¿Reenviar a WhatsApp?", type: "main", index: 0 }]] };
conn["¿Reenviar a WhatsApp?"] = { main: [[{ node: "Enviar a WhatsApp (vendedor)", type: "main", index: 0 }], []] };

const wf = {
  name: "Chatwoot Receptor (handoff)",
  nodes,
  connections: conn,
  settings: { executionOrder: "v1" },
  staticData: null,
};

fs.writeFileSync(path.join(__dirname, "workflow_cw_receptor.json"), JSON.stringify(wf, null, 2), { encoding: "utf8" });
console.log("OK receptor | nodos:", nodes.length);
