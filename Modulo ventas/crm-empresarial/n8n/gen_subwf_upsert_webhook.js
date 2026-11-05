// gen_subwf_upsert_webhook.js
// Versión del sub-workflow "CRM Upsert" con WEBHOOK como trigger (en vez de
// executeWorkflowTrigger). Así el agente lo llama con un httpRequestTool (que SÍ
// funciona por API), evitando el nodo toolWorkflow v1.3 (que da "Missing param name").
//
// Flujo: [Webhook POST] -> [GET por contact_id] -> [IF existe?]
//   existe  -> [PATCH] -> [Responder webhook {record_id, accion:actualizado}]
//   no      -> [POST]  -> [Responder webhook {record_id, accion:creado}]
//
// El agente le hace POST con el body del lead. Devuelve el record_id.
// Salida SIN BOM: workflow_crm_upsert_webhook.json

const fs = require("fs");
const path = require("path");

const NOCODB_BASE = "https://appcadabra-nocodb.jmyxxj.easypanel.host";
const TABLE_ID = "mcp3sx8fm259gn6";
const RECORDS = `${NOCODB_BASE}/api/v2/tables/${TABLE_ID}/records`;
const CRED = { httpHeaderAuth: { id: "jErLq0zOrAIRE72s", name: "NocoDB xc-token" } };

const nodes = [];
const conn = {};

// 1) Webhook POST (recibe el body del lead en $json.body)
nodes.push({
  parameters: {
    httpMethod: "POST",
    path: "crm-upsert",
    responseMode: "responseNode",
    options: {},
  },
  id: "b0000000-0000-4000-8000-000000000010",
  name: "Webhook Upsert",
  type: "n8n-nodes-base.webhook",
  typeVersion: 2,
  position: [220, 400],
  webhookId: "crm-upsert-cadabra",
});

// 2) GET por contact_id (leído desde $json.body.contact_id)
nodes.push({
  parameters: {
    method: "GET",
    url: `=${RECORDS}`,
    authentication: "genericCredentialType",
    genericAuthType: "httpHeaderAuth",
    sendQuery: true,
    queryParameters: {
      parameters: [
        { name: "where", value: "=(contact_id,eq,{{ $json.body.contact_id }})" },
        { name: "limit", value: "1" },
      ],
    },
    options: {},
  },
  id: "b0000000-0000-4000-8000-000000000011",
  name: "Buscar por contact_id",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [440, 400],
  credentials: CRED,
});

// 3) IF ¿existe?
nodes.push({
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "loose" },
      conditions: [
        {
          id: "cond-existe",
          leftValue: "={{ $json.list ? $json.list.length : 0 }}",
          rightValue: 0,
          operator: { type: "number", operation: "gt" },
        },
      ],
      combinator: "and",
    },
    options: {},
  },
  id: "b0000000-0000-4000-8000-000000000012",
  name: "¿Ya existe?",
  type: "n8n-nodes-base.if",
  typeVersion: 2,
  position: [680, 400],
});

// 4a) PATCH (existe): merge del body original + Id encontrado
nodes.push({
  parameters: {
    method: "PATCH",
    url: `=${RECORDS}`,
    authentication: "genericCredentialType",
    genericAuthType: "httpHeaderAuth",
    sendHeaders: true,
    headerParameters: { parameters: [{ name: "Content-Type", value: "application/json" }] },
    sendBody: true,
    specifyBody: "json",
    jsonBody:
      "={{ (() => {\n" +
      "  const orig = $('Webhook Upsert').first().json.body || {};\n" +
      "  const found = $json.list[0];\n" +
      "  const body = {};\n" +
      "  // Solo campos con valor real (no vacíos) para no pisar datos existentes con ''\n" +
      "  for (const k of Object.keys(orig)) { const v = orig[k]; if (v !== undefined && v !== null && v !== '') body[k] = v; }\n" +
      "  body.Id = found.Id;\n" +
      "  delete body.record_id;\n" +
      "  return JSON.stringify(body);\n" +
      "})() }}",
    options: {},
  },
  id: "b0000000-0000-4000-8000-000000000013",
  name: "Actualizar (PATCH)",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [920, 280],
  credentials: CRED,
});

// 4b) POST (no existe)
nodes.push({
  parameters: {
    method: "POST",
    url: `=${RECORDS}`,
    authentication: "genericCredentialType",
    genericAuthType: "httpHeaderAuth",
    sendHeaders: true,
    headerParameters: { parameters: [{ name: "Content-Type", value: "application/json" }] },
    sendBody: true,
    specifyBody: "json",
    jsonBody:
      "={{ (() => {\n" +
      "  const orig = $('Webhook Upsert').first().json.body || {};\n" +
      "  const body = {};\n" +
      "  for (const k of Object.keys(orig)) { const v = orig[k]; if (v !== undefined && v !== null && v !== '') body[k] = v; }\n" +
      "  delete body.record_id;\n" +
      "  if (!body.estado_crm) body.estado_crm = 'Nuevo Lead';\n" +
      "  if (!body.origen_lead) body.origen_lead = 'whatsapp';\n" +
      "  if (body.bot_activo === undefined) body.bot_activo = true;\n" +  // lead nuevo => bot ON
      "  return JSON.stringify(body);\n" +
      "})() }}",
    options: {},
  },
  id: "b0000000-0000-4000-8000-000000000014",
  name: "Crear (POST)",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [920, 520],
  credentials: CRED,
});

// 5a/5b) Responder al agente con record_id + accion
nodes.push({
  parameters: {
    respondWith: "json",
    responseBody: "={{ JSON.stringify({ ok: true, record_id: $json.Id, accion: 'actualizado' }) }}",
    options: {},
  },
  id: "b0000000-0000-4000-8000-000000000015",
  name: "Responder (actualizado)",
  type: "n8n-nodes-base.respondToWebhook",
  typeVersion: 1,
  position: [1160, 280],
});
nodes.push({
  parameters: {
    respondWith: "json",
    responseBody: "={{ JSON.stringify({ ok: true, record_id: $json.Id, accion: 'creado' }) }}",
    options: {},
  },
  id: "b0000000-0000-4000-8000-000000000016",
  name: "Responder (creado)",
  type: "n8n-nodes-base.respondToWebhook",
  typeVersion: 1,
  position: [1160, 520],
});

conn["Webhook Upsert"] = { main: [[{ node: "Buscar por contact_id", type: "main", index: 0 }]] };
conn["Buscar por contact_id"] = { main: [[{ node: "¿Ya existe?", type: "main", index: 0 }]] };
conn["¿Ya existe?"] = {
  main: [
    [{ node: "Actualizar (PATCH)", type: "main", index: 0 }],
    [{ node: "Crear (POST)", type: "main", index: 0 }],
  ],
};
conn["Actualizar (PATCH)"] = { main: [[{ node: "Responder (actualizado)", type: "main", index: 0 }]] };
conn["Crear (POST)"] = { main: [[{ node: "Responder (creado)", type: "main", index: 0 }]] };

const wf = {
  name: "CRM Upsert (NocoDB)",
  nodes,
  connections: conn,
  settings: { executionOrder: "v1" },
  staticData: null,
};

const outFile = path.join(__dirname, "workflow_crm_upsert_webhook.json");
fs.writeFileSync(outFile, JSON.stringify(wf, null, 2), { encoding: "utf8" });
console.log("OK ->", outFile, "| nodos:", nodes.length);
