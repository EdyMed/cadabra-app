#!/usr/bin/env node
/**
 * deploy_multimodal.js — Despliega el workflow MULTIMODAL a n8n preservando
 * las credenciales por NOMBRE de nodo desde el workflow que ya está en n8n.
 *
 * A diferencia de deploy_prompt.js (que sólo parchea el prompt de un workflow
 * existente), este script sube un GRAFO NUEVO (nodos + conexiones distintos),
 * así que NO se puede hacer sólo un parche: se hace PUT del workflow completo.
 * Para no perder credenciales, copia el bloque `credentials` de cada nodo desde
 * el workflow remoto que coincida por nombre.
 *
 * IMPORTANTE — decide primero QUÉ vas a desplegar:
 *   MODO A (recomendado para probar sin riesgo): crear un workflow NUEVO
 *     (POST) con el JSON multimodal → queda INACTIVO, con su propio webhook
 *     path `whatsapp-agent` (colisiona con el de producción si ambos están
 *     activos; para probar, o bien cambia el path, o desactiva el de producción).
 *   MODO B (reemplazar producción): PUT sobre el workflow existente
 *     s3rtqAowJhIXvBUU con el JSON multimodal. Sólo cuando ya validaste.
 *
 * Uso (PowerShell, desde la carpeta n8n/):
 *   $env:N8N_API_KEY = "<tu api key>"
 *   node deploy_multimodal.js --new         # MODO A: crea workflow nuevo
 *   node deploy_multimodal.js --replace      # MODO B: reemplaza producción
 *
 * Requiere Node 18+ (fetch nativo).
 */
const fs = require("fs");
const path = require("path");

const BASE = "https://appcadabra-cadabra-project.jmyxxj.easypanel.host";
const PROD_WORKFLOW_ID = "s3rtqAowJhIXvBUU"; // workflow de producción (texto)
const LOCAL_JSON = path.join(__dirname, "workflow_agente_multimodal.json");

const API_KEY = process.env.N8N_API_KEY;
if (!API_KEY) { console.error('ERROR: falta N8N_API_KEY. En PowerShell:\n  $env:N8N_API_KEY = "<key>"'); process.exit(1); }
const headers = { "X-N8N-API-KEY": API_KEY, "Content-Type": "application/json" };

const mode = process.argv.includes("--replace") ? "replace" : (process.argv.includes("--new") ? "new" : null);
if (!mode) { console.error("Indica el modo: --new (crea workflow nuevo, seguro) o --replace (reemplaza producción)."); process.exit(1); }

async function main() {
  const local = JSON.parse(fs.readFileSync(LOCAL_JSON, "utf8"));
  console.log(`Local: "${local.name}", ${local.nodes.length} nodos.`);

  // 1) Bajar el workflow de producción para COPIAR sus credenciales por nombre de nodo.
  console.log("Bajando workflow de producción (para heredar credenciales)...");
  const getRes = await fetch(`${BASE}/api/v1/workflows/${PROD_WORKFLOW_ID}`, { headers });
  if (!getRes.ok) throw new Error(`GET falló: ${getRes.status} ${await getRes.text()}`);
  const prod = await getRes.json();
  const credByName = {};
  for (const n of prod.nodes) if (n.credentials) credByName[n.name] = n.credentials;

  // 2) Heredar credenciales: por nombre de nodo (los nodos con el mismo nombre
  //    ya existían); los nodos NUEVOS con placeholders REEMPLAZAR_* se resuelven
  //    por TIPO de credencial (buscamos un nodo de producción con la misma cred).
  const credByType = {}; // p.ej. { httpHeaderAuth: {...}, openAiApi: {...}, postgres: {...} }
  for (const n of prod.nodes) if (n.credentials) for (const k of Object.keys(n.credentials)) credByType[k] = n.credentials[k];

  let heredadas = 0, porTipo = 0, sinResolver = [];
  for (const n of local.nodes) {
    if (!n.credentials) continue;
    if (credByName[n.name]) { n.credentials = credByName[n.name]; heredadas++; continue; }
    // nodo nuevo: resolver por tipo de credencial
    let ok = true;
    for (const k of Object.keys(n.credentials)) {
      if (credByType[k]) { n.credentials[k] = credByType[k]; porTipo++; }
      else { ok = false; }
    }
    if (!ok) sinResolver.push(n.name);
  }
  console.log(`Credenciales: ${heredadas} por nombre, ${porTipo} por tipo.`);
  if (sinResolver.length) console.warn("  ⚠ sin resolver (revisar en UI):", sinResolver.join(", "));

  const body = { name: local.name, nodes: local.nodes, connections: local.connections, settings: local.settings || { executionOrder: "v1" } };

  if (mode === "new") {
    console.log("MODO A: creando workflow NUEVO (POST)...");
    const res = await fetch(`${BASE}/api/v1/workflows`, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`POST falló: ${res.status} ${await res.text()}`);
    const created = await res.json();
    console.log(`✅ Workflow nuevo creado: id=${created.id}, INACTIVO.`);
    console.log("   OJO: usa el mismo webhook path que producción. Para probar, desactiva");
    console.log("   el de producción o cambia el path del webhook antes de activar.");
  } else {
    console.log(`MODO B: REEMPLAZANDO producción (PUT ${PROD_WORKFLOW_ID})...`);
    const res = await fetch(`${BASE}/api/v1/workflows/${PROD_WORKFLOW_ID}`, { method: "PUT", headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`PUT falló: ${res.status} ${await res.text()}`);
    console.log("✅ Producción reemplazada por el workflow multimodal. Verifica en la UI y reactiva si hace falta.");
  }
}
main().catch(e => { console.error("❌", e.message); process.exit(1); });
