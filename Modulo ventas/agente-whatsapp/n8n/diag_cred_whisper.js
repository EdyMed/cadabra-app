#!/usr/bin/env node
/**
 * diag_cred_whisper.js — Inspecciona qué credencial tiene enlazada el nodo
 * "Whisper transcribir" en el workflow multimodal, comparado con la del modelo
 * de chat (OpenAI GPT-4o) que SÍ funciona, para ver la diferencia.
 *
 * Uso:  $env:N8N_API_KEY="<key>";  node diag_cred_whisper.js
 */
const BASE = "https://appcadabra-cadabra-project.jmyxxj.easypanel.host";
const MULTIMODAL = "nI1fEpupB3WKHgZ2";
const API_KEY = process.env.N8N_API_KEY;
if (!API_KEY) { console.error("ERROR: falta N8N_API_KEY."); process.exit(1); }
const headers = { "X-N8N-API-KEY": API_KEY, "Content-Type": "application/json" };

async function main() {
  const wf = await (await fetch(`${BASE}/api/v1/workflows/${MULTIMODAL}`, { headers })).json();
  console.log(`Workflow: ${wf.name}\n`);
  for (const nombre of ["Whisper transcribir", "OpenAI GPT-4o", "GPT-4o Vision"]) {
    const n = wf.nodes.find(x => x.name === nombre);
    if (!n) { console.log(`(no existe nodo "${nombre}")`); continue; }
    console.log(`=== ${nombre} ===`);
    console.log("  type:", n.type, "v" + n.typeVersion);
    console.log("  credentials:", JSON.stringify(n.credentials || "(NINGUNA)"));
    console.log();
  }
  // Listar credenciales OpenAI existentes en la instancia (nombre + id + tipo)
  try {
    const creds = await (await fetch(`${BASE}/api/v1/credentials`, { headers })).json();
    const arr = creds.data || creds;
    console.log("=== Credenciales tipo openAiApi en la instancia ===");
    for (const c of arr) if ((c.type || "").toLowerCase().includes("openai")) console.log(`  id=${c.id} name="${c.name}" type=${c.type}`);
  } catch (e) { console.log("(no se pudieron listar credenciales por API:", e.message, ")"); }
}
main().catch(e => { console.error("❌", e.message); process.exit(1); });
