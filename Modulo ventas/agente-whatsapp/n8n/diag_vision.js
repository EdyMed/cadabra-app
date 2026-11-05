#!/usr/bin/env node
/**
 * diag_vision.js — Muestra el error EXACTO que devolvió OpenAI en el nodo
 * "GPT-4o Vision" y cómo llegó el binario (para ver por qué "Bad request").
 *
 * Uso:  $env:N8N_API_KEY="<key>";  node diag_vision.js
 */
const BASE = "https://appcadabra-cadabra-project.jmyxxj.easypanel.host";
const MULTIMODAL = "nI1fEpupB3WKHgZ2";
const API_KEY = process.env.N8N_API_KEY;
if (!API_KEY) { console.error("ERROR: falta N8N_API_KEY."); process.exit(1); }
const headers = { "X-N8N-API-KEY": API_KEY, "Content-Type": "application/json" };

async function main() {
  const { data } = await (await fetch(`${BASE}/api/v1/executions?workflowId=${MULTIMODAL}&limit=6&includeData=true`, { headers })).json();
  for (const ex of data || []) {
    const rd = ex.data?.resultData?.runData;
    if (!rd || !rd["GPT-4o Vision"]) continue;
    console.log(`\n== Ejec ${ex.id} | ${ex.startedAt} ==`);
    // Cómo llegó el binario del nodo Descargar
    const dl = rd["Descargar binario"]?.[0]?.data;
    const bin = dl?.main?.[0]?.[0]?.binary;
    if (bin) {
      for (const [k, v] of Object.entries(bin)) console.log(`  binary["${k}"]: mimeType=${v.mimeType} fileName=${v.fileName} dataLen=${(v.data||"").length}`);
    } else console.log("  (sin binary en Descargar binario)");
    // Error del nodo Vision
    const vis = rd["GPT-4o Vision"]?.[0];
    if (vis?.error) {
      console.log("  ❌ Vision error message:", vis.error.message);
      const d = vis.error.description || vis.error.context?.data || vis.error.cause;
      if (d) console.log("  detalle:", JSON.stringify(d).slice(0, 800));
      // A veces el cuerpo de respuesta de OpenAI viene en error.context
      if (vis.error.context) console.log("  context:", JSON.stringify(vis.error.context).slice(0, 800));
    } else {
      console.log("  Vision OK:", JSON.stringify(vis?.data?.main?.[0]?.[0]?.json).slice(0,300));
    }
    return; // solo la más reciente con Vision
  }
  console.log("No encontré ejecuciones que llegaran a 'GPT-4o Vision'.");
}
main().catch(e => { console.error("❌", e.message); process.exit(1); });
