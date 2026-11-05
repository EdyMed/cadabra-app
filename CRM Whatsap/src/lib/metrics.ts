import { q, tbl } from "@/lib/db";

// Todas las consultas filtran por `empresa` (aislamiento multi-tenant).
// Fuente: crm_leads y contador_conversaciones en el Postgres de NocoDB.

export type Kpis = {
  conversaciones: number;
  conversacionesMesAnterior: number;
  clientes: number;
  resueltasIA: number;
  derivadas: number;
  cotizaciones: number;
  citas: number;
  oportunidades: number;
};

export type EmbudoRow = { estado: string; cantidad: number };
export type VendedorRow = { vendedor: string; leads: number; cotizaciones: number };
export type ActividadRow = { dia: string; cantidad: number };

export const ESTADOS_ORDEN = [
  "Nuevo Lead",
  "En Conversación",
  "Cotización Enviada",
  "Primer Pedido",
  "Cliente Activo",
  "Cliente Recurrente",
  "Requiere Vendedor",
  "Sin Respuesta",
  "Inactivo",
];

export async function getKpis(empresa: number): Promise<Kpis> {
  // Conversaciones del mes actual y del anterior (para la comparación del resumen)
  const conv = await q<{ usadas: number; mes_anterior: number }>(
    `SELECT
        COALESCE(SUM(usadas) FILTER (WHERE mes = to_char(CURRENT_DATE,'YYYY-MM')),0)::int AS usadas,
        COALESCE(SUM(usadas) FILTER (WHERE mes = to_char(CURRENT_DATE - INTERVAL '1 month','YYYY-MM')),0)::int AS mes_anterior
       FROM ${tbl("contador_conversaciones")}
      WHERE empresa = $1`,
    [empresa]
  );

  // Agregados sobre leads
  const rows = await q<{
    total: number;
    resueltas: number;
    derivadas: number;
    cotizaciones: number;
    citas: number;
    oportunidades: number;
  }>(
    `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE bot_activo IS DISTINCT FROM false AND estado_crm <> 'Requiere Vendedor')::int AS resueltas,
        COUNT(*) FILTER (WHERE bot_activo = false OR estado_crm = 'Requiere Vendedor')::int AS derivadas,
        COUNT(*) FILTER (WHERE estado_crm = 'Cotización Enviada')::int AS cotizaciones,
        COUNT(*) FILTER (WHERE estado_agendamiento IS NOT NULL AND estado_agendamiento <> '')::int AS citas,
        COUNT(*) FILTER (WHERE estado_crm IN ('Nuevo Lead','En Conversación','Cotización Enviada'))::int AS oportunidades
       FROM ${tbl("crm_leads")}
      WHERE empresa = $1`,
    [empresa]
  );
  const r = rows[0] ?? { total: 0, resueltas: 0, derivadas: 0, cotizaciones: 0, citas: 0, oportunidades: 0 };

  return {
    conversaciones: conv[0]?.usadas ?? 0,
    conversacionesMesAnterior: conv[0]?.mes_anterior ?? 0,
    clientes: r.total,
    resueltasIA: r.resueltas,
    derivadas: r.derivadas,
    cotizaciones: r.cotizaciones,
    citas: r.citas,
    oportunidades: r.oportunidades,
  };
}

export async function getEmbudo(empresa: number): Promise<EmbudoRow[]> {
  const rows = await q<{ estado_crm: string; cantidad: number }>(
    `SELECT estado_crm, COUNT(*)::int AS cantidad
       FROM ${tbl("crm_leads")}
      WHERE empresa = $1
      GROUP BY estado_crm`,
    [empresa]
  );
  const map = new Map(rows.map((r) => [r.estado_crm, r.cantidad]));
  // Orden fijo del embudo; incluye estados con 0.
  return ESTADOS_ORDEN.filter((e) => map.has(e)).map((e) => ({
    estado: e,
    cantidad: map.get(e) ?? 0,
  }));
}

export async function getVendedores(empresa: number): Promise<VendedorRow[]> {
  const rows = await q<{ vendedor: string; leads: number; cotizaciones: number }>(
    `SELECT
        COALESCE(NULLIF(vendedor_asignado,''),'Sin asignar') AS vendedor,
        COUNT(*)::int AS leads,
        COUNT(*) FILTER (WHERE estado_crm = 'Cotización Enviada')::int AS cotizaciones
       FROM ${tbl("crm_leads")}
      WHERE empresa = $1
      GROUP BY 1
      ORDER BY leads DESC`,
    [empresa]
  );
  return rows;
}

export type AlertaLead = {
  nombre_negocio: string;
  nombre: string;
  phone: string;
  estado_crm: string;
  vendedor_asignado: string;
  dias: number;
};

// Columnas comunes de las alertas. `phone` es bigint en NocoDB → convertir a texto ANTES de comparar.
const ALERTA_COLS = `
  COALESCE(NULLIF(nombre_negocio,''),'—') AS nombre_negocio,
  COALESCE(NULLIF(nombre,''),'—') AS nombre,
  COALESCE(phone::text,'—') AS phone,
  estado_crm,
  COALESCE(NULLIF(vendedor_asignado,''),'Sin asignar') AS vendedor_asignado,
  COALESCE(CURRENT_DATE - updated_at::date, 0) AS dias`;

// Leads que requieren atención: sin respuesta o derivados a vendedor.
export async function getRequierenAtencion(empresa: number): Promise<AlertaLead[]> {
  return q<AlertaLead>(
    `SELECT ${ALERTA_COLS}
       FROM ${tbl("crm_leads")}
      WHERE empresa = $1 AND estado_crm IN ('Sin Respuesta','Requiere Vendedor')
      ORDER BY updated_at ASC`,
    [empresa]
  );
}

// Cotizaciones enviadas sin avance.
export async function getCotizacionesSinCierre(empresa: number): Promise<AlertaLead[]> {
  return q<AlertaLead>(
    `SELECT ${ALERTA_COLS}
       FROM ${tbl("crm_leads")}
      WHERE empresa = $1 AND estado_crm = 'Cotización Enviada'
      ORDER BY updated_at ASC`,
    [empresa]
  );
}

// Clientes activos/recurrentes sin contacto reciente (>30 días).
export async function getClientesFrios(empresa: number): Promise<AlertaLead[]> {
  return q<AlertaLead>(
    `SELECT ${ALERTA_COLS}
       FROM ${tbl("crm_leads")}
      WHERE empresa = $1
        AND estado_crm IN ('Cliente Activo','Cliente Recurrente')
        AND updated_at < CURRENT_DATE - INTERVAL '30 days'
      ORDER BY updated_at ASC`,
    [empresa]
  );
}

export type LeadRow = {
  nombre_negocio: string;
  nombre: string;
  phone: string;
  comuna: string;
  producto_interes: string;
  estado_crm: string;
  vendedor_asignado: string;
  condicion_pago: string;
};

// Todos los leads de la empresa (para la tabla de Clientes).
export async function getLeads(empresa: number): Promise<LeadRow[]> {
  return q<LeadRow>(
    `SELECT
        COALESCE(NULLIF(nombre_negocio,''),'—') AS nombre_negocio,
        COALESCE(NULLIF(nombre,''),'—') AS nombre,
        COALESCE(phone::text,'—') AS phone,
        COALESCE(NULLIF(comuna,''),'—') AS comuna,
        COALESCE(NULLIF(producto_interes,''),'—') AS producto_interes,
        COALESCE(NULLIF(estado_crm,''),'—') AS estado_crm,
        COALESCE(NULLIF(vendedor_asignado,''),'Sin asignar') AS vendedor_asignado,
        COALESCE(NULLIF(condicion_pago,''),'—') AS condicion_pago
       FROM ${tbl("crm_leads")}
      WHERE empresa = $1
      ORDER BY updated_at DESC NULLS LAST, id DESC`,
    [empresa]
  );
}

export type OportunidadRow = {
  id: number;
  nombre_negocio: string;
  nombre: string;
  phone: string;
  producto_interes: string;
  estado_crm: string;
  vendedor_asignado: string;
  updated_at: string;
};

// Leads agrupables por estado del embudo (para el tablero de Oportunidades).
export async function getOportunidades(empresa: number): Promise<OportunidadRow[]> {
  return q<OportunidadRow>(
    `SELECT
        id,
        COALESCE(NULLIF(nombre_negocio,''),'—') AS nombre_negocio,
        COALESCE(NULLIF(nombre,''),'—') AS nombre,
        COALESCE(phone::text,'—') AS phone,
        COALESCE(NULLIF(producto_interes,''),'—') AS producto_interes,
        COALESCE(NULLIF(estado_crm,''),'Nuevo Lead') AS estado_crm,
        COALESCE(NULLIF(vendedor_asignado,''),'Sin asignar') AS vendedor_asignado,
        COALESCE(updated_at::text, created_at::text) AS updated_at
       FROM ${tbl("crm_leads")}
      WHERE empresa = $1
      ORDER BY updated_at DESC NULLS LAST, id DESC`,
    [empresa]
  );
}

export type CitaRow = {
  id: number;
  nombre_negocio: string;
  nombre: string;
  phone: string;
  vendedor_asignado: string;
  estado_agendamiento: string;
  fecha_agendamiento: string | null;
  hora_cita: string | null;
};

// Leads con seguimiento de agenda (estado_agendamiento no vacío), para el menú Agenda.
// Confirmadas con fecha primero (más próxima primero), luego pendientes sin fecha.
export async function getCitas(empresa: number): Promise<CitaRow[]> {
  return q<CitaRow>(
    `SELECT
        id,
        COALESCE(NULLIF(nombre_negocio,''),'—') AS nombre_negocio,
        COALESCE(NULLIF(nombre,''),'—') AS nombre,
        COALESCE(phone::text,'—') AS phone,
        COALESCE(NULLIF(vendedor_asignado,''),'Sin asignar') AS vendedor_asignado,
        estado_agendamiento,
        fecha_agendamiento::text AS fecha_agendamiento,
        hora_cita::text AS hora_cita
       FROM ${tbl("crm_leads")}
      WHERE empresa = $1 AND NULLIF(estado_agendamiento,'') IS NOT NULL
      ORDER BY fecha_agendamiento ASC NULLS LAST, hora_cita ASC NULLS LAST, id DESC`,
    [empresa]
  );
}

export type ConversacionRow = {
  phone_number: string;
  ultimo_mensaje: string;
  ultimo_rol: string;
  ultima_fecha: string;
  total_mensajes: number;
  nombre_negocio: string | null;
  nombre: string | null;
  estado_crm: string | null;
  bot_activo: boolean | null;
};

// Un hilo por número de teléfono con su último mensaje (para el menú Conversaciones).
// conversation_history vive en public (memoria del agente), no en crm — join por phone/contact_id.
// estado_crm/bot_activo permiten marcar en la lista qué hilos requieren atención humana.
export async function getConversaciones(empresa: number): Promise<ConversacionRow[]> {
  return q<ConversacionRow>(
    `SELECT DISTINCT ON (h.phone_number)
        h.phone_number,
        h.content AS ultimo_mensaje,
        h.role AS ultimo_rol,
        h.created_at::text AS ultima_fecha,
        COUNT(*) OVER (PARTITION BY h.phone_number) AS total_mensajes,
        l.nombre_negocio,
        l.nombre,
        l.estado_crm,
        l.bot_activo
       FROM public.conversation_history h
       LEFT JOIN ${tbl("crm_leads")} l
         ON l.contact_id::text = h.phone_number AND l.empresa = h.empresa
      WHERE h.empresa = $1
      ORDER BY h.phone_number, h.created_at DESC`,
    [empresa]
  );
}

export type MensajeRow = {
  role: string;
  content: string;
  created_at: string;
};

// Hilo completo de una conversación (por número de teléfono).
export async function getMensajes(empresa: number, phoneNumber: string): Promise<MensajeRow[]> {
  return q<MensajeRow>(
    `SELECT role, content, created_at::text AS created_at
       FROM public.conversation_history
      WHERE empresa = $1 AND phone_number = $2
      ORDER BY created_at ASC`,
    [empresa, phoneNumber]
  );
}

export type VendedorLista = {
  id: number;
  nombre: string;
  whatsapp: string;
  activo: boolean;
};

// Lista completa de vendedores (para el CRUD de Configuración). Distinto de getVendedores
// (esa es agregada por conteo de leads, para el dashboard).
export async function getVendedoresLista(empresa: number): Promise<VendedorLista[]> {
  return q<VendedorLista>(
    `SELECT id, COALESCE(nombre,'') AS nombre, COALESCE(whatsapp,'') AS whatsapp, COALESCE(activo,true) AS activo
       FROM ${tbl("vendedores")}
      WHERE empresa = $1
      ORDER BY nombre`,
    [empresa]
  );
}

export type ConsumoPlan = {
  plan: string;
  usadas: number;
  limite: number;
  pct: number;
};

// Consumo del plan del mes actual (gauge "Consumo Plan" del dashboard).
export async function getConsumoPlan(empresa: number, mes?: string): Promise<ConsumoPlan | null> {
  const rows = await q<{ plan: string; usadas: number; limite: number }>(
    `SELECT plan, usadas, limite
       FROM ${tbl("contador_conversaciones")}
      WHERE empresa = $1 AND mes = COALESCE($2, to_char(now() AT TIME ZONE 'America/Santiago','YYYY-MM'))`,
    [empresa, mes ?? null]
  );
  const r = rows[0];
  if (!r) return null;
  const pct = r.limite > 0 ? Math.min(100, Math.round((r.usadas / r.limite) * 100)) : 0;
  return { plan: r.plan, usadas: r.usadas, limite: r.limite, pct };
}

// Métricas de valor del agente en el mes en curso (hora Chile). Las calcula la función
// crm.metricas_valor (sql/10_metricas_valor.sql), la misma que usará el informe mensual.
export type ValorAgente = {
  conversaciones: number;
  resueltas_ia: number;
  con_humano: number;
  fuera_horario: number;
  mensajes_clientes: number;
  horas_liberadas: number;
  minutos_por_conversacion: number;
  respuesta_mediana_seg: number | null;
  respuesta_bajo_1min_pct: number | null;
  respuestas_medidas: number;
  derivaciones: number;
  derivaciones_tomadas: number;
  toma_vendedor_mediana_min: number | null;
  medicion_desde: string | null;
  horario: { dias: number[]; inicio: string; fin: string };
};

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// Mes actual en hora Chile, formato 'YYYY-MM'.
export function mesActual(): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit" })
    .formatToParts(new Date());
  return `${p.find((x) => x.type === "year")!.value}-${p.find((x) => x.type === "month")!.value}`;
}

export function mesAnterior(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function mesSiguiente(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function nombreMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const n = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("es-CL", { month: "long", year: "numeric", timeZone: "UTC" });
  return n.charAt(0).toUpperCase() + n.slice(1);
}

// Normaliza el ?mes= de la URL: si no es válido o es futuro, usa el mes actual.
export function mesValido(mes: string | string[] | undefined): string {
  const actual = mesActual();
  return typeof mes === "string" && MES_RE.test(mes) && mes <= actual ? mes : actual;
}

// Métricas de un mes calendario (hora Chile). Si es el mes en curso, corta en "ahora".
export async function getValorAgente(empresa: number, mes: string = mesActual()): Promise<ValorAgente | null> {
  if (!MES_RE.test(mes)) return null;
  const rows = await q<{ m: ValorAgente }>(
    `SELECT crm.metricas_valor(
        $1,
        ($2 || '-01')::timestamp AT TIME ZONE 'America/Santiago',
        LEAST((($2 || '-01')::date + INTERVAL '1 month')::timestamp AT TIME ZONE 'America/Santiago', now())) AS m`,
    [empresa, mes]
  );
  return rows[0]?.m ?? null;
}

// Mensajes del agente (contador del plan) y leads nuevos del mes y del mes anterior.
export async function getResumenMes(empresa: number, mes: string) {
  if (!MES_RE.test(mes)) return { mensajes: 0, mensajesPrev: 0, leadsNuevos: 0, leadsNuevosPrev: 0 };
  const prev = mesAnterior(mes);
  const rows = await q<{ mensajes: number; mensajes_prev: number; leads: number; leads_prev: number }>(
    `SELECT
        (SELECT COALESCE(SUM(usadas),0)::int FROM ${tbl("contador_conversaciones")} WHERE empresa = $1 AND mes = $2) AS mensajes,
        (SELECT COALESCE(SUM(usadas),0)::int FROM ${tbl("contador_conversaciones")} WHERE empresa = $1 AND mes = $3) AS mensajes_prev,
        (SELECT COUNT(*)::int FROM ${tbl("crm_leads")}
          WHERE empresa = $1 AND to_char(created_at AT TIME ZONE 'America/Santiago','YYYY-MM') = $2) AS leads,
        (SELECT COUNT(*)::int FROM ${tbl("crm_leads")}
          WHERE empresa = $1 AND to_char(created_at AT TIME ZONE 'America/Santiago','YYYY-MM') = $3) AS leads_prev`,
    [empresa, mes, prev]
  );
  const r = rows[0];
  return {
    mensajes: r?.mensajes ?? 0,
    mensajesPrev: r?.mensajes_prev ?? 0,
    leadsNuevos: r?.leads ?? 0,
    leadsNuevosPrev: r?.leads_prev ?? 0,
  };
}

// Primer mes con conversaciones de la empresa (límite del selector hacia atrás).
export async function getPrimerMes(empresa: number): Promise<string> {
  const rows = await q<{ mes: string | null }>(
    `SELECT to_char(min(created_at) AT TIME ZONE 'America/Santiago', 'YYYY-MM') AS mes
       FROM public.conversation_history WHERE empresa = $1`,
    [empresa]
  );
  return rows[0]?.mes ?? mesActual();
}

export async function getActividad(empresa: number): Promise<ActividadRow[]> {
  // Leads creados por día en los últimos 7 días.
  const rows = await q<{ dia: string; cantidad: number }>(
    `SELECT to_char(d::date,'Dy') AS dia, COALESCE(c.cantidad,0)::int AS cantidad
       FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') d
       LEFT JOIN (
         SELECT created_at::date AS fecha, COUNT(*) AS cantidad
           FROM ${tbl("crm_leads")}
          WHERE empresa = $1 AND created_at >= CURRENT_DATE - INTERVAL '6 days'
          GROUP BY 1
       ) c ON c.fecha = d::date
      ORDER BY d`,
    [empresa]
  );
  return rows;
}
