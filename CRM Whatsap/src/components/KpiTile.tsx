const ICONOS: Record<string, React.ReactNode> = {
  conversaciones: <path d="M16.5 10.5c0 3-2.9 5.4-6.5 5.4-.8 0-1.6-.1-2.3-.35L4 16.5l1.1-2.9A5.1 5.1 0 0 1 3.5 10.5C3.5 7.5 6.4 5 10 5s6.5 2.5 6.5 5.5Z" />,
  ia: <><rect x="4.5" y="7" width="11" height="8" rx="2.2" /><path d="M10 7V4.5M7.5 11h.01M12.5 11h.01" /></>,
  vendedor: <><circle cx="10" cy="7" r="2.6" /><path d="M4.5 16c0-2.6 2.5-4.2 5.5-4.2s5.5 1.6 5.5 4.2" /></>,
  oportunidad: <><path d="M10 3.5v2M10 14.5v2M16.5 10h-2M5.5 10h-2" /><circle cx="10" cy="10" r="3.2" /></>,
  cotizacion: <><path d="M6 3.5h6l3 3v10H6z" /><path d="M11.5 3.5V7H15M8 10.5h4M8 13h4" /></>,
  atencion: <><path d="M10 3.5 17 16H3z" /><path d="M10 8.5v3M10 13.5h.01" /></>,
};

function Icono({ tipo }: { tipo: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONOS[tipo]}
    </svg>
  );
}

// Métrica del resumen: icono en cuadro, cifra dominante y, cuando hay con qué
// comparar, la variación respecto del período anterior.
export default function KpiTile({
  label,
  value,
  sub,
  icono,
  destacado = false,
  alerta = false,
  variacion,
  ayuda,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icono?: string;
  destacado?: boolean;
  alerta?: boolean;
  variacion?: number | null;
  ayuda?: string;
}) {
  const color = alerta ? "var(--alerta)" : destacado ? "var(--verde)" : "var(--tinta)";
  const subeOBaja = variacion != null && variacion !== 0;
  const colorVar = variacion == null || variacion === 0
    ? "var(--tinta-3)"
    : variacion > 0
    ? "var(--exito)"
    : "var(--rojo)";

  return (
    <div className="px-4 py-3.5">
      {/* El tooltip va en el contenedor, no en el <span> del título: `truncate`
          aplica overflow:hidden y recortaría el pseudo-elemento. */}
      <div className="flex items-center gap-2 mb-2.5 tip" data-tip={ayuda ?? label} tabIndex={0}>
        {icono && (
          <span
            className="grid place-items-center rounded-[5px] flex-shrink-0"
            style={{ width: 22, height: 22, background: "var(--card-3)", color }}
          >
            <Icono tipo={icono} />
          </span>
        )}
        <span className="eyebrow truncate">{label}</span>
      </div>

      <div className="cifra" style={{ color }}>
        {value}
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        {variacion != null && (
          <span className="text-[12px] font-semibold tnum" style={{ color: colorVar }}>
            {subeOBaja ? (variacion > 0 ? "▲" : "▼") : ""} {Math.abs(variacion)}%
          </span>
        )}
        {sub && <span className="text-[12px] text-tinta-3 leading-tight">{sub}</span>}
      </div>
    </div>
  );
}
