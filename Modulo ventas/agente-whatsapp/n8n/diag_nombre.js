#!/usr/bin/env node
/**
 * diag_nombre.js — Averigua de dónde salió el nombre "Jorge": revisa qué
 * nombre_contacto trae "Determinar rol" (de agente_contactos) y qué historial
 * previo se le pasó al AI Agent (por si el nombre viene de una conversación vieja).
 *
 * Uso:  $env:N8N_API_KEY="<key>";  node diag_nombre.js
 */
const BASE = "https://appcadabra-cadabra-project.jmyxxj.easypanel.host";
const MULTIMODAL = "nI1fEpupB3WKHgZ2";
const API_KEY = process.env.N8N_API_KEY;
if (!API_KEY) { console.error("ERROR: falta N8N_API_KEY."); process.exit(1); }
const headers = { "X-N8N-API-KEY": API_KEY, "Content-Type": "application/json" };
const fj = (rd, n) => rd?.[n]?.[0]?.data?.main?.[0]?.[0]?.json;

async function main() {
  const { data } = await (await fetch(`${BASE}/api/v1/executions?workflowId=${MULTIMODAL}&limit=12&includeData=true`, { headers })).json();
  for (const ex of data || []) {
    const rd = ex.data?.resultData?.runData;
    if (!rd || !rd["Consolidar contexto"]) continue;
    const rol = fj(rd, "Determinar rol");
    const ctx = fj(rd, "Consolidar contexto");
    console.log(`\n== Ejec ${ex.id} | ${ex.startedAt} ==`);
    if (rol) console.log("  agente_contactos.nombre_contacto:", JSON.stringify(rol.nombre_contacto), "| rol:", rol.rol);
    if (ctx) {
      console.log("  user_message:", JSON.stringify((ctx.user_message||"").slice(0,80)));
      const ht = ctx.history_text || "";
      const jorge = ht.toLowerCase().includes("jorge");
      console.log("  ¿'Jorge' aparece en el history_text?:", jorge);
      if (jorge) {
        // mostrar las líneas con Jorge
        ht.split("\n").filter(l => l.toLowerCase().includes("jorge")).slice(0,4).forEach(l => console.log("     >", l.slice(0,120)));
      }
    }
    return;
  }
  console.log("No hay ejecuciones con 'Consolidar contexto' recientes.");
}
main().catch(e => { console.error("❌", e.message); process.exit(1); });
