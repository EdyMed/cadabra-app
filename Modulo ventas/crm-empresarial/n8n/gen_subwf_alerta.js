// gen_subwf_alerta.js
// Sub-workflow "Alerta Vendedor": cuando un cliente pide vendedor (handoff), avisa.
// Entrada (POST body): { wa_id, nombre, negocio }
// Acciones:
//   1) En Chatwoot: reabrir la conversación del cliente + etiqueta 'requiere-vendedor'
//      (así queda destacada en la bandeja del vendedor).
//   2) WhatsApp al VENDEDOR: aviso "🔔 Lead pide atención: [nombre] de [negocio]".
//
// Un Code (Chatwoot con this.helpers.httpRequest) + un HTTP a Meta (cred del bot).
// Salida SIN BOM.

const fs = require("fs");
const path = require("path");

// Los números de vendedores YA NO están hardcodeados: se leen de la tabla `vendedores`
// en NocoDB (activo=true). Editar vendedores desde NocoDB, sin tocar código.
const NOCODB = "https://appcadabra-nocodb.jmyxxj.easypanel.host";
const VENDEDORES_TID = "mnr1duvk64epbhm";

const nodes = [];
const conn = {};

nodes.push({
  parameters: { httpMethod: "POST", path: "alerta-vendedor", responseMode: "lastNode", options: {} },
  id: "h0000000-0000-4000-8000-000000000001",
  name: "Webhook Alerta",
  type: "n8n-nodes-base.webhook",
  typeVersion: 2,
  position: [220, 300],
  webhookId: "alerta-vendedor-cadabra",
});

// Code: reabrir + etiquetar conversación en Chatwoot; preparar texto de alerta
const code =
  "const CW='https://appcadabra-chatwoot.jmyxxj.easypanel.host';\n" +
  "const ACC='2';\n" +
  "const TOKEN='REEMPLAZAR_TOKEN_CHATWOOT';\n" +
  "const H={ 'api_access_token':TOKEN, 'Content-Type':'application/json' };\n" +
  "const b=$input.first().json.body||{};\n" +
  "const wa=String(b.wa_id||'').replace(/[^0-9]/g,'');\n" +
  "const nombre=b.nombre||'';\n" +
  "const negocio=b.negocio||'';\n" +
  "const req=async(m,u,body,headers)=>{try{const o={method:m,url:u,headers:headers||H,json:true};if(body)o.body=body;return await this.helpers.httpRequest(o);}catch(e){return (e.response&&e.response.body)?e.response.body:{__err:String(e.message||e)};}};\n" +
  "let convId=null;\n" +
  "if(wa){\n" +
  "  const s=await req('GET',`${CW}/api/v1/accounts/${ACC}/contacts/search?q=${wa}`);\n" +
  "  const c=(s&&s.payload&&s.payload[0])||null;\n" +
  "  if(c){\n" +
  "    const cv=await req('GET',`${CW}/api/v1/accounts/${ACC}/contacts/${c.id}/conversations`);\n" +
  "    const conv=((cv&&cv.payload)||[])[0];\n" +
  "    if(conv){\n" +
  "      convId=conv.id;\n" +
  "      // reabrir (status open) para que aparezca en la bandeja\n" +
  "      await req('POST',`${CW}/api/v1/accounts/${ACC}/conversations/${convId}/toggle_status`,{status:'open'});\n" +
  "      // etiqueta requiere-vendedor\n" +
  "      await req('POST',`${CW}/api/v1/accounts/${ACC}/conversations/${convId}/labels`,{labels:['requiere-vendedor']});\n" +
  "    }\n" +
  "  }\n" +
  "}\n" +
  "// texto de alerta\n" +
  "let quien = nombre ? nombre : 'un cliente';\n" +
  "if (negocio) quien += ' de ' + negocio;\n" +
  "const texto = '🔔 *Lead pide atención*\\n' + quien + ' (wa: ' + wa + ') solicitó hablar con un vendedor. Atiéndelo en Chatwoot 👉';\n" +
  "// leer vendedores ACTIVOS desde NocoDB (mantenedor, sin hardcodear números)\n" +
  "const NC='" + NOCODB + "'; const VT='" + VENDEDORES_TID + "';\n" +
  "const NCH={ 'xc-token':'REEMPLAZAR_TOKEN_NOCODB', 'Content-Type':'application/json' };\n" +
  "const vr = await req('GET', `${NC}/api/v2/tables/${VT}/records?where=(activo,eq,true)&limit=50`, null, NCH);\n" +
  "const vends = ((vr && vr.list) || []).map(v => String(v.whatsapp||'').replace(/[^0-9]/g,'')).filter(Boolean);\n" +
  "// devolver UN item por vendedor (para que el nodo de WhatsApp envíe a cada uno)\n" +
  "if (vends.length === 0) return [{ json: { sin_vendedores:true, convId } }];\n" +
  "return vends.map(v => ({ json: { convId, texto, vendedor: v } }));\n";

nodes.push({
  parameters: { jsCode: code, options: {} },
  id: "h0000000-0000-4000-8000-000000000002",
  name: "Reabrir+etiquetar Chatwoot",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [440, 300],
});

// HTTP: enviar WhatsApp de alerta al vendedor (cred Meta del bot)
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
    jsonBody: "={{ JSON.stringify({ messaging_product:'whatsapp', to: $json.vendedor, type:'text', text:{ body: $json.texto } }) }}",
    options: {},
  },
  id: "h0000000-0000-4000-8000-000000000003",
  name: "Avisar al vendedor (WhatsApp)",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [680, 300],
  credentials: { httpHeaderAuth: { id: "AkIBFXVUDXwvv1ta", name: "Header Auth account" } },
  onError: "continueRegularOutput",
});

conn["Webhook Alerta"] = { main: [[{ node: "Reabrir+etiquetar Chatwoot", type: "main", index: 0 }]] };
conn["Reabrir+etiquetar Chatwoot"] = { main: [[{ node: "Avisar al vendedor (WhatsApp)", type: "main", index: 0 }]] };

const wf = {
  name: "Alerta Vendedor",
  nodes,
  connections: conn,
  settings: { executionOrder: "v1" },
  staticData: null,
};

fs.writeFileSync(path.join(__dirname, "workflow_alerta_vendedor.json"), JSON.stringify(wf, null, 2), { encoding: "utf8" });
console.log("OK alerta | nodos:", nodes.length);
