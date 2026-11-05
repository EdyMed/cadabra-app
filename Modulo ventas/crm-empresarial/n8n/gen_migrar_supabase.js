// Migra los 4 workflows de NocoDB -> Supabase (schema crm), manteniendo la topología
// observable intacta (mismas ramas IF, mismas respuestas). Reemplaza los nodos que
// hoy hablan HTTP con la API REST de NocoDB por nodos Postgres nativos contra el
// Supabase del agente (cexowmypklxngbjsxryf), reusando la credencial ya existente
// "Supabase Ventas (RW)" (BIM03WKClC8bnUc8) que ya usan Guardar turno/Resolver empresa.
//
// Uso: node gen_migrar_supabase.js   (lee _wf_*.json locales, escribe _wf_*_migrado.json)

const fs = require("fs");

const CRED = { id: "BIM03WKClC8bnUc8", name: "Supabase Ventas (RW)" };

function pg(base) {
  return {
    parameters: {},
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.6,
    credentials: { postgres: CRED },
    ...base,
  };
}

function keep(node, over) {
  return Object.assign(node, over);
}

// ================= 1) CRM Upsert (aiV5ye7IxY1DGFrK) =================
function migrarCrmUpsert() {
  const wf = JSON.parse(fs.readFileSync("_wf_aiV5ye7IxY1DGFrK.json", "utf8"));

  const buscar = wf.nodes.find((n) => n.name === "Buscar por contact_id");
  keep(
    buscar,
    pg({
      name: buscar.name,
      id: buscar.id,
      position: buscar.position,
      parameters: {
        operation: "executeQuery",
        // SELECT * ... LIMIT 1 con 0 filas no emite ningún item -> el flujo se corta antes
        // del IF "¿Ya existe?" (probado: la ejecución de prueba nunca llegó a ese nodo).
        // LEFT JOIN LATERAL sobre una fila fija garantiza SIEMPRE 1 item (id=NULL si no existe).
        query:
          "SELECT l.* FROM (SELECT 1) x LEFT JOIN LATERAL (SELECT * FROM crm.crm_leads WHERE empresa = $1 AND contact_id = $2 LIMIT 1) l ON true",
        options: {
          queryReplacement:
            "={{ [ $json.body.empresa || 1, $json.body.contact_id ] }}",
        },
      },
    })
  );

  const actualizar = wf.nodes.find((n) => n.name === "Actualizar (PATCH)");
  keep(
    actualizar,
    pg({
      name: actualizar.name,
      id: actualizar.id,
      position: actualizar.position,
      parameters: {
        operation: "executeQuery",
        query:
          "={{ (() => {\n" +
          "  const orig = $('Webhook Upsert').first().json.body || {};\n" +
          "  const found = $json;\n" +
          "  const campos = ['nombre','nombre_negocio','contact_id','phone','email','comuna','origen_lead','producto_interes','estado_crm','vendedor_asignado','condicion_pago','estado_agendamiento','fecha_agendamiento','hora_cita','bot_activo','notas'];\n" +
          "  const sets = [];\n" +
          "  for (const k of campos) { const v = orig[k]; if (v !== undefined && v !== null && v !== '') sets.push(k); }\n" +
          "  const setSql = sets.map((k,i) => `${k} = $${i+1}`).join(', ');\n" +
          "  return `UPDATE crm.crm_leads SET ${setSql} WHERE id = $${sets.length+1} RETURNING *`;\n" +
          "})() }}",
        options: {
          queryReplacement:
            "={{ (() => {\n" +
            "  const orig = $('Webhook Upsert').first().json.body || {};\n" +
            "  const found = $json;\n" +
            "  const campos = ['nombre','nombre_negocio','contact_id','phone','email','comuna','origen_lead','producto_interes','estado_crm','vendedor_asignado','condicion_pago','estado_agendamiento','fecha_agendamiento','hora_cita','bot_activo','notas'];\n" +
            "  const vals = [];\n" +
            "  for (const k of campos) { const v = orig[k]; if (v !== undefined && v !== null && v !== '') vals.push(v); }\n" +
            "  vals.push(found.id);\n" +
            "  return vals;\n" +
            "})() }}",
        },
      },
    })
  );

  const crear = wf.nodes.find((n) => n.name === "Crear (POST)");
  keep(
    crear,
    pg({
      name: crear.name,
      id: crear.id,
      position: crear.position,
      parameters: {
        operation: "insert",
        schema: { __rl: true, value: "crm", mode: "list" },
        table: { __rl: true, value: "crm_leads", mode: "list" },
        columns: {
          mappingMode: "defineBelow",
          value: {
            nombre: "={{ $('Webhook Upsert').first().json.body.nombre || null }}",
            nombre_negocio:
              "={{ $('Webhook Upsert').first().json.body.nombre_negocio || null }}",
            contact_id: "={{ $('Webhook Upsert').first().json.body.contact_id || null }}",
            phone:
              "={{ $('Webhook Upsert').first().json.body.phone || $('Webhook Upsert').first().json.body.contact_id || null }}",
            email: "={{ $('Webhook Upsert').first().json.body.email || null }}",
            comuna: "={{ $('Webhook Upsert').first().json.body.comuna || null }}",
            origen_lead: "={{ $('Webhook Upsert').first().json.body.origen_lead || 'whatsapp' }}",
            producto_interes:
              "={{ $('Webhook Upsert').first().json.body.producto_interes || null }}",
            estado_crm: "={{ $('Webhook Upsert').first().json.body.estado_crm || 'Nuevo Lead' }}",
            vendedor_asignado:
              "={{ $('Webhook Upsert').first().json.body.vendedor_asignado || null }}",
            condicion_pago: "={{ $('Webhook Upsert').first().json.body.condicion_pago || null }}",
            estado_agendamiento:
              "={{ $('Webhook Upsert').first().json.body.estado_agendamiento || null }}",
            fecha_agendamiento:
              "={{ $('Webhook Upsert').first().json.body.fecha_agendamiento || null }}",
            hora_cita: "={{ $('Webhook Upsert').first().json.body.hora_cita || null }}",
            bot_activo:
              "={{ $('Webhook Upsert').first().json.body.bot_activo === undefined ? true : $('Webhook Upsert').first().json.body.bot_activo }}",
            notas: "={{ $('Webhook Upsert').first().json.body.notas || null }}",
            empresa: "={{ $('Webhook Upsert').first().json.body.empresa || 1 }}",
          },
        },
        options: {},
      },
    })
  );

  // Antes leían $json.Id (NocoDB) / $json.list[0] -> ahora Postgres devuelve `id` / filas planas.
  const respAct = wf.nodes.find((n) => n.name === "Responder (actualizado)");
  respAct.parameters.respondWith = "json";
  respAct.parameters.responseBody = '={{ { record_id: $json.id, accion: "actualizado" } }}';

  const respCre = wf.nodes.find((n) => n.name === "Responder (creado)");
  respCre.parameters.respondWith = "json";
  respCre.parameters.responseBody = '={{ { record_id: $json.id, accion: "creado" } }}';

  // "¿Ya existe?" evaluaba $json.list.length > 0 (NocoDB) -> ahora es una fila plana o ninguna.
  const ifExiste = wf.nodes.find((n) => n.name === "¿Ya existe?");
  if (ifExiste.parameters.conditions) {
    ifExiste.parameters.conditions.conditions = [
      {
        leftValue: "={{ $json.id }}",
        rightValue: "",
        operator: { type: "string", operation: "notEmpty", singleValue: true },
      },
    ];
  }

  fs.writeFileSync("_wf_aiV5ye7IxY1DGFrK_migrado.json", JSON.stringify(wf, null, 2));
  console.log("OK: CRM Upsert -> _wf_aiV5ye7IxY1DGFrK_migrado.json");
}

// ================= 2) Workflow principal (LspLEGA3ZegcYoIH) =================
function migrarPrincipal() {
  const wf = JSON.parse(fs.readFileSync("_wf_LspLEGA3ZegcYoIH.json", "utf8"));

  const guarda = wf.nodes.find((n) => n.name === "Guarda: leer bot_activo");
  keep(
    guarda,
    pg({
      name: guarda.name,
      id: guarda.id,
      position: guarda.position,
      parameters: {
        operation: "executeQuery",
        // Mismo fix que "Buscar por contact_id": LEFT JOIN LATERAL para garantizar 1 item
        // aunque el lead no exista todavía (número nuevo escribiendo por primera vez).
        query:
          "SELECT l.id, l.contact_id, l.bot_activo FROM (SELECT 1) x LEFT JOIN LATERAL (SELECT * FROM crm.crm_leads WHERE contact_id = $1 LIMIT 1) l ON true",
        options: {
          queryReplacement:
            "={{ [ $('Consolidar contexto').first().json.from ] }}",
        },
      },
    })
  );

  // crm_actualizar_estado (httpRequestTool PATCH a NocoDB por Id) -> postgresTool UPDATE por id.
  // Mismos parámetros AI que el original (record_id/nombre/nombre_negocio/estado_crm/
  // vendedor_asignado/condicion_pago/estado_agendamiento/bot_activo), misma toolDescription.
  const crmActualizar = wf.nodes.find((n) => n.name === "crm_actualizar_estado");
  if (crmActualizar) {
    const toolDescription = crmActualizar.parameters.toolDescription;
    keep(crmActualizar, {
      name: crmActualizar.name,
      id: crmActualizar.id,
      position: crmActualizar.position,
      type: "n8n-nodes-base.postgresTool",
      typeVersion: 2.6,
      credentials: { postgres: CRED },
      parameters: {
        toolDescription,
        operation: "executeQuery",
        query:
          "={{ (() => {\n" +
          "  const campos = {\n" +
          "    nombre: $fromAI('nombre', 'nombre de la persona de contacto', 'string'),\n" +
          "    nombre_negocio: $fromAI('nombre_negocio', 'nombre del local/negocio', 'string'),\n" +
          "    estado_crm: $fromAI('estado_crm', 'nuevo estado del embudo, valor exacto', 'string'),\n" +
          "    vendedor_asignado: $fromAI('vendedor_asignado', 'Vendedor 1 / Vendedor 2', 'string'),\n" +
          "    condicion_pago: $fromAI('condicion_pago', 'Efectivo/Cheque/Crédito 7d', 'string'),\n" +
          "    estado_agendamiento: $fromAI('estado_agendamiento', 'Pendiente/Confirmado/Cancelado', 'string'),\n" +
          "    bot_activo: $fromAI('bot_activo', 'true o false: pon false SOLO para pasar la conversación a un humano/vendedor', 'boolean'),\n" +
          "  };\n" +
          "  const sets = []; const vals = [];\n" +
          "  for (const [k, v] of Object.entries(campos)) { if (v !== undefined && v !== null && v !== '') { vals.push(v); sets.push(`${k} = $${vals.length}`); } }\n" +
          "  vals.push($fromAI('record_id', 'Id numérico del lead (de crm_guardar_lead)', 'number'));\n" +
          "  return `UPDATE crm.crm_leads SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING id`;\n" +
          "})() }}",
        options: {},
      },
    });
  }

  // El IF "Guarda: ¿bot activo?" leía $json.list (formato NocoDB); un nodo Postgres nunca
  // devuelve ese shape. CRÍTICO: con 0 filas cortaba el flujo entero (el fix del SELECT de
  // arriba ya garantiza 1 item con id=NULL), y aunque llegue, $json.list sigue siendo
  // undefined -> siempre evaluaba 'ON' por accidente (efecto benigno) o el nodo ni corría
  // (efecto real observado: bot no respondía a leads nuevos). Fix: usar $json.bot_activo
  // directo (columna plana del SELECT), null cuenta como "no existe" -> ON.
  const ifBotActivo = wf.nodes.find((n) => n.name === "Guarda: ¿bot activo?");
  if (ifBotActivo) {
    ifBotActivo.parameters.conditions.conditions[0].leftValue =
      "={{ $json.bot_activo === false ? 'OFF' : 'ON' }}";
  }

  fs.writeFileSync("_wf_LspLEGA3ZegcYoIH_migrado.json", JSON.stringify(wf, null, 2));
  console.log("OK: Principal -> _wf_LspLEGA3ZegcYoIH_migrado.json");
}

// ================= 3) Contador Conversaciones (H0Q3kX8qW5y9xfnE) =================
function migrarContador() {
  const wf = JSON.parse(fs.readFileSync("_wf_H0Q3kX8qW5y9xfnE.json", "utf8"));

  const sumar = wf.nodes.find((n) => n.name === "Sumar conversación (NocoDB)");
  keep(
    sumar,
    pg({
      name: sumar.name,
      id: sumar.id,
      position: sumar.position,
      parameters: {
        operation: "executeQuery",
        // 3 statements secuenciales: probado contra Supabase que un UPDATE dentro de una
        // CTE referenciada por otra CTE de escritura en la MISMA query no ve de forma
        // fiable los valores post-UPDATE de la primera (daba avisar_80=false a 80% exacto).
        // avisar_80 debe ser true SOLO en la transición (si no, spamea el aviso al admin en
        // cada mensaje posterior) -> se captura el RETURNING del 2º UPDATE en una tabla
        // temp de sesión (pg_temp, con DROP previo por si quedó de una ejecución previa
        // fallida) y se usa EXISTS contra ella en el SELECT final.
        query: `
DROP TABLE IF EXISTS pg_temp._marcado;

WITH base AS (
  SELECT plan, limite FROM crm.contador_conversaciones
  WHERE empresa = $1 ORDER BY id DESC LIMIT 1
)
INSERT INTO crm.contador_conversaciones (empresa, mes, plan, limite, usadas, aviso_80_enviado)
VALUES ($1, $2, COALESCE((SELECT plan FROM base), 'Convierte'), COALESCE((SELECT limite FROM base), 1500), 1, false)
ON CONFLICT (empresa, mes) DO UPDATE SET usadas = crm.contador_conversaciones.usadas + 1;

CREATE TEMP TABLE _marcado AS
WITH m AS (
  UPDATE crm.contador_conversaciones
  SET aviso_80_enviado = true
  WHERE empresa = $1 AND mes = $2
    AND ROUND(usadas::numeric / limite * 100) >= 80
    AND aviso_80_enviado = false
  RETURNING id
)
SELECT id FROM m;

SELECT c.id, c.empresa, c.mes, c.plan, c.limite, c.usadas,
  ROUND(c.usadas::numeric / c.limite * 100) AS pct,
  EXISTS(SELECT 1 FROM _marcado m WHERE m.id = c.id) AS avisar_80,
  (c.usadas > c.limite) AS excedido
FROM crm.contador_conversaciones c
WHERE c.empresa = $1 AND c.mes = $2;
`.trim(),
        options: {
          queryReplacement:
            "={{ (() => {\n" +
            "  const emp = String($('Webhook Contador').first().json.body.empresa || '1');\n" +
            "  const now = new Date(new Date().toLocaleString('en-US',{timeZone:'America/Santiago'}));\n" +
            "  const mes = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');\n" +
            "  return [emp, mes];\n" +
            "})() }}",
        },
      },
    })
  );
  fs.writeFileSync("_wf_H0Q3kX8qW5y9xfnE_migrado.json", JSON.stringify(wf, null, 2));
  console.log("OK: Contador -> _wf_H0Q3kX8qW5y9xfnE_migrado.json");
}

// ================= 4) Alerta Vendedor (rImoJOhAKuxQrS59) =================
function migrarAlertaVendedor() {
  const wf = JSON.parse(fs.readFileSync("_wf_rImoJOhAKuxQrS59.json", "utf8"));

  const codeNode = wf.nodes.find((n) => n.name === "Reabrir+etiquetar Chatwoot");
  // Quita el bloque NocoDB del Code: ya no lee vendedores, solo hace Chatwoot y pasa el texto.
  codeNode.parameters.jsCode = `
const CW='https://appcadabra-chatwoot.jmyxxj.easypanel.host';
const ACC='2';
const TOKEN='8vCuVj2MnkufoQCuS4gmWXVr';
const H={ 'api_access_token':TOKEN, 'Content-Type':'application/json' };
const b=$input.first().json.body||{};
const wa=String(b.wa_id||'').replace(/[^0-9]/g,'');
const nombre=b.nombre||'';
const negocio=b.negocio||'';
const req=async(m,u,body,headers)=>{try{const o={method:m,url:u,headers:headers||H,json:true};if(body)o.body=body;return await this.helpers.httpRequest(o);}catch(e){return (e.response&&e.response.body)?e.response.body:{__err:String(e.message||e)};}};
let convId=null;
if(wa){
  const s=await req('GET',\`\${CW}/api/v1/accounts/\${ACC}/contacts/search?q=\${wa}\`);
  const c=(s&&s.payload&&s.payload[0])||null;
  if(c){
    const cv=await req('GET',\`\${CW}/api/v1/accounts/\${ACC}/contacts/\${c.id}/conversations\`);
    const conv=((cv&&cv.payload)||[])[0];
    if(conv){
      convId=conv.id;
      await req('POST',\`\${CW}/api/v1/accounts/\${ACC}/conversations/\${convId}/toggle_status\`,{status:'open'});
      await req('POST',\`\${CW}/api/v1/accounts/\${ACC}/conversations/\${convId}/labels\`,{labels:['requiere-vendedor']});
    }
  }
}
let quien = nombre ? nombre : 'un cliente';
if (negocio) quien += ' de ' + negocio;
const texto = '🔔 *Lead pide atención*\\n' + quien + ' (wa: ' + wa + ') solicitó hablar con un vendedor. Atiéndelo en Chatwoot 👉';
return [{ json: { convId, texto } }];
`.trim();

  // Nodo nuevo: lee vendedores activos desde Supabase (reemplaza el bloque NocoDB que se quitó del Code).
  const leerVendedores = pg({
    name: "Leer vendedores activos",
    id: "leer-vendedores-activos-pg",
    position: [560, 300],
    parameters: {
      operation: "executeQuery",
      query:
        "SELECT whatsapp FROM crm.vendedores WHERE activo = true AND empresa = $1",
      options: {
        queryReplacement:
          "={{ [ $('Webhook Alerta').first().json.body.empresa || 1 ] }}",
      },
    },
  });

  // Nodo nuevo: recompone 1 item por vendedor con {convId, texto, vendedor}, igual shape que antes.
  const armarItems = {
    parameters: {
      jsCode: `
const prev = $('Reabrir+etiquetar Chatwoot').first().json;
const vends = $input.all().map(i => String(i.json.whatsapp || '').replace(/[^0-9]/g,'')).filter(Boolean);
if (vends.length === 0) return [{ json: { sin_vendedores: true, convId: prev.convId } }];
return vends.map(v => ({ json: { convId: prev.convId, texto: prev.texto, vendedor: v } }));
`.trim(),
    },
    name: "Armar items por vendedor",
    id: "armar-items-vendedor-code",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [800, 300],
  };

  // Reposiciona el nodo de envío WhatsApp para dejar espacio a los 2 nuevos.
  const envio = wf.nodes.find((n) => n.name === "Avisar al vendedor (WhatsApp)");
  envio.position = [1040, 300];

  wf.nodes.push(leerVendedores, armarItems);

  // Reconecta: Reabrir+etiquetar Chatwoot -> Leer vendedores activos -> Armar items -> Avisar al vendedor
  wf.connections["Reabrir+etiquetar Chatwoot"] = {
    main: [[{ node: "Leer vendedores activos", type: "main", index: 0 }]],
  };
  wf.connections["Leer vendedores activos"] = {
    main: [[{ node: "Armar items por vendedor", type: "main", index: 0 }]],
  };
  wf.connections["Armar items por vendedor"] = {
    main: [[{ node: "Avisar al vendedor (WhatsApp)", type: "main", index: 0 }]],
  };

  fs.writeFileSync("_wf_rImoJOhAKuxQrS59_migrado.json", JSON.stringify(wf, null, 2));
  console.log("OK: Alerta Vendedor -> _wf_rImoJOhAKuxQrS59_migrado.json");
}

migrarCrmUpsert();
migrarPrincipal();
migrarContador();
migrarAlertaVendedor();
