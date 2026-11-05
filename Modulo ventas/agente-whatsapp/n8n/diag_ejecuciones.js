#!/usr/bin/env node
/**
 * diag_ejecuciones.js — Muestra las últimas ejecuciones del workflow multimodal
 * y, para la más reciente que haya fallado (o la última), imprime en qué NODO se
 * detuvo y el mensaje de error. Sirve para diagnosticar por qué el audio no responde.
 *
 * Uso (PowerShell, desde n8n/):
 *   $env:N8N_API_KEY = "<key>"
 *   node diag_ejecuciones.js
 */
const BASE = "https://appcadabra-cadabra-project.jmyxxj.easypanel.host";
const MULTIMODAL = "nI1fEpupB3WKHgZ2";
const API_KEY = process.env.N8N_API_KEY;
if (!API_KEY) { console.error('ERROR: falta N8N_API_KEY.'); process.exit(1); }
const headers = { "X-N8N-API-KEY": API_KEY, "Content-Type": "application/json" };

async function main() {
  // Últimas ejecuciones del workflow multimodal, con datos completos.
  const listRes = await fetch(`${BASE}/api/v1/executions?workflowId=${MULTIMODAL}&limit=5&includeData=true`, { headers });
  if (!listRes.ok) throw new Error(`list → ${listRes.status} ${await listRes.text()}`);
  const { data } = await listRes.json();
  if (!data || !data.length) { console.log("No hay ejecuciones registradas para el multimodal."); return; }

  for (const ex of data) {
    console.log(`\n===== Ejecución ${ex.id} | status=${ex.status} | ${ex.startedAt} =====`);
    const run = ex.data?.resultData;
    if (!run) { console.log("  (sin resultData)"); continue; }
    if (run.error) {
      console.log("  ERROR GLOBAL:", run.error.message || run.error.name);
      if (run.lastNodeExecuted) console.log("  Último nodo:", run.lastNodeExecuted);
    }
    const runData = run.runData || {};
    const orden = Object.keys(runData);
    console.log("  Nodos ejecutados:", orden.join(" → ") || "(ninguno)");
    // Buscar el nodo que falló
    for (const [nombre, corridas] of Object.entries(runData)) {
      for (const c of corridas) {
        if (c.error) {
          console.log(`\n  ❌ NODO CON ERROR: "${nombre}"`);
          console.log("     mensaje:", c.error.message);
          if (c.error.description) console.log("     detalle:", String(c.error.description).slice(0, 400));
          if (c.error.httpCode) console.log("     httpCode:", c.error.httpCode);
        }
      }
    }
  }
}
main().catch(e => { console.error("❌", e.message); process.exit(1); });
