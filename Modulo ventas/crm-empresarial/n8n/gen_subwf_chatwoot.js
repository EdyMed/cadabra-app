// gen_subwf_chatwoot.js
// Sub-workflow "Chatwoot Espejo": recibe un lead+mensajes y los refleja en Chatwoot.
// Se llama por webhook desde el workflow principal (fire-and-forget, no bloquea al bot).
//
// Entrada (POST body): { wa_id, nombre, mensaje_cliente, respuesta_bot }
// Lógica (un Code con fetch): buscar contacto por identifier -> crear si no existe ->
//   obtener/crear conversación abierta -> push mensaje incoming (cliente) + outgoing (bot).
//
// Chatwoot: account 2, inbox 1. Credencial httpHeaderAuth NO aplica en Code fetch →
// el token va como header directo (se lee de una constante; para rotar, editar aquí o
// mover a variable de entorno de n8n).
//
// Salida SIN BOM: workflow_chatwoot_espejo.json

const fs = require("fs");
const path = require("path");

const nodes = [];
const conn = {};

// 1) Webhook trigger
nodes.push({
  parameters: { httpMethod: "POST", path: "chatwoot-espejo", responseMode: "lastNode", options: {} },
  id: "f0000000-0000-4000-8000-000000000001",
  name: "Webhook Espejo",
  type: "n8n-nodes-base.webhook",
  typeVersion: 2,
  position: [220, 400],
  webhookId: "chatwoot-espejo-cadabra",
});

// 2) Code: toda la lógica con fetch
const code =
  "const CW = 'https://appcadabra-chatwoot.jmyxxj.easypanel.host';\n" +
  "const ACC = '2';\n" +
  "const INBOX = 1;\n" +
  "const TOKEN = 'REEMPLAZAR_TOKEN_CHATWOOT';\n" +
  "const H = { 'api_access_token': TOKEN, 'Content-Type': 'application/json' };\n" +
  "const b = $input.first().json.body || {};\n" +
  "const wa = String(b.wa_id || '').replace(/[^0-9]/g,'');\n" +
  "if (!wa) return [{ json: { ok:false, motivo:'sin wa_id' } }];\n" +
  "const nombre = b.nombre || ('Cliente ' + wa);\n" +
  "const msgCliente = b.mensaje_cliente || '';\n" +
  "const msgBot = b.respuesta_bot || '';\n" +
  "\n" +
  "// Helper HTTP con el cliente de n8n (fetch no existe en Code node)\n" +
  "const req = async (method, url, body) => {\n" +
  "  try {\n" +
  "    const opt = { method, url, headers: H, json: true };\n" +
  "    if (body) opt.body = body;\n" +
  "    const d = await this.helpers.httpRequest(opt);\n" +
  "    return d;\n" +
  "  } catch (e) { return (e.response && e.response.body) ? e.response.body : { __err: String(e.message||e) }; }\n" +
  "};\n" +
  "\n" +
  "// 1) Buscar contacto por identifier (wa)\n" +
  "let contactId=null, sourceId=null;\n" +
  "const s = await req('GET', `${CW}/api/v1/accounts/${ACC}/contacts/search?q=${wa}`);\n" +
  "if (s && s.payload && s.payload.length) {\n" +
  "  const c = s.payload.find(x => x.identifier===wa || (x.phone_number||'').includes(wa)) || s.payload[0];\n" +
  "  contactId = c.id;\n" +
  "  const ci = await req('GET', `${CW}/api/v1/accounts/${ACC}/contacts/${contactId}`);\n" +
  "  const inboxes = (ci && ci.payload && ci.payload.contact_inboxes) || [];\n" +
  "  const mine = inboxes.find(x => x.inbox && x.inbox.id===INBOX);\n" +
  "  sourceId = mine ? mine.source_id : null;\n" +
  "}\n" +
  "// 2) Crear contacto si no existe\n" +
  "if (!contactId) {\n" +
  "  const cr = await req('POST', `${CW}/api/v1/accounts/${ACC}/contacts`, { inbox_id: INBOX, name: nombre, phone_number: '+'+wa, identifier: wa });\n" +
  "  contactId = cr && cr.payload && cr.payload.contact && cr.payload.contact.id;\n" +
  "  sourceId = cr && cr.payload && cr.payload.contact_inbox && cr.payload.contact_inbox.source_id;\n" +
  "}\n" +
  "// 3) Si no tengo source_id aún, crear el contact_inbox\n" +
  "if (contactId && !sourceId) {\n" +
  "  const cib = await req('POST', `${CW}/api/v1/accounts/${ACC}/contacts/${contactId}/contact_inboxes`, { inbox_id: INBOX });\n" +
  "  sourceId = cib && cib.source_id;\n" +
  "}\n" +
  "// 4) Buscar conversación abierta del contacto, o crear una\n" +
  "let convId=null;\n" +
  "const cv = await req('GET', `${CW}/api/v1/accounts/${ACC}/contacts/${contactId}/conversations`);\n" +
  "const convs = (cv && cv.payload) || [];\n" +
  "const abierta = convs.find(x => x.status==='open' || x.status==='pending') || convs[0];\n" +
  "if (abierta) convId = abierta.id;\n" +
  "if (!convId) {\n" +
  "  const nc = await req('POST', `${CW}/api/v1/accounts/${ACC}/conversations`, { source_id: sourceId, inbox_id: INBOX, contact_id: contactId });\n" +
  "  convId = nc && nc.id;\n" +
  "}\n" +
  "if (!convId) return [{ json: { ok:false, motivo:'sin conversacion', contactId, sourceId } }];\n" +
  "// 5) Push mensajes: cliente (incoming) y bot (outgoing).\n" +
  "//    Marcamos con content_attributes.espejo=true para que el webhook los IGNORE\n" +
  "//    (si no, el reenvío vendedor→WhatsApp entraría en bucle con nuestros propios mensajes).\n" +
  "if (msgCliente) await req('POST', `${CW}/api/v1/accounts/${ACC}/conversations/${convId}/messages`, { content: msgCliente, message_type: 'incoming', content_attributes: { espejo: true } });\n" +
  "if (msgBot) await req('POST', `${CW}/api/v1/accounts/${ACC}/conversations/${convId}/messages`, { content: msgBot, message_type: 'outgoing', content_attributes: { espejo: true } });\n" +
  "return [{ json: { ok:true, contactId, convId } }];\n";

nodes.push({
  parameters: { jsCode: code, options: {} },
  id: "f0000000-0000-4000-8000-000000000002",
  name: "Espejar en Chatwoot",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [440, 400],
});

conn["Webhook Espejo"] = { main: [[{ node: "Espejar en Chatwoot", type: "main", index: 0 }]] };

const wf = {
  name: "Chatwoot Espejo",
  nodes,
  connections: conn,
  settings: { executionOrder: "v1" },
  staticData: null,
};

const outFile = path.join(__dirname, "workflow_chatwoot_espejo.json");
fs.writeFileSync(outFile, JSON.stringify(wf, null, 2), { encoding: "utf8" });
console.log("OK ->", outFile, "| nodos:", nodes.length);
