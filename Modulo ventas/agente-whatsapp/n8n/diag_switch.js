#!/usr/bin/env node
/**
 * diag_switch.js — Para las últimas ejecuciones, muestra el `type` real del
 * mensaje que llegó y por qué salida del Switch salió. Diagnostica por qué una
 * foto (type=image) cae en el fallback en vez de la rama image.
 *
 * Uso:  $env:N8N_API_KEY="<key>";  node diag_switch.js
 */
const BASE = "https://appcadabra-cadabra-project.jmyxxj.easypanel.host";
const MULTIMODAL = "nI1fEpupB3WKHgZ2";
const API_KEY = process.env.N8N_API_KEY;
if (!API_KEY) { console.error("ERROR: falta N8N_API_KEY."); process.exit(1); }
const headers = { "X-N8N-API-KEY": API_KEY, "Content-Type": "application/json" };

async function main() {
  const { data } = await (await fetch(`${BASE}/api/v1/executions?workflowId=${MULTIMODAL}&limit=4&includeData=true`, { headers })).json();
  for (const ex of data || []) {
    const rd = ex.data?.resultData?.runData;
    if (!rd) continue;
    const whk = rd["Webhook WhatsApp"]?.[0]?.data?.main?.[0]?.[0]?.json;
    const value = whk?.body?.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    console.log(`\n== Ejec ${ex.id} | ${ex.startedAt} ==`);
    console.log("  message.type:", JSON.stringify(msg?.type));
    console.log("  ¿hay value.messages?:", !!value?.messages, "| ¿statuses?:", !!value?.statuses);
    console.log("  ruta:", Object.keys(rd).join(" → "));
    if (msg?.image) console.log("  image obj:", JSON.stringify(msg.image));
  }
}
main().catch(e => { console.error("❌", e.message); process.exit(1); });
