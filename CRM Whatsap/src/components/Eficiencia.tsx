// Dona SVG pura (sin librería) para % resuelto por IA.
export default function Eficiencia({
  resueltas,
  derivadas,
  total,
}: {
  resueltas: number;
  derivadas: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((resueltas / total) * 100) : 0;

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="relative flex-shrink-0" style={{ width: 118, height: 118 }}>
        <svg viewBox="0 0 42 42" width="118" height="118">
          <circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--card-3)" strokeWidth="5" />
          <circle
            cx="21"
            cy="21"
            r="15.9"
            fill="none"
            stroke="#42d6d0"
            strokeWidth="5"
            strokeDasharray={`${pct} ${100 - pct}`}
            strokeDashoffset="25"
            strokeLinecap="round"
            transform="rotate(-90 21 21)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="cifra" style={{ fontSize: 21 }}>
            {pct}%
          </span>
          <span className="eyebrow mt-0.5">IA</span>
        </div>
      </div>
      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex items-center gap-2 text-[12px] text-tinta-2">
          <span className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ background: "#42d6d0" }} />
          Atendido por IA
          <b className="text-tinta font-semibold tnum">{resueltas}</b>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-tinta-2">
          <span className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ background: "var(--tinta-3)" }} />
          Derivado a tu equipo
          <b className="text-tinta font-semibold tnum">{derivadas}</b>
        </div>
        <p className="text-[12px] text-tinta-3 mt-0.5 max-w-[180px] leading-snug">
          Tu agente resolvió el {pct}% de las conversaciones sin intervención.
        </p>
      </div>
    </div>
  );
}
