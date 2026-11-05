#!/usr/bin/env node
/**
 * push_multimodal.js — Sube el JSON local (workflow_agente_multimodal.json) al
 * workflow multimodal YA CREADO en n8n (id nI1fEpupB3WKHgZ2), PRESERVANDO las
 * credenciales que ya tiene enlazadas (baja el remoto, copia credentials por
 * nombre de nodo; los nodos nuevos heredan por tipo de credencial).
 *
 * Úsalo cada vez que edites el JSON local y quieras reflejarlo en el workflow de
 * prueba sin re-crearlo ni re-enlazar credenciales a mano.
 *
 * Uso:  $env:N8N_API_KEY="<key>";  node push_multimodal.js
 */
const fs = require("fs");
const path = require("path");
const BASE = "https://appcadabra-cadabra-project.jmyxxj.easypanel.host";
const MULTIMODAL = "nI1fEpupB3WKHgZ2";
const FILE = path.join(__dirname, "workflow_agente_multimodal.json");
const API_KEY = process.env.N8N_API_KEY;
if (!API_KEY) { console.error("ERROR: falta N8N_API_KEY."); process.exit(1); }
const headers = { "X-N8N-API-KEY": API_KEY, "Content-Type": "application/json" };

async function main() {
  const local = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const remote = await (await fetch(`${BASE}/api/v1/workflows/${MULTIMODAL}`, { headers })).json();

  const credByName = {}, credByType = {};
  for (const n of remote.nodes) if (n.credentials) {
    credByName[n.name] = n.credentials;
    for (const k of Object.keys(n.credentials)) credByType[k] = n.credentials[k];
  }
  let byName = 0, byType = 0, sin = [];
  for (const n of local.nodes) {
    if (!n.credentials) continue;
    if (credByName[n.name]) { n.credentials = credByName[n.name]; byName++; continue; }
    let ok = true;
    for (const k of Object.keys(n.credentials)) { if (credByType[k]) { n.credentials[k] = credByType[k]; byType++; } else ok = false; }
    if (!ok) sin.push(n.name);
  }
  console.log(`Credenciales: ${byName} por nombre, ${byType} por tipo.` + (sin.length ? `  ⚠ sin resolver: ${sin.join(", ")}` : ""));

  const body = { name: local.name, nodes: local.nodes, connections: local.connections, settings: local.settings || { executionOrder: "v1" } };
  const res = await fetch(`${BASE}/api/v1/workflows/${MULTIMODAL}`, { method: "PUT", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`PUT falló: ${res.status} ${await res.text()}`);
  console.log(`✅ Multimodal (${MULTIMODAL}) actualizado. ${local.nodes.length} nodos.`);
  // El workflow puede quedar desactivado tras un PUT; reactivar si estaba activo.
  if (remote.active) {
    const act = await fetch(`${BASE}/api/v1/workflows/${MULTIMODAL}/activate`, { method: "POST", headers });
    console.log(act.ok ? "   Reactivado (seguía activo antes)." : "   ⚠ No se pudo reactivar automáticamente; actívalo en la UI.");
  }
}
main().catch(e => { console.error("❌", e.message); process.exit(1); });
