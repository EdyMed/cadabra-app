// Despliega los 4 workflows migrados (NocoDB -> Supabase) vía PUT a la API de n8n.
// Usa un payload MÍNIMO (name/nodes/connections/settings) para evitar mandar campos
// read-only como activeVersion que la API de descarga incluye pero el PUT no espera.
// Uso: N8N_API_KEY=... node deploy_migracion_supabase.js

const fs = require("fs");

const BASE = "https://appcadabra-cadabra-project.jmyxxj.easypanel.host";
const API_KEY = process.env.N8N_API_KEY;
if (!API_KEY) {
  console.error("Falta N8N_API_KEY en el entorno");
  process.exit(1);
}

const SOLO = process.env.SOLO_ID;
const ALL = [
  { id: "aiV5ye7IxY1DGFrK", file: "_wf_aiV5ye7IxY1DGFrK_migrado.json", label: "CRM Upsert" },
  { id: "H0Q3kX8qW5y9xfnE", file: "_wf_H0Q3kX8qW5y9xfnE_migrado.json", label: "Contador Conversaciones" },
  { id: "rImoJOhAKuxQrS59", file: "_wf_rImoJOhAKuxQrS59_migrado.json", label: "Alerta Vendedor" },
  { id: "LspLEGA3ZegcYoIH", file: "_wf_LspLEGA3ZegcYoIH_migrado.json", label: "Agente Whatsap CRM Empresarial (principal)" },
];
const WORKFLOWS = SOLO ? ALL.filter((w) => w.id === SOLO) : ALL;

async function deploy({ id, file, label }) {
  const wf = JSON.parse(fs.readFileSync(file, "utf8"));
  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || { executionOrder: "v1" },
  };

  const res = await fetch(`${BASE}/api/v1/workflows/${id}`, {
    method: "PUT",
    headers: {
      "X-N8N-API-KEY": API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`FALLO ${label} (${id}): HTTP ${res.status}\n${text.slice(0, 1000)}`);
    return false;
  }
  console.log(`OK ${label} (${id}): desplegado`);
  return true;
}

(async () => {
  let allOk = true;
  for (const w of WORKFLOWS) {
    const ok = await deploy(w);
    allOk = allOk && ok;
  }
  process.exit(allOk ? 0 : 1);
})();
