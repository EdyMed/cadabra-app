// Fuente única de verdad del gating por plan (Conversa/Convierte/Controla).
//
// Rediseño 2026-09-28: los planes se diferencian por VOLUMEN (mensajes/mes y nº
// de vendedores), no por módulos. Antes Conversa tenía el CRM recortado y el
// panel le quedaba vacío — un benchmark de competencia (Chatfuel, Wati, Cliengo,
// ManyChat) mostró que el mercado pyme escala por cuota, no por funciones, y que
// ninguno recorta la derivación a vendedor en el plan de entrada.
//
// Controla ya no se diferencia acá: lo que agrega son conectores a los sistemas
// del cliente (catálogo/stock real, multi-sucursal), que son trabajo a medida
// cotizado por horas, no un módulo del panel que se prenda o apague.
//
// Un admin (tenant.isAdmin) siempre ve todo — no es un cliente, es Cadabra
// administrando la plataforma.

export type Plan = "Conversa" | "Convierte" | "Controla";

export type Modulo =
  | "dashboard_completo" // Actividad, Embudo, Alertas, Vendedores
  | "leads"
  | "oportunidades"
  | "agenda"
  | "vendedores_config"; // CRUD de Vendedores en Configuración

const TODOS: Plan[] = ["Conversa", "Convierte", "Controla"];

const PLANES_CON_ACCESO: Record<Modulo, Plan[]> = {
  dashboard_completo: TODOS,
  leads: TODOS,
  oportunidades: TODOS,
  agenda: TODOS,
  vendedores_config: TODOS,
};

// Tope de vendedores ACTIVOS por plan — junto al límite de mensajes, es el
// diferenciador real entre planes desde el rediseño 2026-09-28. Se cuentan solo
// los activos: desactivar a alguien libera su cupo (si contara filas, un cliente
// que rota vendedores quedaría bloqueado sin entender por qué).
const TOPE_VENDEDORES: Record<Plan, number> = {
  Conversa: 2,
  Convierte: 6,
  Controla: Infinity,
};

export function topeVendedores(planActual: string | null): number {
  return TOPE_VENDEDORES[planActual as Plan] ?? TOPE_VENDEDORES.Conversa;
}

export function tienePlan(planActual: string | null, modulo: Modulo): boolean {
  if (!planActual) return false; // sin plan asignado -> tratar como el más restrictivo
  return PLANES_CON_ACCESO[modulo].includes(planActual as Plan);
}

// true si el tenant puede ver el módulo: admin siempre, o el plan lo incluye.
export function puedeVer(tenant: { isAdmin: boolean; plan: string | null }, modulo: Modulo): boolean {
  return tenant.isAdmin || tienePlan(tenant.plan, modulo);
}
