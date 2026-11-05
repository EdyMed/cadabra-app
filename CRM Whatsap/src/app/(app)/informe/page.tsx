import { redirect } from "next/navigation";
import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import {
  getValorAgente,
  getPrimerMes,
  mesValido,
  mesActual,
  mesAnterior,
  mesSiguiente,
  nombreMes,
  type ValorAgente,
} from "@/lib/metrics";
import { fmtDias, fmtMin, fmtSeg, variacion } from "@/components/ValorAgente";
import BotonImprimir from "@/components/BotonImprimir";
import { BASE_PATH } from "@/lib/api";

export const dynamic = "force-dynamic";

// Informe mensual del agente: hoja blanca pensada para imprimir / guardar como PDF y
// enviar al dueño. Misma fuente que el dashboard (crm.metricas_valor).

const num = (n: number) => new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(n);

type Fila = { label: string; actual: string; anterior: string; var: number | null; mejorSiBaja?: boolean };

function filas(v: ValorAgente, p: ValorAgente | null): Fila[] {
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
  const seg = (x: number | null | undefined) => (x != null ? fmtSeg(x) : "—");
  const min = (x: number | null | undefined) => (x != null ? fmtMin(x) : "—");
  return [
    { label: "Mensajes de clientes recibidos", actual: num(v.mensajes_clientes), anterior: p ? num(p.mensajes_clientes) : "—", var: variacion(v.mensajes_clientes, p?.mensajes_clientes) },
    { label: "Conversaciones atendidas", actual: num(v.conversaciones), anterior: p ? num(p.conversaciones) : "—", var: variacion(v.conversaciones, p?.conversaciones) },
    { label: "Resueltas sin tu equipo", actual: `${num(v.resueltas_ia)} (${pct(v.resueltas_ia, v.conversaciones)})`, anterior: p ? `${num(p.resueltas_ia)} (${pct(p.resueltas_ia, p.conversaciones)})` : "—", var: variacion(v.resueltas_ia, p?.resueltas_ia) },
    { label: "Con intervención de tu equipo", actual: num(v.con_humano), anterior: p ? num(p.con_humano) : "—", var: variacion(v.con_humano, p?.con_humano) },
    { label: "Atendidas fuera de horario", actual: num(v.fuera_horario), anterior: p ? num(p.fuera_horario) : "—", var: variacion(v.fuera_horario, p?.fuera_horario) },
    { label: "Horas de trabajo liberadas", actual: `${num(v.horas_liberadas)} h`, anterior: p ? `${num(p.horas_liberadas)} h` : "—", var: variacion(v.horas_liberadas, p?.horas_liberadas) },
    { label: "Tiempo de respuesta (mediana)", actual: seg(v.respuesta_mediana_seg), anterior: seg(p?.respuesta_mediana_seg), var: null },
    { label: "Respondidas en menos de 1 minuto", actual: v.respuesta_bajo_1min_pct != null ? `${v.respuesta_bajo_1min_pct}%` : "—", anterior: p?.respuesta_bajo_1min_pct != null ? `${p.respuesta_bajo_1min_pct}%` : "—", var: null },
    { label: "Clientes que pidieron un vendedor", actual: num(v.derivaciones), anterior: p ? num(p.derivaciones) : "—", var: variacion(v.derivaciones, p?.derivaciones) },
    { label: "Tiempo hasta que tu equipo respondió", actual: min(v.toma_vendedor_mediana_min), anterior: min(p?.toma_vendedor_mediana_min), var: null },
  ];
}

function resumen(v: ValorAgente, mesNombre: string, enCurso: boolean): string {
  if (v.conversaciones === 0) return `En ${mesNombre.toLowerCase()} tu agente no registró conversaciones.`;
  const pct = Math.round((v.resueltas_ia / v.conversaciones) * 100);
  let s = `${enCurso ? "En lo que va de" : "En"} ${mesNombre.toLowerCase()} tu agente atendió ${num(v.conversaciones)} conversaciones y resolvió ${num(v.resueltas_ia)} (${pct}%) sin que tu equipo tuviera que intervenir, lo que equivale a unas ${num(v.horas_liberadas)} horas de trabajo.`;
  if (v.fuera_horario > 0) s += ` ${num(v.fuera_horario)} de esas conversaciones llegaron fuera de tu horario de atención y no tuvieron que esperar al día siguiente.`;
  if (v.respuesta_mediana_seg != null) s += ` El tiempo típico de respuesta fue de ${fmtSeg(v.respuesta_mediana_seg)}.`;
  return s;
}

export default async function InformePage({ searchParams }: { searchParams: { mes?: string | string[] } }) {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");

  const mes = mesValido(searchParams?.mes);
  const enCurso = mes === mesActual();
  const [v, p, primerMes] = await Promise.all([
    getValorAgente(tenant.empresa, mes),
    getValorAgente(tenant.empresa, mesAnterior(mes)).catch(() => null),
    getPrimerMes(tenant.empresa).catch(() => mesActual()),
  ]);
  const generado = new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Santiago" });

  return (
    <main className="px-5 py-5 max-w-[900px] mx-auto aparecer">
      {/* Barra de acciones (no se imprime) */}
      <div className="no-print flex items-center justify-between gap-3 flex-wrap mb-4">
        <Link href={`/dashboard?mes=${mes}`} className="text-[12px] text-tinta-2 hover:text-tinta">← Volver al dashboard</Link>
        <div className="flex items-center gap-2 text-[12px]">
          {mes > primerMes ? (
            <Link href={`/informe?mes=${mesAnterior(mes)}`} className="px-2 py-1 rounded text-tinta-2" style={{ background: "var(--card-3)" }}>‹</Link>
          ) : <span className="px-2 py-1 opacity-40">‹</span>}
          <span className="font-semibold text-tinta min-w-[120px] text-center">{nombreMes(mes)}</span>
          {!enCurso ? (
            <Link href={`/informe?mes=${mesSiguiente(mes)}`} className="px-2 py-1 rounded text-tinta-2" style={{ background: "var(--card-3)" }}>›</Link>
          ) : <span className="px-2 py-1 opacity-40">›</span>}
          <span className="ml-2"><BotonImprimir /></span>
        </div>
      </div>

      {/* Hoja del informe */}
      <article className="hoja-informe rounded-lg" style={{ background: "#ffffff", color: "#1a1f26", padding: "36px 40px" }}>
        <header className="flex items-start justify-between gap-4 pb-4" style={{ borderBottom: "2px solid #42d6d0" }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "#5b6573" }}>Informe mensual del agente WhatsApp</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: "4px 0 2px" }}>{tenant.nombreEmpresa}</h1>
            <div style={{ fontSize: 14, color: "#3a4350" }}>{nombreMes(mes)}{enCurso ? " · mes en curso (parcial)" : ""}</div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span className="imprimir-fondo" style={{ background: "#0e1116", borderRadius: 8, padding: "8px 12px", display: "inline-flex" }}>
            <img src={`${BASE_PATH}/cadabra-logo.png`} alt="Cadabra" style={{ height: 24, width: "auto" }} />
          </span>
        </header>

        {!v ? (
          <p style={{ marginTop: 24 }}>No fue posible calcular las métricas de este mes.</p>
        ) : (
          <>
            <section style={{ marginTop: 22 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#0f8f8a" }}>Resumen</h2>
              <p style={{ fontSize: 14, lineHeight: 1.6, marginTop: 6 }}>{resumen(v, nombreMes(mes), enCurso)}</p>
            </section>

            {/* Cifras destacadas */}
            <section className="grid gap-3" style={{ marginTop: 18, gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
              {[
                { t: "Resueltas sin tu equipo", c: num(v.resueltas_ia) },
                { t: "Horas liberadas", c: `${num(v.horas_liberadas)} h` },
                { t: "Fuera de horario", c: num(v.fuera_horario) },
                { t: "Tiempo de respuesta", c: v.respuesta_mediana_seg != null ? fmtSeg(v.respuesta_mediana_seg) : "—" },
              ].map((k) => (
                <div key={k.t} style={{ border: "1px solid #e3e7ec", borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, color: "#5b6573" }}>{k.t}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{k.c}</div>
                </div>
              ))}
            </section>

            <section style={{ marginTop: 22 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#0f8f8a" }}>Detalle</h2>
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8, fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#5b6573", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>
                    <th style={{ padding: "6px 0", borderBottom: "1px solid #d7dce2" }}>Indicador</th>
                    <th style={{ padding: "6px 0", borderBottom: "1px solid #d7dce2", textAlign: "right" }}>{nombreMes(mes)}</th>
                    <th style={{ padding: "6px 0", borderBottom: "1px solid #d7dce2", textAlign: "right" }}>{nombreMes(mesAnterior(mes))}</th>
                    <th style={{ padding: "6px 0", borderBottom: "1px solid #d7dce2", textAlign: "right" }}>Variación</th>
                  </tr>
                </thead>
                <tbody>
                  {filas(v, p).map((f) => (
                    <tr key={f.label}>
                      <td style={{ padding: "7px 0", borderBottom: "1px solid #eef1f4" }}>{f.label}</td>
                      <td style={{ padding: "7px 0", borderBottom: "1px solid #eef1f4", textAlign: "right", fontWeight: 600 }}>{f.actual}</td>
                      <td style={{ padding: "7px 0", borderBottom: "1px solid #eef1f4", textAlign: "right", color: "#5b6573" }}>{f.anterior}</td>
                      <td style={{ padding: "7px 0", borderBottom: "1px solid #eef1f4", textAlign: "right", color: f.var == null || f.var === 0 ? "#8a93a0" : f.var > 0 ? "#12805c" : "#c0392b" }}>
                        {f.var == null ? "—" : `${f.var > 0 ? "▲" : f.var < 0 ? "▼" : ""} ${Math.abs(f.var)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section style={{ marginTop: 22, fontSize: 11.5, color: "#5b6573", lineHeight: 1.55 }}>
              <h2 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>Cómo se calcula</h2>
              <ul style={{ marginTop: 4, paddingLeft: 16, listStyle: "disc" }}>
                <li>Una conversación es un cliente que escribió en un día. Se considera resuelta por el agente si nadie de tu equipo escribió ni se pidió un vendedor ese día.</li>
                <li>Horario de atención considerado: {fmtDias(v.horario.dias)} {v.horario.inicio}–{v.horario.fin}. Horas liberadas: conversaciones resueltas × {num(v.minutos_por_conversacion)} min.</li>
                <li>El tiempo de respuesta incluye unos segundos de espera para agrupar mensajes seguidos del mismo cliente. Se mide desde el {v.medicion_desde ? new Date(v.medicion_desde).toLocaleDateString("es-CL", { timeZone: "America/Santiago" }) : "próximo mensaje"}.</li>
                <li>El tiempo de respuesta de tu equipo solo considera respuestas enviadas desde el CRM (no las enviadas desde el celular por wa.me).</li>
              </ul>
            </section>
          </>
        )}

        <footer style={{ marginTop: 28, paddingTop: 10, borderTop: "1px solid #e3e7ec", fontSize: 11, color: "#8a93a0", display: "flex", justifyContent: "space-between" }}>
          <span>Generado por Cadabra · agente.appcadabra.cl</span>
          <span>{generado}</span>
        </footer>
      </article>
    </main>
  );
}
