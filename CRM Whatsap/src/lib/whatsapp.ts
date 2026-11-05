import type { Tenant } from "@/lib/tenant";
import { getLineaWhatsapp } from "@/lib/admin";

// Cliente mínimo de la Graph API de WhatsApp (Cloud API), solo server-side.
// Cada empresa usa la WABA que conectó con "Conectar WhatsApp" (Embedded Signup,
// guardada en BD con su token cifrado). Si no conectó ninguna, cae a la WABA de
// Cadabra configurada por entorno (META_WABA_ID / META_WA_TOKEN).

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v23.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export class MetaError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function graph<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Meta explica el motivo en error_user_msg (en el idioma de la cuenta) o en message.
    const err = data?.error;
    const msg = err?.error_user_msg || err?.error_user_title || err?.message || "Error de la API de Meta";
    throw new MetaError(msg, res.status);
  }
  return data as T;
}

export type WabaConfig = { wabaId: string; token: string };

// Cache corto de los números de la WABA: se consulta en cada request de plantillas.
let cacheNumeros: { wabaId: string; ids: Set<string>; vence: number } | null = null;

async function numerosDeWaba(cfg: WabaConfig): Promise<Set<string>> {
  if (cacheNumeros && cacheNumeros.wabaId === cfg.wabaId && cacheNumeros.vence > Date.now()) {
    return cacheNumeros.ids;
  }
  const data = await graph<{ data: { id: string }[] }>(
    `/${cfg.wabaId}/phone_numbers?fields=id&limit=100`,
    cfg.token
  );
  const ids = new Set(data.data.map((n) => n.id));
  cacheNumeros = { wabaId: cfg.wabaId, ids, vence: Date.now() + 5 * 60_000 };
  return ids;
}

/**
 * Devuelve la WABA que puede gestionar este tenant, o null si no tiene.
 * Un cliente solo accede si el número de SU empresa pertenece a la WABA; así
 * ninguna empresa ve ni crea plantillas en la cuenta de otra.
 */
export async function getWabaDeTenant(tenant: Tenant): Promise<WabaConfig | null> {
  // 1) La WABA propia que la empresa conectó con Embedded Signup.
  try {
    // Import dinámico: conexionWhatsapp importa este módulo (evita el ciclo).
    const { getTokenCuenta } = await import("@/lib/conexionWhatsapp");
    const propia = await getTokenCuenta(tenant.empresa);
    if (propia) return propia;
  } catch {
    // Tabla aún no creada o BD caída: se sigue con la WABA de Cadabra.
  }

  // 2) La WABA de Cadabra (entorno), para el admin o un número que viva en ella.
  const wabaId = process.env.META_WABA_ID;
  const token = process.env.META_WA_TOKEN;
  if (!wabaId || !token) return null;
  const cfg = { wabaId, token };

  if (tenant.isAdmin) return cfg;

  const linea = await getLineaWhatsapp(tenant.empresa);
  if (!linea?.phoneNumberId) return null;
  const ids = await numerosDeWaba(cfg);
  return ids.has(String(linea.phoneNumberId)) ? cfg : null;
}

// ---- Plantillas -------------------------------------------------------------

export type ComponentePlantilla = {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: string;
  text?: string;
};

export type Plantilla = {
  id: string;
  name: string;
  status: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED" | string;
  category: string;
  language: string;
  components: ComponentePlantilla[];
  rejected_reason?: string;
};

export async function listarPlantillas(cfg: WabaConfig): Promise<Plantilla[]> {
  const data = await graph<{ data: Plantilla[] }>(
    `/${cfg.wabaId}/message_templates?fields=id,name,status,category,language,components,rejected_reason&limit=100`,
    cfg.token
  );
  return data.data;
}

export type NuevaPlantilla = {
  name: string;
  category: "UTILITY" | "MARKETING";
  language: string;
  header?: string;
  body: string;
  bodyEjemplos: string[];
  footer?: string;
};

export async function crearPlantilla(cfg: WabaConfig, p: NuevaPlantilla) {
  const components: Record<string, unknown>[] = [];
  if (p.header) components.push({ type: "HEADER", format: "TEXT", text: p.header });
  components.push({
    type: "BODY",
    text: p.body,
    // Meta exige un ejemplo por variable {{n}} para revisar la plantilla.
    ...(p.bodyEjemplos.length ? { example: { body_text: [p.bodyEjemplos] } } : {}),
  });
  if (p.footer) components.push({ type: "FOOTER", text: p.footer });

  return graph<{ id: string; status: string; category: string }>(
    `/${cfg.wabaId}/message_templates`,
    cfg.token,
    {
      method: "POST",
      body: JSON.stringify({ name: p.name, category: p.category, language: p.language, components }),
    }
  );
}

// Variables {{1}}, {{2}}... en orden de aparición, sin repetir.
export function variablesDe(texto: string): number[] {
  const nums = Array.from(texto.matchAll(/\{\{\s*(\d+)\s*\}\}/g), (m) => Number(m[1]));
  return Array.from(new Set(nums));
}
