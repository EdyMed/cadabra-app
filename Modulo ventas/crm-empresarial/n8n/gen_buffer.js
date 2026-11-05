// gen_buffer.js
// Inserta el BUFFER DE MENSAJES (debounce 8s con Redis) en el workflow del clon.
// Agrupa mensajes seguidos del mismo cliente en uno solo antes de llamar al agente.
//
// Se ejecuta SOBRE workflow_crm_empresarial.json (el clon ya generado) y produce
// workflow_crm_empresarial_buffer.json.
//
// Patrón: entre "Consolidar contexto" y "AI Agent":
//   [Redis: push+ts] -> [Wait 8s] -> [Redis: leer ts] -> [IF ¿soy el último?]
//        sí -> [Redis: leer lista + limpiar] -> [Set: user_message combinado] -> AI Agent
//        no -> (termina, no responde)
//
// Redis keys por número: buf:{from} (lista de mensajes), buf_ts:{from} (timestamp del último).

const fs = require("fs");
const path = require("path");
const DIR = __dirname;

const w = JSON.parse(fs.readFileSync(path.join(DIR, "workflow_crm_empresarial.json"), "utf8").replace(/^﻿/, ""));
const CRED_REDIS = { redis: { id: "Pb4ansRdtu4Fu0yh", name: "Redis Cadabra" } };

// --- Nodos del buffer ---
const nodes = [];

// 1) Redis push: agrega el mensaje a la lista buf:{from} y setea timestamp único
nodes.push({
  parameters: {
    operation: "push",
    list: "={{ 'buf:' + $('Consolidar contexto').first().json.from }}",
    messageData: "={{ String($('Consolidar contexto').first().json.user_message || '') }}",
    tail: true,
    options: {},
  },
  id: "d0000000-0000-4000-8000-000000000001",
  name: "Buffer: push mensaje",
  type: "n8n-nodes-base.redis",
  typeVersion: 1,
  position: [1560, 200],
  credentials: CRED_REDIS,
});

// 2) Redis set timestamp = LA MISMA mi_marca calculada en "guardar mi marca"
//    (NO un $now nuevo, o difieren por milisegundos y el IF nunca coincide).
nodes.push({
  parameters: {
    operation: "set",
    key: "={{ 'buf_ts:' + $('Buffer: guardar mi marca').first().json.from_buf }}",
    value: "={{ $('Buffer: guardar mi marca').first().json.mi_marca }}",
    keyType: "string",
    expire: true,
    ttl: 60,
    options: {},
  },
  id: "d0000000-0000-4000-8000-000000000002",
  name: "Buffer: set timestamp",
  type: "n8n-nodes-base.redis",
  typeVersion: 1,
  position: [1760, 200],
  credentials: CRED_REDIS,
});

// Guardar mi propio marcador ÚNICO (se calcula UNA vez aquí y se reutiliza en todos lados)
nodes.push({
  parameters: {
    assignments: {
      assignments: [
        { id: "mk", name: "mi_marca", value: "={{ $now.toMillis() + '-' + $execution.id }}", type: "string" },
        { id: "fr", name: "from_buf", value: "={{ $('Consolidar contexto').first().json.from }}", type: "string" },
      ],
    },
    includeOtherFields: true,
    options: {},
  },
  id: "d0000000-0000-4000-8000-000000000003",
  name: "Buffer: guardar mi marca",
  type: "n8n-nodes-base.set",
  typeVersion: 3.4,
  position: [1360, 200],
});

// 3) Wait 8 segundos
nodes.push({
  parameters: { amount: 8, unit: "seconds" },
  id: "d0000000-0000-4000-8000-000000000004",
  name: "Buffer: esperar 8s",
  type: "n8n-nodes-base.wait",
  typeVersion: 1.1,
  position: [1960, 200],
  webhookId: "buffer-wait-crm",
});

// 4) Redis get timestamp actual (tras esperar)
nodes.push({
  parameters: {
    operation: "get",
    propertyName: "ts_actual",
    key: "={{ 'buf_ts:' + $('Buffer: guardar mi marca').first().json.from_buf }}",
    keyType: "string",
    options: {},
  },
  id: "d0000000-0000-4000-8000-000000000005",
  name: "Buffer: leer timestamp",
  type: "n8n-nodes-base.redis",
  typeVersion: 1,
  position: [2160, 200],
  credentials: CRED_REDIS,
});

// 5) IF ¿soy el último mensaje? (mi_marca == ts_actual)
nodes.push({
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "loose" },
      conditions: [
        {
          id: "c-ultimo",
          leftValue: "={{ $json.ts_actual }}",
          rightValue: "={{ $('Buffer: guardar mi marca').first().json.mi_marca }}",
          operator: { type: "string", operation: "equals" },
        },
      ],
      combinator: "and",
    },
    options: {},
  },
  id: "d0000000-0000-4000-8000-000000000006",
  name: "Buffer: ¿soy el último?",
  type: "n8n-nodes-base.if",
  typeVersion: 2,
  position: [2360, 200],
});

// 6) Redis: leer toda la lista de mensajes acumulados
nodes.push({
  parameters: {
    operation: "get",
    propertyName: "mensajes_lista",
    key: "={{ 'buf:' + $('Buffer: guardar mi marca').first().json.from_buf }}",
    keyType: "list",
    options: {},
  },
  id: "d0000000-0000-4000-8000-000000000007",
  name: "Buffer: leer mensajes",
  type: "n8n-nodes-base.redis",
  typeVersion: 1,
  position: [2560, 120],
  credentials: CRED_REDIS,
});

// 7) Redis: limpiar buffer (delete lista y ts)
nodes.push({
  parameters: {
    operation: "delete",
    key: "={{ 'buf:' + $('Buffer: guardar mi marca').first().json.from_buf }}",
    options: {},
  },
  id: "d0000000-0000-4000-8000-000000000008",
  name: "Buffer: limpiar lista",
  type: "n8n-nodes-base.redis",
  typeVersion: 1,
  position: [2760, 120],
  credentials: CRED_REDIS,
});

// 8) Set: combinar los mensajes en user_message y restaurar el contexto para el agente
nodes.push({
  parameters: {
    jsCode:
      "const ctx = $('Consolidar contexto').first().json;\n" +
      "let lista = $('Buffer: leer mensajes').first().json.mensajes_lista;\n" +
      "if (!Array.isArray(lista)) lista = lista ? [lista] : [];\n" +
      "// Redis push tail=true => orden cronológico. Unir con salto de línea.\n" +
      "const combinado = lista.filter(Boolean).join('\\n').trim() || ctx.user_message;\n" +
      "return [{ json: Object.assign({}, ctx, { user_message: combinado }) }];",
    options: {},
  },
  id: "d0000000-0000-4000-8000-000000000009",
  name: "Buffer: combinar mensajes",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [2960, 120],
});

// Agregar nodos al workflow
w.nodes.push(...nodes);

// --- Reconectar el flujo ---
// Antes: Consolidar contexto -> AI Agent
// Ahora: Consolidar contexto -> [buffer...] -> AI Agent (solo la rama "sí")
// Quitar la conexión directa Consolidar contexto -> AI Agent
w.connections["Consolidar contexto"] = { main: [[{ node: "Buffer: guardar mi marca", type: "main", index: 0 }]] };
w.connections["Buffer: guardar mi marca"] = { main: [[{ node: "Buffer: push mensaje", type: "main", index: 0 }]] };
w.connections["Buffer: push mensaje"] = { main: [[{ node: "Buffer: set timestamp", type: "main", index: 0 }]] };
w.connections["Buffer: set timestamp"] = { main: [[{ node: "Buffer: esperar 8s", type: "main", index: 0 }]] };
w.connections["Buffer: esperar 8s"] = { main: [[{ node: "Buffer: leer timestamp", type: "main", index: 0 }]] };
w.connections["Buffer: leer timestamp"] = { main: [[{ node: "Buffer: ¿soy el último?", type: "main", index: 0 }]] };
// IF: true -> leer mensajes; false -> nada (termina)
w.connections["Buffer: ¿soy el último?"] = { main: [[{ node: "Buffer: leer mensajes", type: "main", index: 0 }], []] };
w.connections["Buffer: leer mensajes"] = { main: [[{ node: "Buffer: limpiar lista", type: "main", index: 0 }]] };
w.connections["Buffer: limpiar lista"] = { main: [[{ node: "Buffer: combinar mensajes", type: "main", index: 0 }]] };
w.connections["Buffer: combinar mensajes"] = { main: [[{ node: "AI Agent", type: "main", index: 0 }]] };

const outFile = path.join(DIR, "workflow_crm_empresarial_buffer.json");
fs.writeFileSync(outFile, JSON.stringify(w, null, 2), { encoding: "utf8" });
console.log("OK ->", outFile, "| total nodos:", w.nodes.length);
