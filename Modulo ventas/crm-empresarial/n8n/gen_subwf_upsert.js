// gen_subwf_upsert.js
// Genera el sub-workflow "CRM Upsert (NocoDB)": recibe datos de un lead, busca por
// contact_id, y si existe hace PATCH (actualiza) y si no POST (crea). Devuelve el registro.
//
// Se invoca desde el agente principal como una sola tool (toolWorkflow) o desde
// "Execute Workflow". Aísla la lógica de upsert para que el agente no tenga que
// hacer GET+IF+POST.
//
// Nodos:
//   [Trigger: Execute Workflow] -> [HTTP GET por contact_id] -> [IF ¿existe?]
//        exists=true  -> [HTTP PATCH (Id + campos)] -> [Set salida]
//        exists=false -> [HTTP POST (crear)]         -> [Set salida]
//
// Credencial NocoDB: httpHeaderAuth (xc-token). Placeholder REEMPLAZAR_CRED_NOCODB.
// Salida SIN BOM.

const fs = require("fs");
const path = require("path");

const NOCODB_BASE = "https://appcadabra-nocodb.jmyxxj.easypanel.host";
const TABLE_ID = "mcp3sx8fm259gn6";
const RECORDS = `${NOCODB_BASE}/api/v2/tables/${TABLE_ID}/records`;
const CRED = { httpHeaderAuth: { id: "REEMPLAZAR_CRED_NOCODB", name: "NocoDB xc-token" } };

// El input del sub-workflow: un objeto json con los campos del lead. contact_id obligatorio.
const nodes = [];
const conn = {};

// 1) Trigger Execute Workflow
nodes.push({
  parameters: { events: "worker" },
  id: "a0000000-0000-4000-8000-000000000010",
  name: "Cuando lo llama el agente",
  type: "n8n-nodes-base.executeWorkflowTrigger",
  typeVersion: 1,
  position: [220, 400],
});

// 2) HTTP GET: buscar por contact_id
nodes.push({
  parameters: {
    method: "GET",
    url: `=${RECORDS}`,
    authentication: "genericCredentialType",
    genericAuthType: "httpHeaderAuth",
    sendQuery: true,
    queryParameters: {
      parameters: [
        { name: "where", value: "=(contact_id,eq,{{ $json.contact_id }})" },
        { name: "limit", value: "1" },
      ],
    },
    options: {},
  },
  id: "a0000000-0000-4000-8000-000000000011",
  name: "Buscar lead por contact_id",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [440, 400],
  credentials: CRED,
});

// 3) IF ¿existe? (list tiene al menos 1)
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
  id: "a0000000-0000-4000-8000-000000000012",
  name: "¿Ya existe?",
  type: "n8n-nodes-base.if",
  typeVersion: 2,
  position: [680, 400],
});

// 4a) PATCH (existe): usa el Id encontrado + campos del input original
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
      "  const orig = $('Cuando lo llama el agente').first().json;\n" +
      "  const found = $json.list[0];\n" +
      "  const body = Object.assign({}, orig);\n" +
      "  delete body.record_id;\n" +
      "  body.Id = found.Id;\n" +
      "  return JSON.stringify(body);\n" +
      "})() }}",
    options: {},
  },
  id: "a0000000-0000-4000-8000-000000000013",
  name: "Actualizar lead (PATCH)",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [920, 280],
  credentials: CRED,
});

// 4b) POST (no existe): crear con los campos del input
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
      "  const orig = $('Cuando lo llama el agente').first().json;\n" +
      "  const body = Object.assign({}, orig);\n" +
      "  delete body.record_id;\n" +
      "  if (!body.estado_crm) body.estado_crm = 'Nuevo Lead';\n" +
      "  if (!body.origen_lead) body.origen_lead = 'whatsapp';\n" +
      "  return JSON.stringify(body);\n" +
      "})() }}",
    options: {},
  },
  id: "a0000000-0000-4000-8000-000000000014",
  name: "Crear lead (POST)",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [920, 520],
  credentials: CRED,
});

// 5) Set salida uniforme (devuelve Id + accion)
nodes.push({
  parameters: {
    assignments: {
      assignments: [
        { id: "s1", name: "ok", value: true, type: "boolean" },
        { id: "s2", name: "record_id", value: "={{ $json.Id }}", type: "number" },
        { id: "s3", name: "accion", value: "actualizado", type: "string" },
      ],
    },
    options: {},
  },
  id: "a0000000-0000-4000-8000-000000000015",
  name: "Salida (actualizado)",
  type: "n8n-nodes-base.set",
  typeVersion: 3.4,
  position: [1160, 280],
});
nodes.push({
  parameters: {
    assignments: {
      assignments: [
        { id: "s1", name: "ok", value: true, type: "boolean" },
        { id: "s2", name: "record_id", value: "={{ $json.Id }}", type: "number" },
        { id: "s3", name: "accion", value: "creado", type: "string" },
      ],
    },
    options: {},
  },
  id: "a0000000-0000-4000-8000-000000000016",
  name: "Salida (creado)",
  type: "n8n-nodes-base.set",
  typeVersion: 3.4,
  position: [1160, 520],
});

// Conexiones
conn["Cuando lo llama el agente"] = { main: [[{ node: "Buscar lead por contact_id", type: "main", index: 0 }]] };
conn["Buscar lead por contact_id"] = { main: [[{ node: "¿Ya existe?", type: "main", index: 0 }]] };
conn["¿Ya existe?"] = {
  main: [
    [{ node: "Actualizar lead (PATCH)", type: "main", index: 0 }], // true
    [{ node: "Crear lead (POST)", type: "main", index: 0 }],       // false
  ],
};
conn["Actualizar lead (PATCH)"] = { main: [[{ node: "Salida (actualizado)", type: "main", index: 0 }]] };
conn["Crear lead (POST)"] = { main: [[{ node: "Salida (creado)", type: "main", index: 0 }]] };

const wf = {
  name: "CRM Upsert (NocoDB)",
  nodes,
  connections: conn,
  settings: { executionOrder: "v1" },
  staticData: null,
};

const outFile = path.join(__dirname, "workflow_crm_upsert.json");
fs.writeFileSync(outFile, JSON.stringify(wf, null, 2), { encoding: "utf8" });
console.log("OK ->", outFile, "| nodos:", nodes.length);
