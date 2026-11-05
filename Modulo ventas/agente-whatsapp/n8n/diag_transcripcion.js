#!/usr/bin/env node
/**
 * diag_transcripcion.js — Muestra, de la última ejecución del multimodal, QUÉ
 * transcribió Whisper, qué user_message se construyó y qué nombre trajo Meta.
 * Sirve para ver por qué Sofía respondió un saludo en vez de la consulta.
 *
 * Uso:  $env:N8N_API_KEY="<key>";  node diag_transcripcion.js
 */
const BASE = "https://appcadabra-cadabra-project.jmyxxj.easypanel.host";
const MULTIMODAL = "nI1fEpupB3WKHgZ2";
const API_KEY = process.env.N8N_API_KEY;
if (!API_KEY) { console.error("ERROR: falta N8N_API_KEY."); process.exit(1); }
const headers = { "X-N8N-API-KEY": API_KEY, "Content-Type": "application/json" };

function firstJson(runData, nodo) {
  const c = runData?.[nodo]?.[0]?.data?.main?.[0]?.[0]?.json;
  return c;
}

async function main() {
  const { data } = await (await fetch(`${BASE}/api/v1/executions?workflowId=${MULTIMODAL}&limit=3&includeData=true`, { headers })).json();
  if (!data?.length) { console.log("Sin ejecuciones."); return; }
  for (const ex of data) {
    const rd = ex.data?.resultData?.runData;
    if (!rd) continue;
    console.log(`\n===== Ejecución ${ex.id} | ${ex.status} | ${ex.startedAt} =====`);
    console.log("  Nodos:", Object.keys(rd).join(" → "));
    const wh = firstJson(rd, "Whisper transcribir");
    if (wh) console.log("  ▶ Whisper.text:", JSON.stringify(wh.text ?? wh));
    const na = firstJson(rd, "Normalizar audio");
    if (na) console.log("  ▶ user_message (audio):", JSON.stringify(na.user_message));
    // Nombre que trae Meta en el webhook
    const whk = rd["Webhook WhatsApp"]?.[0]?.data?.main?.[0]?.[0]?.json;
    const contact = whk?.body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0];
    if (contact) console.log("  ▶ Meta profile.name:", JSON.stringify(contact.profile?.name), "| wa_id:", contact.wa_id);
    // Rol/nombre resuelto desde agente_contactos
    const rol = firstJson(rd, "Determinar rol");
    if (rol) console.log("  ▶ rol:", rol.rol, "| nombre_contacto (BD):", JSON.stringify(rol.nombre_contacto));
    // Respuesta del agente
    const ag = firstJson(rd, "AI Agent");
    if (ag) console.log("  ▶ AI Agent output:", JSON.stringify((ag.output||"").slice(0,200)));
  }
}
main().catch(e => { console.error("❌", e.message); process.exit(1); });
