import type { ConsumoPlan } from "@/lib/metrics";

// Gauge semicircular del consumo del plan.
//
// El carril muestra las 3 zonas (sano / atención / crítico) en tono apagado,
// como referencia de "dónde estoy parado", y encima se dibuja el tramo
// consumido en color pleno. Se evita la aguja a propósito: con valores bajos
// apuntaba casi en horizontal y parecía un elemento descalibrado.
const CX = 100;
const CY = 100;
const R = 74;
const GROSOR = 10;

const UMBRAL_ATENCION = 50;
const UMBRAL_CRITICO = 80;

const ZONAS = [
  { desde: 0, hasta: UMBRAL_ATENCION, color: "var(--verde)" },
  { desde: UMBRAL_ATENCION, hasta: UMBRAL_CRITICO, color: "var(--alerta)" },
  { desde: UMBRAL_CRITICO, hasta: 100, color: "var(--rojo)" },
];

// Semicírculo superior: 0% a la izquierda (180°) → 100% a la derecha (0°).
function punto(pct: number, radio: number) {
  const rad = ((180 - pct * 1.8) * Math.PI) / 180;
  return { x: CX + radio * Math.cos(rad), y: CY - radio * Math.sin(rad) };
}

function arcoPath(pctDesde: number, pctHasta: number) {
  const p0 = punto(pctDesde, R);
  const p1 = punto(pctHasta, R);
  const largeArc = pctHasta - pctDesde > 50 ? 1 : 0;
  return `M ${p0.x} ${p0.y} A ${R} ${R} 0 ${largeArc} 1 ${p1.x} ${p1.y}`;
}

function estadoTexto(pct: number) {
  if (pct >= UMBRAL_CRITICO) return { texto: "Crítico", color: "var(--rojo)" };
  if (pct >= UMBRAL_ATENCION) return { texto: "Atención", color: "var(--alerta)" };
  return { texto: "Sano", color: "var(--verde)" };
}

export default function GaugeConsumo({ consumo }: { consumo: ConsumoPlan | null }) {
  if (!consumo) {
    return <p className="text-tinta-3 text-[12px]">Aún no hay consumo registrado este mes.</p>;
  }

  const { plan, usadas, limite, pct } = consumo;
  const estado = estadoTexto(pct);
  const pctVisible = Math.min(100, Math.max(0, pct));
  const restantes = Math.max(0, limite - usadas);

  // Ritmo del mes: proyecta el cierre según lo consumido hasta hoy. Es el dato
  // que anticipa el problema — llegar al tope antes de fin de mes.
  const hoy = new Date();
  const diaDelMes = hoy.getDate();
  const diasDelMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const proyeccion = Math.round((usadas / diaDelMes) * diasDelMes);
  const pctProyectado = limite > 0 ? Math.round((proyeccion / limite) * 100) : 0;
  const seExcede = proyeccion > limite;
  // Con 1-2 días de datos la proyección es ruido; se muestra desde el día 3.
  const mostrarProyeccion = usadas > 0 && diaDelMes >= 3;
  const marcaProyeccion = Math.min(100, Math.max(0, pctProyectado));

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 14 200 106" className="w-full max-w-[210px]" role="img" aria-label={`Consumo ${pct}%`}>
        {/* Zonas del carril, apagadas: sirven de referencia sin competir */}
        {ZONAS.map((z) => (
          <path
            key={z.desde}
            d={arcoPath(z.desde, z.hasta)}
            fill="none"
            stroke={z.color}
            strokeWidth={GROSOR}
            opacity={0.14}
          />
        ))}

        {/* Cortes entre zonas */}
        {[UMBRAL_ATENCION, UMBRAL_CRITICO].map((u) => {
          const a = punto(u, R - GROSOR / 2);
          const b = punto(u, R + GROSOR / 2);
          return (
            <line key={u} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--fondo)" strokeWidth={2} />
          );
        })}

        {/* Tramo consumido */}
        {pctVisible > 0 && (
          <path
            d={arcoPath(0, pctVisible)}
            fill="none"
            stroke={estado.color}
            strokeWidth={GROSOR}
            strokeLinecap="round"
          />
        )}

        {/* Marca de proyección a fin de mes */}
        {mostrarProyeccion && marcaProyeccion > pctVisible && (
          <>
            <line
              x1={punto(marcaProyeccion, R - GROSOR / 2 - 3).x}
              y1={punto(marcaProyeccion, R - GROSOR / 2 - 3).y}
              x2={punto(marcaProyeccion, R + GROSOR / 2 + 3).x}
              y2={punto(marcaProyeccion, R + GROSOR / 2 + 3).y}
              stroke={seExcede ? "var(--rojo)" : "var(--tinta-2)"}
              strokeWidth={1.5}
              strokeDasharray="2 2"
            />
            <circle
              cx={punto(marcaProyeccion, R + GROSOR / 2 + 6).x}
              cy={punto(marcaProyeccion, R + GROSOR / 2 + 6).y}
              r={2}
              fill={seExcede ? "var(--rojo)" : "var(--tinta-2)"}
            />
          </>
        )}

        {/* Valor centrado en el eje del semicírculo */}
        <text
          x={CX}
          y={CY - 24}
          textAnchor="middle"
          fontWeight="600"
          letterSpacing="-0.03em"
          fill="var(--tinta)"
          fontSize="30"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {pct}%
        </text>
        <text x={CX} y={CY - 6} textAnchor="middle" fill="var(--tinta-3)" fontSize="10" letterSpacing="0.09em">
          CONSUMIDO
        </text>

        {/* Extremos de la escala, bajo cada punta del arco */}
        <text x={punto(0, R).x} y={CY + 13} textAnchor="middle" fill="var(--tinta-3)" fontSize="9">
          0
        </text>
        <text x={punto(100, R).x} y={CY + 13} textAnchor="middle" fill="var(--tinta-3)" fontSize="9">
          {limite.toLocaleString("es-CL")}
        </text>
      </svg>

      <div className="flex items-center gap-1.5 mt-1">
        <span className="punto" style={{ background: estado.color }} />
        <span className="text-[12px] font-semibold" style={{ color: estado.color }}>
          {estado.texto}
        </span>
      </div>

      {/* Tres datos alineados en columnas iguales: mantiene la simetría */}
      <div className="grid grid-cols-3 gap-px w-full mt-3 divisor pt-3">
        <div className="text-center">
          <div className="text-[13px] font-semibold text-tinta tnum">{usadas.toLocaleString("es-CL")}</div>
          <div className="text-[12px] text-tinta-3 mt-0.5">Enviados</div>
        </div>
        <div className="text-center">
          <div className="text-[13px] font-semibold text-tinta tnum">{restantes.toLocaleString("es-CL")}</div>
          <div className="text-[12px] text-tinta-3 mt-0.5">Disponibles</div>
        </div>
        <div className="text-center">
          <div
            className="text-[13px] font-semibold tnum"
            style={{ color: seExcede ? "var(--rojo)" : "var(--tinta)" }}
          >
            {mostrarProyeccion ? proyeccion.toLocaleString("es-CL") : "—"}
          </div>
          <div className="text-[12px] text-tinta-3 mt-0.5">Proyectado</div>
        </div>
      </div>

      <p className="text-[12px] text-tinta-3 mt-2.5 text-center leading-snug">
        {mostrarProyeccion && seExcede ? (
          <>
            A este ritmo superarás tu plan {plan} este mes.{" "}
            <span style={{ color: "var(--rojo)" }}>Considera subir de plan.</span>
          </>
        ) : mostrarProyeccion ? (
          <>A este ritmo cerrarás el mes dentro de tu plan {plan}.</>
        ) : (
          <>Plan {plan}</>
        )}
      </p>
    </div>
  );
}
