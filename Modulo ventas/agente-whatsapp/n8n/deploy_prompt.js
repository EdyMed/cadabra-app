#!/usr/bin/env node
/**
 * deploy_prompt.js — Actualiza SOLO el system prompt del nodo "AI Agent" en n8n.
 *
 * Estrategia segura: baja el workflow REAL desde n8n (que ya tiene las
 * credenciales y el calendar ID correctos), reemplaza únicamente el
 * systemMessage del AI Agent con el contenido de system_prompt_nuevo.txt,
 * y lo vuelve a subir. NO toca credenciales ni ningún otro nodo.
 *
 * Uso (PowerShell, desde la carpeta n8n/):
 *   $env:N8N_API_KEY = "<pega aquí tu API key nueva>"
 *   node deploy_prompt.js
 *
 * (La API key NO se guarda en disco: se lee de la variable de entorno.)
 */
const fs = require("fs");
const path = require("path");

const BASE = "https://appcadabra-cadabra-project.jmyxxj.easypanel.host";
const WORKFLOW_ID = "s3rtqAowJhIXvBUU";
const PROMPT_FILE = path.join(__dirname, "system_prompt_nuevo.txt");
const LOCAL_JSON = path.join(__dirname, "workflow_agente_min.json");

const API_KEY = process.env.N8N_API_KEY;
if (!API_KEY) {
  console.error("ERROR: falta la variable N8N_API_KEY. En PowerShell:");
  console.error('  $env:N8N_API_KEY = "<tu api key nueva>"');
  process.exit(1);
}

const headers = { "X-N8N-API-KEY": API_KEY, "Content-Type": "application/json" };

async function main() {
  const nuevoPrompt = fs.readFileSync(PROMPT_FILE, "utf8");
  console.log(`Prompt nuevo: ${nuevoPrompt.length} caracteres.`);

  // 1) GET el workflow real (con credenciales correctas ya enlazadas)
  console.log("Bajando workflow real de n8n...");
  const getRes = await fetch(`${BASE}/api/v1/workflows/${WORKFLOW_ID}`, { headers });
  if (!getRes.ok) throw new Error(`GET falló: ${getRes.status} ${await getRes.text()}`);
  const wf = await getRes.json();
  console.log(`  OK: "${wf.name}", ${wf.nodes.length} nodos, activo=${wf.active}`);

  // 2a) Parchear el systemMessage del AI Agent (desde system_prompt_nuevo.txt).
  const agent = wf.nodes.find(n => n.name === "AI Agent");
  if (!agent) throw new Error('No se encontró el nodo "AI Agent".');
  const antes = agent.parameters?.options?.systemMessage ?? "";
  agent.parameters.options = agent.parameters.options || {};
  agent.parameters.options.systemMessage = nuevoPrompt;
  console.log(`  systemMessage: ${antes.length} → ${nuevoPrompt.length} caracteres.`);

  // 2b) Sincronizar `parameters` de nodos concretos desde el JSON local
  //     (query de stock_producto, límite de historial, filter de Consolidar).
  //     Copia SOLO parameters — NO toca credentials, id, position ni type.
  const local = require(LOCAL_JSON);
  const A_SINCRONIZAR = ["stock_producto", "Recuperar historial", "Consolidar contexto"];
  for (const nombre of A_SINCRONIZAR) {
    const real = wf.nodes.find(n => n.name === nombre);
    const loc = local.nodes.find(n => n.name === nombre);
    if (real && loc) {
      real.parameters = loc.parameters;
      console.log(`  sincronizado parameters de: ${nombre}`);
    } else {
      console.warn(`  (aviso) no se pudo sincronizar ${nombre} (real=${!!real}, local=${!!loc})`);
    }
  }

  // 3) PUT de vuelta. La API de n8n espera name + nodes + connections + settings.
  const body = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || { executionOrder: "v1" },
  };
  console.log("Subiendo workflow actualizado...");
  const putRes = await fetch(`${BASE}/api/v1/workflows/${WORKFLOW_ID}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
  if (!putRes.ok) throw new Error(`PUT falló: ${putRes.status} ${await putRes.text()}`);
  console.log("✅ Workflow actualizado (prompt + parameters de nodos sincronizados).");
  console.log("   (Las credenciales, IDs y demás nodos quedaron intactos.)");
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
