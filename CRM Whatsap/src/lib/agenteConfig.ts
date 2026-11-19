import { adminPool, whatsappPool } from "@/lib/db";

// Ficha del agente por empresa (public.agente_empresas_config.config, jsonb).
// n8n la lee en "Consolidar contexto" para armar el prompt, el menú, la detección
// de interés, la agenda y la fuente del catálogo. Esta capa la valida y la guarda
// desde la pantalla "Ficha del agente" del panel (solo admin).

export type Boton = { id: string; title: string };
export type FichaAgente = {
  configurado?: boolean;
  negocio?: {
    descripcion?: string; horario?: string; direccion?: string; despacho?: string;
    pagos?: string; pedido_minimo?: string; politicas?: string; no_prometer?: string;
  };
  tono?: { texto?: string; trato?: "tu" | "usted"; emojis?: string; saludo?: string };
  catalogo?: {
    texto?: string; categorias_menu?: string; unidad?: string; disponibilidad?: string;
    sinonimos?: { dice: string; buscar: string }[];
  };
  escalamiento?: string;
  faq?: { p: string; r: string }[];
  interes?: { categorias?: { nombre: string; regex: string }[]; senales?: string };
  menu?: { texto_owner?: string; texto_cliente?: string; botones_owner?: Boton[]; botones_cliente?: Boton[] };
  agenda?: {
    activa?: boolean; tipo?: string; duracion_min?: number; dias?: number[]; hora_inicio?: string;
    hora_fin?: string; anticipacion_horas?: number; pide_correo?: boolean; correo_negocio?: string;
    calendar_id?: string; lugar?: string; mensaje_confirmacion?: string;
  };
  fuentes?: {
    catalogo?: { tipo: "erp_supabase" | "google_sheets" | "tabla_cadabra"; sheet_id?: string; gid?: string | number; frecuencia_horas?: number };
  };
  [extra: string]: unknown; // claves que la pantalla no edita se conservan tal cual
};

export type EstadoAgente = {
  whatsapp: { conectado: boolean; numero: string | null; nombre: string | null } | null;
  catalogo: { productos: number; ultimaSync: { ok: boolean; filas: number | null; mensaje: string | null; fecha: string } | null };
};

export async function getFicha(empresa: number): Promise<{ nombreEmpresa: string; nombreAsistente: string; config: FichaAgente } | null> {
  const r = await adminPool.query(
    `SELECT u.nombre_empresa, c.nombre_asistente, c.config
       FROM public.dashboard_usuarios u
       LEFT JOIN public.agente_empresas_config c ON c.empresa = u.empresa
      WHERE u.empresa = $1
      ORDER BY u.is_admin DESC
      LIMIT 1`,
    [empresa]
  );
  const row = r.rows[0];
  if (!row) return null;
  return { nombreEmpresa: row.nombre_empresa, nombreAsistente: row.nombre_asistente ?? "Sofía", config: row.config ?? {} };
}

export async function getEstado(empresa: number): Promise<EstadoAgente> {
  const [wa, cat, sync] = await Promise.all([
    whatsappPool.query(
      `SELECT estado, display_phone, verified_name FROM public.agente_whatsapp_cuentas WHERE empresa = $1`, [empresa]
    ).catch(() => ({ rows: [] as any[] })),
    whatsappPool.query(`SELECT count(*)::int AS n FROM public.catalogo_productos WHERE empresa = $1`, [empresa])
      .catch(() => ({ rows: [{ n: 0 }] })),
    whatsappPool.query(
      `SELECT ok, filas, mensaje, ejecutado_en::text AS fecha FROM public.catalogo_sync
        WHERE empresa = $1 ORDER BY id DESC LIMIT 1`, [empresa]
    ).catch(() => ({ rows: [] as any[] })),
  ]);
  const w = wa.rows[0];
  const s = sync.rows[0];
  return {
    whatsapp: w ? { conectado: w.estado === "conectado", numero: w.display_phone, nombre: w.verified_name } : null,
    catalogo: { productos: cat.rows[0]?.n ?? 0, ultimaSync: s ? { ok: s.ok, filas: s.filas, mensaje: s.mensaje, fecha: s.fecha } : null },
  };
}

// ---------------------------------------------------------------- validación
const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
const limpio = <T extends Record<string, unknown>>(o: T) => {
  Object.keys(o).forEach((k) => (o[k] === undefined || o[k] === "") && delete o[k]);
  return Object.keys(o).length ? o : undefined;
};
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function regexValida(s: string) {
  try { new RegExp(s, "i"); return true; } catch { return false; }
}

// Extrae el ID de una planilla desde su URL completa o lo acepta tal cual.
export function idPlanilla(v: string) {
  const m = v.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : v.trim();
}

/** Valida y normaliza lo que manda la pantalla. Conserva las claves que la pantalla no maneja. */
export function validarFicha(entrada: any, anterior: FichaAgente): { ficha?: FichaAgente; error?: string } {
  if (!entrada || typeof entrada !== "object") return { error: "Ficha inválida" };
  const f: FichaAgente = { ...anterior }; // conserva claves desconocidas

  const n = entrada.negocio ?? {};
  f.negocio = limpio({
    descripcion: txt(n.descripcion, 2000), horario: txt(n.horario, 300), direccion: txt(n.direccion, 300),
    despacho: txt(n.despacho, 500), pagos: txt(n.pagos, 300), pedido_minimo: txt(n.pedido_minimo, 200),
    politicas: txt(n.politicas, 1000), no_prometer: txt(n.no_prometer, 500),
  });
  if (!f.negocio) delete f.negocio;

  const t = entrada.tono ?? {};
  if (t.trato && t.trato !== "tu" && t.trato !== "usted") return { error: "Trato inválido" };
  f.tono = limpio({ texto: txt(t.texto, 6000), trato: t.trato || undefined, emojis: txt(t.emojis, 40), saludo: txt(t.saludo, 400) });
  if (!f.tono) delete f.tono;

  const c = entrada.catalogo ?? {};
  const sinonimos = Array.isArray(c.sinonimos)
    ? c.sinonimos.map((s: any) => ({ dice: txt(s?.dice, 80) ?? "", buscar: txt(s?.buscar, 80) ?? "" })).filter((s: any) => s.dice && s.buscar).slice(0, 50)
    : [];
  f.catalogo = limpio({
    texto: txt(c.texto, 12000), categorias_menu: txt(c.categorias_menu, 300), unidad: txt(c.unidad, 80),
    disponibilidad: txt(c.disponibilidad, 500), sinonimos: sinonimos.length ? sinonimos : undefined,
  });
  if (!f.catalogo) delete f.catalogo;

  const esc = txt(entrada.escalamiento, 1500);
  if (esc) f.escalamiento = esc; else delete f.escalamiento;

  const faq = Array.isArray(entrada.faq)
    ? entrada.faq.map((x: any) => ({ p: txt(x?.p, 300) ?? "", r: txt(x?.r, 1000) ?? "" })).filter((x: any) => x.p && x.r).slice(0, 40)
    : [];
  if (faq.length) f.faq = faq; else delete f.faq;

  const i = entrada.interes ?? {};
  const cats = Array.isArray(i.categorias)
    ? i.categorias.map((x: any) => ({ nombre: txt(x?.nombre, 60) ?? "", regex: txt(x?.regex, 500) ?? "" })).filter((x: any) => x.nombre && x.regex).slice(0, 20)
    : [];
  for (const x of cats) if (!regexValida(x.regex)) return { error: `Palabras clave inválidas en la categoría "${x.nombre}"` };
  const senales = txt(i.senales, 1000);
  if (senales && !regexValida(senales)) return { error: "Señales de interés inválidas" };
  f.interes = limpio({ categorias: cats.length ? cats : undefined, senales });
  if (!f.interes) delete f.interes;

  const m = entrada.menu ?? {};
  const botones = (arr: any) =>
    Array.isArray(arr)
      ? arr.map((b: any) => ({ id: (txt(b?.id, 40) ?? "").replace(/[^a-z0-9_]/gi, "_").toLowerCase(), title: txt(b?.title, 20) ?? "" }))
          .filter((b: Boton) => b.id && b.title).slice(0, 3)
      : [];
  const bo = botones(m.botones_owner), bc = botones(m.botones_cliente);
  f.menu = limpio({
    texto_owner: txt(m.texto_owner, 1000), texto_cliente: txt(m.texto_cliente, 1000),
    botones_owner: bo.length ? bo : undefined, botones_cliente: bc.length ? bc : undefined,
  });
  if (!f.menu) delete f.menu;

  const a = entrada.agenda ?? {};
  if (a.hora_inicio && !HORA.test(a.hora_inicio)) return { error: "Hora de inicio inválida (HH:MM)" };
  if (a.hora_fin && !HORA.test(a.hora_fin)) return { error: "Hora de término inválida (HH:MM)" };
  if (a.hora_inicio && a.hora_fin && a.hora_inicio >= a.hora_fin) return { error: "La hora de inicio debe ser anterior a la de término" };
  if (a.correo_negocio && !CORREO.test(String(a.correo_negocio).trim())) return { error: "Correo del negocio inválido" };
  const dias: number[] = Array.isArray(a.dias)
    ? (a.dias.map(Number) as number[]).filter((d, i, arr) => Number.isInteger(d) && d >= 0 && d <= 6 && arr.indexOf(d) === i).sort()
    : [];
  const dur = Number(a.duracion_min), ant = Number(a.anticipacion_horas);
  f.agenda = {
    activa: a.activa !== false,
    tipo: txt(a.tipo, 40) || "reunión",
    duracion_min: Number.isFinite(dur) && dur >= 10 && dur <= 480 ? Math.round(dur) : 60,
    pide_correo: a.pide_correo !== false,
    calendar_id: txt(a.calendar_id, 200) || "primary",
    ...(dias.length ? { dias } : {}),
    ...(a.hora_inicio ? { hora_inicio: a.hora_inicio } : {}),
    ...(a.hora_fin ? { hora_fin: a.hora_fin } : {}),
    ...(Number.isFinite(ant) && ant > 0 ? { anticipacion_horas: Math.min(Math.round(ant), 720) } : {}),
    ...(a.correo_negocio ? { correo_negocio: String(a.correo_negocio).trim() } : {}),
    ...(txt(a.lugar, 300) ? { lugar: txt(a.lugar, 300) } : {}),
    ...(txt(a.mensaje_confirmacion, 500) ? { mensaje_confirmacion: txt(a.mensaje_confirmacion, 500) } : {}),
  };

  const fc = entrada.fuentes?.catalogo ?? {};
  const tipo = fc.tipo;
  if (!["erp_supabase", "google_sheets", "tabla_cadabra"].includes(tipo)) return { error: "Fuente de catálogo inválida" };
  if (tipo === "google_sheets") {
    const id = idPlanilla(String(fc.sheet_id ?? ""));
    if (!/^[a-zA-Z0-9_-]{20,}$/.test(id)) return { error: "Pega el enlace o el ID de la planilla de Google Sheets" };
    const fr = Number(fc.frecuencia_horas);
    const gid = String(fc.gid ?? "").trim();
    f.fuentes = { ...(f.fuentes ?? {}), catalogo: {
      tipo, sheet_id: id, frecuencia_horas: Number.isFinite(fr) && fr >= 1 && fr <= 168 ? Math.round(fr) : 6,
      ...(gid && gid !== "0" ? { gid } : {}),
    } };
  } else {
    f.fuentes = { ...(f.fuentes ?? {}), catalogo: { tipo } };
  }

  // Marca explícita: el admin puede dejar la empresa "pendiente" aunque tenga descripción.
  if (entrada.configurado === false) f.configurado = false; else delete f.configurado;
  return { ficha: f };
}

export async function guardarFicha(empresa: number, nombreEmpresa: string, nombreAsistente: string, ficha: FichaAgente) {
  const nombre = nombreAsistente.trim().slice(0, 40) || "Sofía";
  await adminPool.query(
    `INSERT INTO public.agente_empresas_config (empresa, nombre_asistente, config, actualizado_en)
     VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (empresa) DO UPDATE SET nombre_asistente = EXCLUDED.nombre_asistente,
       -- Las etapas del tablero las edita el cliente en Oportunidades (lib/etapas.ts): la ficha no las pisa.
       config = CASE WHEN agente_empresas_config.config ? 'etapas'
                     THEN EXCLUDED.config || jsonb_build_object('etapas', agente_empresas_config.config->'etapas')
                     ELSE EXCLUDED.config - 'etapas' END,
       actualizado_en = now()`,
    [empresa, nombre, JSON.stringify(ficha)]
  );
  // n8n lee el nombre desde la línea de WhatsApp: se mantiene sincronizado.
  await adminPool.query(
    `UPDATE public.agente_lineas_whatsapp SET nombre_asistente = $2, nombre_empresa = $3 WHERE empresa = $1`,
    [empresa, nombre, nombreEmpresa]
  );
}

// Pide a n8n sincronizar ya el catálogo de la empresa (workflow "Sync catálogo").
export async function sincronizarCatalogo(empresa: number): Promise<{ ok: boolean; mensaje: string; filas?: number }> {
  const base = process.env.N8N_SYNC_CATALOGO_URL
    || (process.env.N8N_ENVIAR_WEBHOOK_URL ? new URL(process.env.N8N_ENVIAR_WEBHOOK_URL).origin + "/webhook/sync-catalogo" : "");
  if (!base) return { ok: false, mensaje: "Falta configurar la URL de n8n en el servidor" };
  const res = await fetch(base, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa }), cache: "no-store",
  }).catch(() => null);
  if (!res) return { ok: false, mensaje: "No se pudo contactar a n8n" };
  const data = await res.json().catch(() => null);
  const r = Array.isArray(data) ? data[0] : data;
  if (!r || r.empresa === undefined) return { ok: false, mensaje: "Esta empresa no tiene una planilla configurada como fuente" };
  return { ok: !!r.ok, mensaje: r.ok ? `Sincronizado: ${r.filas} productos (${r.mensaje})` : String(r.mensaje || "Error"), filas: r.filas };
}
