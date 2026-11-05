// Etiqueta de "temperatura" de un lead a partir del puntaje del clasificador IA (crm_leads.score).
// Caliente >= 70 · Tibio 40-69 · Frío < 40 · sin puntaje = "—".

export type NivelTemperatura = "caliente" | "tibio" | "frio" | "sin";

export function nivelTemperatura(score: number | null | undefined): NivelTemperatura {
  if (score == null) return "sin";
  if (score >= 70) return "caliente";
  if (score >= 40) return "tibio";
  return "frio";
}

const ESTILO: Record<NivelTemperatura, { txt: string; bg: string; fg: string }> = {
  caliente: { txt: "🔥 Caliente", bg: "var(--rojo-bg)", fg: "var(--rojo)" },
  tibio: { txt: "Tibio", bg: "var(--alerta-bg)", fg: "var(--alerta)" },
  frio: { txt: "Frío", bg: "var(--info-bg)", fg: "var(--info)" },
  sin: { txt: "—", bg: "transparent", fg: "var(--tinta-3)" },
};

export default function Temperatura({
  score,
  resumen,
  compacto = false,
}: {
  score: number | null | undefined;
  resumen?: string | null;
  compacto?: boolean;
}) {
  const n = nivelTemperatura(score);
  const e = ESTILO[n];
  if (n === "sin") return <span className="text-tinta-3 text-[12px]">—</span>;
  const titulo = `Puntaje ${score}/100${resumen ? ` · ${resumen}` : ""}`;
  return (
    <span
      className="pildora tnum whitespace-nowrap"
      style={{ background: e.bg, color: e.fg, ...(compacto ? { fontSize: 10.5, padding: "1px 6px" } : {}) }}
      title={titulo}
    >
      {compacto && n === "caliente" ? "🔥" : e.txt} {score}
    </span>
  );
}
