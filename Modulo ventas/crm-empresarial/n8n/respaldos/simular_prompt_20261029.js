// Simula "Consolidar contexto" + el render del prompt con la ficha de cada empresa.
// Uso: node simular_prompt.js <main_antes.json> <main_perfil.json> <05.sql> <outdir>
const fs = require("fs");
const path = require("path");
const [antesP, perfilP, sqlP, out] = process.argv.slice(2);
const antes = JSON.parse(fs.readFileSync(antesP, "utf8"));
const perfil = JSON.parse(fs.readFileSync(perfilP, "utf8"));
const sql = fs.readFileSync(sqlP, "utf8");
const cfgs = [...sql.matchAll(/\$cfg\$([\s\S]*?)\$cfg\$/g)].map(m => JSON.parse(m[1]));
const nodo = (w, n) => w.nodes.find(x => x.name === n).parameters;

function consolidar(ctxBase) {
  const code = nodo(perfil, "Consolidar contexto").jsCode;
  const fn = new Function("$", "$input", code);
  const $ = name => ({ first: () => ({ json: ctxBase }) });
  const $input = { all: () => [{ json: { role: "user", content: "hola" } }] };
  return fn($, $input)[0].json;
}

function render(tpl, json) {
  return tpl.replace(/^=/, "").replace(/\{\{\s*\$json\.([\w.]+)\s*\}\}/g, (_, p) => {
    const v = p.split(".").reduce((o, k) => (o == null ? o : o[k]), json);
    return v == null ? "" : String(v);
  });
}

const base = { rol: "anon", rut_cliente: null, from: "56995649108", phone_number_id: "x", user_message: "hola", message_id: "m" };
const casos = [
  { archivo: "sofia", ctx: { ...base, empresa: 1, nombre_empresa: "Cadabra Demo", nombre_asistente: "Sofía", config: cfgs[0] } },
  { archivo: "sonia", ctx: { ...base, empresa: 3, nombre_empresa: "Prueba Conexión WA", nombre_asistente: "Sonia", config: cfgs[1] } },
  { archivo: "sin_ficha", ctx: { ...base, empresa: 9, nombre_empresa: "Empresa Nueva", nombre_asistente: "Ana", config: {} } },
];
const tplNuevo = nodo(perfil, "AI Agent").options.systemMessage;
const tplViejo = nodo(antes, "AI Agent").options.systemMessage;
for (const c of casos) {
  const j = consolidar(c.ctx);
  fs.writeFileSync(path.join(out, `prompt_${c.archivo}.txt`), render(tplNuevo, j), "utf8");
  console.log(c.archivo, "OK | menu cliente:", j.perfil.menu.texto_cliente.slice(0, 40), "| interes:", j.perfil.categorias_interes, "| calendar:", j.perfil.calendar_id);
}
const j1 = consolidar(casos[0].ctx);
fs.writeFileSync(path.join(out, "prompt_sofia_ANTES.txt"), render(tplViejo, j1), "utf8");

// Detectar interés y Detectar agenda: que compilen y respondan con la ficha
const inter = new Function("$", "$input", nodo(perfil, "Detectar interés (auto)").jsCode);
for (const c of casos.slice(0, 2)) {
  const ctx = { ...consolidar(c.ctx), user_message: c.archivo === "sofia" ? "cuanto valen las empanadas de pino" : "precio del arroz?" };
  const r = inter(n => ({ first: () => ({ json: ctx }) }), {})[0].json;
  console.log("interes", c.archivo, "->", r.producto_interes, "| registrar:", r.debeRegistrar);
}
const agendaFn = new Function("$", "$input", nodo(perfil, "Detectar agenda (auto)").jsCode);
const pruebasAgenda = [
  ["sofia", "quiero agendar una reunion el lunes a las 10 mi correo es x@y.cl"],
  ["sonia", "quiero agendar una visita el lunes a las 10"],
  ["sonia", "quiero agendar una visita el sabado a las 10"],
  ["sonia", "quiero agendar una visita el lunes a las 20"],
];
for (const [quien, msg] of pruebasAgenda) {
  const c = casos.find(x => x.archivo === quien);
  const ctx = { ...consolidar(c.ctx), user_message: msg, history: [] };
  const r = agendaFn(n => ({ first: () => ({ json: ctx }) }), {})[0].json;
  console.log("agenda", quien, "|", msg, "->", JSON.stringify(r).slice(0, 260));
}
