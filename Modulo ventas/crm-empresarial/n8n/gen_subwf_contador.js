// gen_subwf_contador.js
// Sub-workflow "Contador Conversaciones": cuenta conversaciones únicas (ventana 24h)
// para facturar por plan. Entrada (POST): { empresa, wa_id }.
//
// Lógica (un Code con this.helpers.httpRequest a Redis REST NO — usamos nodo Redis vía HTTP
// no aplica; en su lugar el Code hace: marca en Redis vía... ) — Redis NO tiene REST, así que
// la parte Redis se hace con NODOS Redis nativos, y el conteo NocoDB con HTTP.
//
// Flujo: [Webhook] -> [Redis GET conv:{emp}:{wa}] -> [IF ¿existe marca?]
//   existe  -> (misma conversación, NO contar) -> responder {contado:false}
//   no      -> [Redis SET marca TTL 24h] -> [Code: +1 en NocoDB contador del mes] -> responder {contado:true, usadas, limite, pct}
//
// Devuelve el estado del contador para que el flujo principal decida si avisar al 80%.
// Salida SIN BOM.

const fs = require("fs");
const path = require("path");

const NOCODB = "https://appcadabra-nocodb.jmyxxj.easypanel.host";
const CONTADOR_TID = "m6xeyiwiqjx5c0w";
const NC_TOKEN = "REEMPLAZAR_TOKEN_NOCODB";
const ADMIN_WA = "56995649108"; // WhatsApp del dueño Cadabra (recibe el aviso 80%) — cambiar aquí si aplica
const CRED_META = { httpHeaderAuth: { id: "AkIBFXVUDXwvv1ta", name: "Header Auth account" } };
const CRED_REDIS = { redis: { id: "Pb4ansRdtu4Fu0yh", name: "Redis Cadabra" } };

const nodes = [];
const conn = {};

// 1) Webhook
nodes.push({
  parameters: { httpMethod: "POST", path: "contar-conversacion", responseMode: "lastNode", options: {} },
  id: "k0000000-0000-4000-8000-000000000001",
  name: "Webhook Contador",
  type: "n8n-nodes-base.webhook",
  typeVersion: 2,
  position: [220, 300],
  webhookId: "contar-conversacion-cadabra",
});

// 2) Redis GET: ¿existe marca de conversación activa (últimas 24h)?
nodes.push({
  parameters: {
    operation: "get",
    propertyName: "marca",
    key: "={{ 'conv:' + ($json.body.empresa||'0') + ':' + String($json.body.wa_id||'').replace(/[^0-9]/g,'') }}",
    keyType: "string",
    options: {},
  },
  id: "k0000000-0000-4000-8000-000000000002",
  name: "¿Conversación activa?",
  type: "n8n-nodes-base.redis",
  typeVersion: 1,
  position: [440, 300],
  credentials: CRED_REDIS,
});

// 3) IF: marca vacía => conversación NUEVA
nodes.push({
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "loose" },
      conditions: [
        { id: "c-nueva", leftValue: "={{ $json.marca || '' }}", rightValue: "", operator: { type: "string", operation: "empty", singleValue: true } },
      ],
      combinator: "and",
    },
    options: {},
  },
  id: "k0000000-0000-4000-8000-000000000003",
  name: "¿Es conversación nueva?",
  type: "n8n-nodes-base.if",
  typeVersion: 2,
  position: [660, 300],
});

// 4a) NUEVA -> Redis SET marca con TTL 24h (86400s)
nodes.push({
  parameters: {
    operation: "set",
    key: "={{ 'conv:' + ($('Webhook Contador').first().json.body.empresa||'0') + ':' + String($('Webhook Contador').first().json.body.wa_id||'').replace(/[^0-9]/g,'') }}",
    value: "={{ $now.toISO() }}",
    keyType: "string",
    expire: true,
    ttl: 86400,
    options: {},
  },
  id: "k0000000-0000-4000-8000-000000000004",
  name: "Marcar conversación (24h)",
  type: "n8n-nodes-base.redis",
  typeVersion: 1,
  position: [880, 200],
  credentials: CRED_REDIS,
});

// 4b) Code: +1 en el contador NocoDB del mes actual (busca la fila empresa+mes, incrementa usadas)
nodes.push({
  parameters: {
    jsCode:
      "const emp = String($('Webhook Contador').first().json.body.empresa || '1');\n" +
      "const NC='" + NOCODB + "'; const T='" + CONTADOR_TID + "';\n" +
      "const H={ 'xc-token':'" + NC_TOKEN + "', 'Content-Type':'application/json' };\n" +
      "const req=async(m,u,b)=>{ try{ const o={method:m,url:u,headers:H,json:true}; if(b)o.body=b; return await this.helpers.httpRequest(o);}catch(e){ return (e.response&&e.response.body)?e.response.body:{__err:String(e.message||e)};} };\n" +
      "const now = new Date(new Date().toLocaleString('en-US',{timeZone:'America/Santiago'}));\n" +
      "const mes = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');\n" +
      "// buscar fila empresa+mes\n" +
      "const q = await req('GET', `${NC}/api/v2/tables/${T}/records?where=(empresa,eq,${emp})~and(mes,eq,${mes})&limit=1`);\n" +
      "let row = q && q.list && q.list[0];\n" +
      "// si no existe la fila del mes, crearla (hereda plan/limite de la fila más reciente de esa empresa)\n" +
      "if (!row) {\n" +
      "  const prev = await req('GET', `${NC}/api/v2/tables/${T}/records?where=(empresa,eq,${emp})&sort=-Id&limit=1`);\n" +
      "  const base = (prev && prev.list && prev.list[0]) || {};\n" +
      "  const cr = await req('POST', `${NC}/api/v2/tables/${T}/records`, { empresa: Number(emp), mes, plan: base.plan||'Convierte', limite: base.limite||1500, usadas: 0, aviso_80_enviado: false });\n" +
      "  row = cr;\n" +
      "}\n" +
      "const usadas = (Number(row.usadas)||0) + 1;\n" +
      "const limite = Number(row.limite)||1500;\n" +
      "await req('PATCH', `${NC}/api/v2/tables/${T}/records`, { Id: row.Id, usadas });\n" +
      "const pct = Math.round(usadas/limite*100);\n" +
      "const cruzo80 = pct >= 80 && !row.aviso_80_enviado;\n" +
      "if (cruzo80) await req('PATCH', `${NC}/api/v2/tables/${T}/records`, { Id: row.Id, aviso_80_enviado: true });\n" +
      "return [{ json: { contado:true, empresa:emp, mes, usadas, limite, pct, plan: row.plan, avisar_80: cruzo80, excedido: usadas > limite } }];",
    options: {},
  },
  id: "k0000000-0000-4000-8000-000000000005",
  name: "Sumar conversación (NocoDB)",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [1100, 200],
});

// 5) NO nueva -> responder sin contar
nodes.push({
  parameters: {
    assignments: { assignments: [
      { id: "s1", name: "contado", value: false, type: "boolean" },
      { id: "s2", name: "motivo", value: "conversacion_ya_activa_24h", type: "string" },
    ] },
    options: {},
  },
  id: "k0000000-0000-4000-8000-000000000006",
  name: "No contar (misma conversación)",
  type: "n8n-nodes-base.set",
  typeVersion: 3.4,
  position: [880, 420],
});

// 6) IF ¿cruzó el 80%? (solo la primera vez, avisar_80=true)
nodes.push({
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "loose" },
      conditions: [
        { id: "c-80", leftValue: "={{ $json.avisar_80 }}", rightValue: true, operator: { type: "boolean", operation: "true", singleValue: true } },
      ],
      combinator: "and",
    },
    options: {},
  },
  id: "k0000000-0000-4000-8000-000000000007",
  name: "¿Cruzó el 80%?",
  type: "n8n-nodes-base.if",
  typeVersion: 2,
  position: [1320, 200],
});

// 7) WhatsApp al ADMIN Cadabra avisando el 80%
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
    jsonBody:
      "={{ (() => { const d=$json; const txt='📊 *Aviso de consumo*\\nLa empresa ' + d.empresa + ' (plan ' + d.plan + ') llegó al ' + d.pct + '% de su límite: ' + d.usadas + '/' + d.limite + ' conversaciones este mes (' + d.mes + ').\\n\\nBuen momento para ofrecer un upgrade 🚀'; return JSON.stringify({ messaging_product:'whatsapp', to: '" + ADMIN_WA + "', type:'text', text:{ body: txt } }); })() }}",
    options: {},
  },
  id: "k0000000-0000-4000-8000-000000000008",
  name: "Avisar 80% (WhatsApp admin)",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [1540, 140],
  credentials: CRED_META,
  onError: "continueRegularOutput",
});

conn["Webhook Contador"] = { main: [[{ node: "¿Conversación activa?", type: "main", index: 0 }]] };
conn["¿Conversación activa?"] = { main: [[{ node: "¿Es conversación nueva?", type: "main", index: 0 }]] };
conn["¿Es conversación nueva?"] = {
  main: [
    [{ node: "Marcar conversación (24h)", type: "main", index: 0 }], // nueva
    [{ node: "No contar (misma conversación)", type: "main", index: 0 }], // ya activa
  ],
};
conn["Marcar conversación (24h)"] = { main: [[{ node: "Sumar conversación (NocoDB)", type: "main", index: 0 }]] };
conn["Sumar conversación (NocoDB)"] = { main: [[{ node: "¿Cruzó el 80%?", type: "main", index: 0 }]] };
conn["¿Cruzó el 80%?"] = { main: [[{ node: "Avisar 80% (WhatsApp admin)", type: "main", index: 0 }], []] };

const wf = {
  name: "Contador Conversaciones",
  nodes,
  connections: conn,
  settings: { executionOrder: "v1" },
  staticData: null,
};

fs.writeFileSync(path.join(__dirname, "workflow_contador.json"), JSON.stringify(wf, null, 2), { encoding: "utf8" });
console.log("OK contador | nodos:", nodes.length);
