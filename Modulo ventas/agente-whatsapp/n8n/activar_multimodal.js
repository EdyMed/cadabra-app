#!/usr/bin/env node
/**
 * activar_multimodal.js — Cambio en caliente para PROBAR el multimodal en vivo
 * en el MISMO número de WhatsApp:
 *   1) DESACTIVA el workflow de producción (solo-texto) s3rtqAowJhIXvBUU
 *   2) ACTIVA el workflow multimodal nI1fEpupB3WKHgZ2
 * Ambos usan el path /whatsapp-agent, así que el número queda atendido por el
 * multimodal mientras dure la prueba.
 *
 * Para REVERTIR (volver a producción solo-texto):
 *   node activar_multimodal.js --revert
 *
 * Uso (PowerShell, desde la carpeta n8n/):
 *   $env:N8N_API_KEY = "<tu key>"
 *   node activar_multimodal.js            # multimodal en vivo
 *   node activar_multimodal.js --revert   # volver a producción
 *
 * Requiere Node 18+ (fetch nativo).
 */
const BASE = "https://appcadabra-cadabra-project.jmyxxj.easypanel.host";
const PROD = "s3rtqAowJhIXvBUU";        // producción (solo texto)
const MULTIMODAL = "nI1fEpupB3WKHgZ2";  // multimodal (creado 2026-08-13)

const API_KEY = process.env.N8N_API_KEY;
if (!API_KEY) { console.error('ERROR: falta N8N_API_KEY.\n  $env:N8N_API_KEY = "<key>"'); process.exit(1); }
const headers = { "X-N8N-API-KEY": API_KEY, "Content-Type": "application/json" };
const revert = process.argv.includes("--revert");

async function setActive(id, active) {
  const res = await fetch(`${BASE}/api/v1/workflows/${id}/${active ? "activate" : "deactivate"}`, { method: "POST", headers });
  if (!res.ok) throw new Error(`${active ? "activate" : "deactivate"} ${id} → ${res.status} ${await res.text()}`);
  console.log(`  ${active ? "ACTIVADO" : "desactivado"}: ${id}`);
}

async function main() {
  if (revert) {
    console.log("REVERT → volviendo a producción (solo texto)...");
    await setActive(MULTIMODAL, false);  // apagar multimodal primero (libera el path)
    await setActive(PROD, true);
    console.log("✅ Producción (solo texto) activa de nuevo. Multimodal inactivo.");
  } else {
    console.log("Activando MULTIMODAL en vivo (mismo número)...");
    await setActive(PROD, false);        // apagar producción primero (libera el path)
    await setActive(MULTIMODAL, true);
    console.log("✅ Multimodal ACTIVO en /whatsapp-agent. Prueba audio/foto/PDF por WhatsApp.");
    console.log("   Para volver a producción: node activar_multimodal.js --revert");
  }
}
main().catch(e => { console.error("❌", e.message); process.exit(1); });
