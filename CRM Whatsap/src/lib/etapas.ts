import { adminPool, writePool, q, tbl } from "@/lib/db";
import { FIJAS as ESTADOS_ORDEN, MAX_PROPIAS, PROTEGIDAS, COLORES, type Etapa } from "@/lib/etapasComun";

export type { Etapa } from "@/lib/etapasComun";

// Etapas del tablero de Oportunidades por empresa (tipos y constantes en lib/etapasComun.ts).
//
// - FIJAS: las 9 del sistema. No se renombran ni se borran: de sus nombres dependen las métricas,
//   la derivación al vendedor ("Requiere Vendedor" corta el bot) y el agente. Se pueden ocultar,
//   salvo las PROTEGIDAS.
// - PROPIAS: hasta MAX_PROPIAS que define el cliente (nombre, color, posición y, opcional, el criterio
//   para que el agente mueva leads ahí). En las métricas cuentan como "oportunidad en proceso".
//
// Se guardan en la ficha de la empresa: public.agente_empresas_config.config -> 'etapas'
// (la plataforma y n8n ya leen esa ficha en vivo). Sin la clave, el tablero usa las 9 fijas en su orden.

const fijasPorDefecto = (): Etapa[] => ESTADOS_ORDEN.map((nombre) => ({ nombre, fija: true }));

/** Normaliza lo guardado: siempre trae las 9 fijas (una vez) y como máximo MAX_PROPIAS propias. */
export function normalizar(guardadas: unknown): Etapa[] {
  if (!Array.isArray(guardadas)) return fijasPorDefecto();
  const vistas = new Set<string>();
  const salida: Etapa[] = [];
  let propias = 0;
  for (const e of guardadas as Partial<Etapa>[]) {
    const nombre = typeof e?.nombre === "string" ? e.nombre.trim() : "";
    if (!nombre || vistas.has(nombre.toLowerCase())) continue;
    if (ESTADOS_ORDEN.includes(nombre)) {
      vistas.add(nombre.toLowerCase());
      salida.push({ nombre, fija: true, ...(e.oculta && !PROTEGIDAS.includes(nombre) ? { oculta: true } : {}) });
    } else if (e?.fija === false && propias < MAX_PROPIAS) {
      vistas.add(nombre.toLowerCase());
      propias++;
      salida.push({
        nombre, fija: false, id: typeof e.id === "string" && e.id ? e.id : `p${propias}`,
        color: COLORES.includes(String(e.color)) ? String(e.color) : COLORES[propias % COLORES.length],
        ...(e.oculta ? { oculta: true } : {}),
        ...(typeof e.criterio === "string" && e.criterio.trim() ? { criterio: e.criterio.trim().slice(0, 300) } : {}),
      });
    }
  }
  // Fijas que falten (ficha vieja o editada a mano) se insertan en su lugar del orden original.
  ESTADOS_ORDEN.forEach((nombre, i) => {
    if (vistas.has(nombre.toLowerCase())) return;
    const anterior = ESTADOS_ORDEN.slice(0, i).reverse().find((n) => salida.some((s) => s.nombre === n));
    const pos = anterior ? salida.findIndex((s) => s.nombre === anterior) + 1 : 0;
    salida.splice(pos, 0, { nombre, fija: true });
  });
  return salida;
}

export async function getEtapas(empresa: number): Promise<Etapa[]> {
  const r = await adminPool.query(
    `SELECT config->'etapas' AS etapas FROM public.agente_empresas_config WHERE empresa = $1`, [empresa]
  );
  return normalizar(r.rows[0]?.etapas);
}

/** Valida lo que manda el editor. Devuelve el texto del error para mostrarlo tal cual. */
export function validar(entrada: unknown): { etapas: Etapa[] } | { error: string } {
  if (!Array.isArray(entrada)) return { error: "Formato inválido" };
  const propias = entrada.filter((e) => e?.fija === false);
  if (propias.length > MAX_PROPIAS) return { error: `Puedes crear hasta ${MAX_PROPIAS} etapas propias` };
  const nombres = new Set<string>();
  for (const e of entrada) {
    const nombre = typeof e?.nombre === "string" ? e.nombre.trim() : "";
    if (!nombre) return { error: "Toda etapa necesita un nombre" };
    if (nombre.length > 40) return { error: `"${nombre.slice(0, 20)}…" es muy largo (máximo 40 caracteres)` };
    if (e.fija === false && ESTADOS_ORDEN.some((f) => f.toLowerCase() === nombre.toLowerCase())) {
      return { error: `"${nombre}" ya es una etapa del sistema` };
    }
    if (nombres.has(nombre.toLowerCase())) return { error: `La etapa "${nombre}" está repetida` };
    nombres.add(nombre.toLowerCase());
  }
  return { etapas: normalizar(entrada) };
}

/**
 * Guarda las etapas y mueve los leads de las propias que cambiaron de nombre.
 * Una etapa propia con leads no se puede borrar: primero hay que mover esos leads.
 */
export async function guardarEtapas(empresa: number, nuevas: Etapa[]): Promise<{ error?: string }> {
  const actuales = await getEtapas(empresa);
  const propiasNuevas = new Map(nuevas.filter((e) => !e.fija).map((e) => [e.id, e.nombre]));
  const renombres: [string, string][] = [];
  const borradas: string[] = [];
  for (const e of actuales.filter((a) => !a.fija)) {
    const nombre = propiasNuevas.get(e.id);
    if (nombre === undefined) borradas.push(e.nombre);
    else if (nombre !== e.nombre) renombres.push([e.nombre, nombre]);
  }

  if (borradas.length) {
    const conLeads = await q<{ estado_crm: string; n: number }>(
      `SELECT estado_crm, count(*)::int AS n FROM ${tbl("crm_leads")}
        WHERE empresa = $1 AND estado_crm = ANY($2) GROUP BY estado_crm`,
      [empresa, borradas]
    );
    if (conLeads.length) {
      const { estado_crm, n } = conLeads[0];
      return { error: `"${estado_crm}" tiene ${n} lead${n === 1 ? "" : "s"}: muévelos a otra etapa antes de borrarla` };
    }
  }

  // La ficha existe para toda empresa con agente; si no, se crea solo con las etapas.
  await adminPool.query(
    `INSERT INTO public.agente_empresas_config (empresa, config, actualizado_en)
     VALUES ($1, jsonb_build_object('etapas', $2::jsonb), now())
     ON CONFLICT (empresa) DO UPDATE
       SET config = jsonb_set(COALESCE(agente_empresas_config.config, '{}'::jsonb), '{etapas}', $2::jsonb),
           actualizado_en = now()`,
    [empresa, JSON.stringify(nuevas)]
  );
  for (const [antes, despues] of renombres) {
    await writePool.query(
      `UPDATE ${tbl("crm_leads")} SET estado_crm = $1 WHERE empresa = $2 AND estado_crm = $3`, [despues, empresa, antes]
    );
  }
  return {};
}
