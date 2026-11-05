import KpiTile from "@/components/KpiTile";
import type { ValorAgente as Valor } from "@/lib/metrics";

// "Valor de tu agente": lo que el agente le ahorra al negocio este mes, en términos que el
// dueño entiende (rapidez, trabajo que no tuvo que hacer, horas de su equipo).

const LETRA = ["D", "L", "M", "X", "J", "V", "S"];

export function fmtDias(dias: number[]) {
  const d = [...dias].sort();
  if (d.join() === "1,2,3,4,5") return "L–V";
  if (d.join() === "1,2,3,4,5,6") return "L–S";
  return d.map((x) => LETRA[x] ?? "?").join(" ");
}

export function fmtSeg(s: number) {
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}

export function fmtMin(m: number) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", timeZone: "America/Santiago" });
}

// Variación % contra el mes anterior; null si no hay base para comparar.
export function variacion(actual: number, anterior: number | undefined): number | null {
  if (anterior == null || anterior <= 0) return null;
  return Math.round(((actual - anterior) / anterior) * 100);
}

export type ResumenMes = { mensajes: number; mensajesPrev: number; leadsNuevos: number; leadsNuevosPrev: number };

export default function ValorAgente({
  v,
  prev,
  r,
  esMesActual = true,
}: {
  v: Valor;
  prev?: Valor | null;
  r: ResumenMes;
  esMesActual?: boolean;
}) {
  const desde = !esMesActual
    ? "sin medición ese mes"
    : v.medicion_desde ? `midiendo desde el ${fmtFecha(v.medicion_desde)}` : "se mide desde el próximo mensaje";
  const pctIA = v.conversaciones > 0 ? Math.round((v.resueltas_ia / v.conversaciones) * 100) : 0;
  const horario = `${fmtDias(v.horario.dias)} ${v.horario.inicio}–${v.horario.fin}`;
  const horas = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(v.horas_liberadas);
  const vsPrev = (x: number | null) => (x == null ? (esMesActual ? "este mes" : "en el mes") : "vs. mes anterior");

  return (
    <section className="panel">
      {/* 8 indicadores del mes en 2 filas de 4. Sin overflow-hidden: recortaría los tooltips. */}
      <div className="grid grilla-kpi" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
        <KpiTile
          label="Mensajes del agente"
          value={r.mensajes}
          sub={vsPrev(variacion(r.mensajes, r.mensajesPrev))}
          icono="conversaciones"
          variacion={variacion(r.mensajes, r.mensajesPrev)}
          destacado
          ayuda="Mensajes que tu agente envió en el mes. Es la misma cifra que consume tu plan."
        />
        <KpiTile
          label="Leads nuevos"
          value={r.leadsNuevos}
          sub={vsPrev(variacion(r.leadsNuevos, r.leadsNuevosPrev))}
          icono="oportunidad"
          variacion={variacion(r.leadsNuevos, r.leadsNuevosPrev)}
          ayuda="Contactos que el agente registró en tu CRM por primera vez en el mes, al detectar interés de compra."
        />
        <KpiTile
          label="Resueltas sin tu equipo"
          value={v.resueltas_ia}
          sub={v.conversaciones > 0 ? `${pctIA}% de ${v.conversaciones} conversaciones` : "aún sin conversaciones"}
          icono="ia"
          variacion={variacion(v.resueltas_ia, prev?.resueltas_ia)}
          ayuda="Conversaciones (un contacto en un día) que el agente atendió solo: nadie de tu equipo escribió ni se pidió un vendedor."
        />
        <KpiTile
          label="Derivadas a tu equipo"
          value={v.con_humano}
          sub="intervino una persona"
          icono="vendedor"
          variacion={variacion(v.con_humano, prev?.con_humano)}
          ayuda="Conversaciones en que el cliente pidió un vendedor, alguien de tu equipo escribió desde el CRM o apagaste el bot."
        />
        <KpiTile
          label="Tiempo de respuesta"
          value={v.respuesta_mediana_seg != null ? fmtSeg(v.respuesta_mediana_seg) : "—"}
          sub={
            v.respuestas_medidas > 0
              ? `${v.respuesta_bajo_1min_pct ?? 0}% en menos de 1 min`
              : desde
          }
          icono="reloj"
          ayuda="Tiempo típico (mediana) entre que llega el mensaje del cliente y responde tu agente, a cualquier hora."
        />
        <KpiTile
          label="Resueltas sin tu equipo"
          value={v.resueltas_ia}
          sub={v.conversaciones > 0 ? `${pctIA}% de ${v.conversaciones} conversaciones` : "aún sin conversaciones"}
          icono="ia"
          variacion={variacion(v.resueltas_ia, prev?.resueltas_ia)}
          ayuda="Conversaciones (un contacto en un día) que el agente atendió solo: nadie de tu equipo escribió ni se pidió un vendedor."
        />
        <KpiTile
          label="Fuera de horario"
          value={v.fuera_horario}
          sub={`atendidas fuera de ${horario}`}
          icono="luna"
          variacion={variacion(v.fuera_horario, prev?.fuera_horario)}
          ayuda="Conversaciones con mensajes fuera de tu horario de atención. Sin el agente, esos clientes habrían esperado al día siguiente."
        />
        <KpiTile
          label="Horas liberadas"
          value={`${horas} h`}
          sub={`≈ ${v.minutos_por_conversacion} min por conversación`}
          icono="horas"
          variacion={variacion(v.horas_liberadas, prev?.horas_liberadas)}
          ayuda="Tiempo que tu equipo no tuvo que dedicar a responder: conversaciones resueltas por el agente × minutos promedio por conversación."
        />
        <KpiTile
          label="Toma del vendedor"
          value={v.toma_vendedor_mediana_min != null ? fmtMin(v.toma_vendedor_mediana_min) : "—"}
          sub={
            v.derivaciones > 0
              ? `${v.derivaciones_tomadas} de ${v.derivaciones} respondidas desde el CRM`
              : "sin derivaciones este mes"
          }
          icono="vendedor"
          alerta={v.derivaciones > v.derivaciones_tomadas}
          ayuda="Tiempo típico desde que un cliente pide un vendedor hasta que tu equipo le responde desde el CRM. Las respuestas por wa.me desde el celular no se registran."
        />
      </div>
    </section>
  );
}
