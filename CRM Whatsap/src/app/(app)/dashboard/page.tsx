import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import {
  getKpis,
  getEmbudo,
  getVendedores,
  getActividad,
  getRequierenAtencion,
  getCotizacionesSinCierre,
  getClientesFrios,
  getConsumoPlan,
  getValorAgente,
  getResumenMes,
  getPrimerMes,
  mesValido,
  mesActual,
  mesAnterior,
  mesSiguiente,
  nombreMes,
} from "@/lib/metrics";
import Link from "next/link";
import ValorAgente from "@/components/ValorAgente";
import { puedeVer } from "@/lib/plan";
import KpiTile from "@/components/KpiTile";
import Panel from "@/components/Panel";
import ActividadChart from "@/components/ActividadChart";
import Embudo from "@/components/Embudo";
import Eficiencia from "@/components/Eficiencia";
import TablaAlertas from "@/components/TablaAlertas";
import GaugeConsumo from "@/components/GaugeConsumo";

export const dynamic = "force-dynamic"; // siempre datos frescos por sesión

function saludo() {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
}

export default async function DashboardPage({ searchParams }: { searchParams: { mes?: string | string[] } }) {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");

  // Mes elegido (?mes=YYYY-MM): mueve el "Resumen del mes", el consumo y "Quién atiende".
  // Lo de "Estado de hoy" (oportunidades, cotizaciones, embudo, alertas) es siempre la foto actual:
  // la base guarda la etapa actual de cada lead, no la que tenía a fin de cada mes.
  const mes = mesValido(searchParams?.mes);
  const esMesActual = mes === mesActual();
  const mesTxt = nombreMes(mes);

  // Dashboard básico (KPIs + Consumo) es de los 3 planes. El resto (Actividad,
  // Embudo, Vendedores, Alertas) es exclusivo Convierte+ — solo se consulta si
  // el plan lo incluye, para no gastar queries de más en Conversa.
  const dashboardCompleto = puedeVer(tenant, "dashboard_completo");

  const [kpis, consumo, resumen, valor, valorPrev, primerMes, embudo, vendedores, actividad, atencion, cotizaciones, frios] = await Promise.all([
    getKpis(tenant.empresa),
    getConsumoPlan(tenant.empresa, mes),
    getResumenMes(tenant.empresa, mes),
    // Si la función SQL fallara, el resto del dashboard sigue cargando.
    getValorAgente(tenant.empresa, mes).catch(() => null),
    getValorAgente(tenant.empresa, mesAnterior(mes)).catch(() => null),
    getPrimerMes(tenant.empresa).catch(() => mesActual()),
    dashboardCompleto ? getEmbudo(tenant.empresa) : Promise.resolve([]),
    dashboardCompleto ? getVendedores(tenant.empresa) : Promise.resolve([]),
    dashboardCompleto ? getActividad(tenant.empresa) : Promise.resolve([]),
    dashboardCompleto ? getRequierenAtencion(tenant.empresa) : Promise.resolve([]),
    dashboardCompleto ? getCotizacionesSinCierre(tenant.empresa) : Promise.resolve([]),
    dashboardCompleto ? getClientesFrios(tenant.empresa) : Promise.resolve([]),
  ]);

  const pendientes = atencion.length + cotizaciones.length + frios.length;

  const totalSemana = actividad.reduce((s, a) => s + a.cantidad, 0);
  const promedioDiario = actividad.length ? Math.round(totalSemana / actividad.length) : 0;
  const maxLeads = Math.max(1, ...vendedores.map((v) => v.leads));
  const navBtn = "px-2 py-1 rounded text-tinta-2 hover:text-tinta";

  return (
    <main className="px-5 py-5 max-w-[1400px] aparecer">
      {/* Encabezado: saludo + selector de mes */}
      <header className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <div className="flex items-baseline gap-2.5">
          <h1 className="titulo-pagina">
            {saludo()}, {tenant.nombreEmpresa}
          </h1>
          <span className="pildora" style={{ background: "var(--verde-claro)", color: "var(--verde)" }}>
            <span className="punto" style={{ background: "var(--verde)" }} />
            Agente en línea
          </span>
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          {mes > primerMes ? (
            <Link href={`/dashboard?mes=${mesAnterior(mes)}`} className={navBtn} style={{ background: "var(--card-3)" }} aria-label="Mes anterior">‹</Link>
          ) : (
            <span className="px-2 py-1 text-tinta-3 opacity-40">‹</span>
          )}
          <span className="font-semibold text-tinta min-w-[150px] text-center">
            {mesTxt}{esMesActual ? " (en curso)" : ""}
          </span>
          {!esMesActual ? (
            <Link href={`/dashboard?mes=${mesSiguiente(mes)}`} className={navBtn} style={{ background: "var(--card-3)" }} aria-label="Mes siguiente">›</Link>
          ) : (
            <span className="px-2 py-1 text-tinta-3 opacity-40">›</span>
          )}
          <Link href={`/informe?mes=${mes}`} className="ml-2 px-2.5 py-1 rounded font-medium" style={{ background: "var(--verde-claro)", color: "var(--verde)" }}>
            Ver informe
          </Link>
        </div>
      </header>

      {/* Resumen del mes: lo que hizo el agente (sigue al selector de mes) */}
      <div className="flex items-baseline gap-2.5 mb-2.5">
        <h2 className="text-[13px] font-semibold text-tinta">Resumen de {mesTxt.toLowerCase()}</h2>
        <span className="text-tinta-3 text-[12px]">Lo que tu agente hizo por tu negocio</span>
      </div>
      {valor ? (
        <ValorAgente v={valor} prev={valorPrev} r={resumen} esMesActual={esMesActual} />
      ) : (
        <p className="text-tinta-3 text-[12px]">No fue posible calcular el resumen del mes.</p>
      )}

      {/* Consumo del plan del mes elegido — visible en los 3 planes */}
      <div className="mt-3">
        <Panel title="Consumo de tu plan" sub={`Mensajes que envió el agente en ${mesTxt.toLowerCase()}`}>
          <GaugeConsumo consumo={consumo} />
        </Panel>
      </div>

      {/* Estado de hoy: foto actual del CRM (no depende del mes elegido) */}
      <div className="flex items-baseline gap-2.5 mt-6 mb-2.5">
        <h2 className="text-[13px] font-semibold text-tinta">Estado de hoy</h2>
        <span className="text-tinta-3 text-[12px]">Cómo está tu CRM en este momento</span>
      </div>
      <section className="panel">
        <div className="grid grilla-kpi" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
          <KpiTile
            label="Oportunidades activas"
            value={kpis.oportunidades}
            sub="clientes en juego"
            icono="oportunidad"
            ayuda="Contactos en etapa Nuevo Lead, En Conversación o Cotización Enviada: ventas todavía abiertas."
          />
          <KpiTile
            label="Cotizaciones esperando"
            value={kpis.cotizaciones}
            sub="ya saben el precio"
            icono="cotizacion"
            ayuda="Contactos en etapa Cotización Enviada. Ya saben el precio y falta que respondan."
          />
          <KpiTile
            label="Requieren atención"
            value={pendientes}
            sub={pendientes > 0 ? "necesitan acción hoy" : "todo al día"}
            icono="atencion"
            alerta={pendientes > 0}
            ayuda="Contactos esperando a un vendedor, cotizaciones sin cierre y clientes que se enfriaron."
          />
        </div>
      </section>

      {dashboardCompleto && (
        <>
          {/* Actividad + Embudo */}
          <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "minmax(0,1.55fr) minmax(0,1fr)" }}>
            <Panel title="Actividad" sub="Leads captados en los últimos 7 días">
              <ActividadChart data={actividad} />
              <div className="flex items-center gap-5 mt-2.5 pt-2.5 divisor">
                <div className="flex items-center gap-2">
                  <span className="punto" style={{ background: "var(--verde)" }} />
                  <span className="text-[12px] text-tinta-3">Total de la semana</span>
                  <span className="text-[12px] font-semibold text-tinta tnum">{totalSemana}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="punto" style={{ background: "var(--tinta-3)" }} />
                  <span className="text-[12px] text-tinta-3">Promedio diario</span>
                  <span className="text-[12px] font-semibold text-tinta tnum">{promedioDiario}</span>
                </div>
              </div>
            </Panel>
            <Panel title="Embudo de leads" sub="En qué etapa está cada contacto">
              {embudo.length ? (
                <Embudo data={embudo} />
              ) : (
                <p className="text-tinta-3 text-[12px]">Aún no hay leads registrados.</p>
              )}
            </Panel>
          </div>

          <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
            <Panel title="Quién atiende" sub={`Reparto del trabajo en ${mesTxt.toLowerCase()}`}>
              <Eficiencia resueltas={valor?.resueltas_ia ?? 0} derivadas={valor?.con_humano ?? 0} total={valor?.conversaciones ?? 0} />
            </Panel>
            <Panel title="Vendedores" sub="Quién está tomando más leads">
              {vendedores.length ? (
                <div className="flex flex-col gap-2.5">
                  {vendedores.map((v, i) => {
                    return (
                      <div key={v.vendedor} className="flex items-center gap-2.5">
                        <span className="text-[10.5px] text-tinta-3 tnum w-4 flex-shrink-0">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="text-[12px] text-tinta font-medium truncate w-[92px] flex-shrink-0">
                          {v.vendedor}
                        </span>
                        <span className="barra flex-1" style={{ height: 5 }}>
                          <span style={{ width: `${Math.round((v.leads / maxLeads) * 100)}%` }} />
                        </span>
                        <span className="text-[11.5px] tnum font-semibold text-tinta w-7 text-right flex-shrink-0">
                          {v.leads}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-tinta-3 text-[12px]">Aún no has agregado vendedores.</p>
              )}
            </Panel>
          </div>

          {/* ¿Qué requiere atención hoy? */}
          <div className="flex items-center gap-2.5 mt-6 mb-2.5">
            <h2 className="text-[13px] font-semibold text-tinta">Requiere tu atención</h2>
            {pendientes > 0 && (
              <span className="pildora" style={{ background: "var(--alerta-bg)", color: "var(--alerta)" }}>
                {pendientes}
              </span>
            )}
          </div>

          <div className="mb-3">
            <Panel title="Sin respuesta o esperando vendedor" sub="Contactos que necesitan acción ahora">
              <TablaAlertas rows={atencion} mostrarEstado vacio="No tienes contactos pendientes." />
            </Panel>
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <Panel title="Cotizaciones sin cierre" sub="Enviadas y sin avance">
              <TablaAlertas rows={cotizaciones} vacio="No tienes cotizaciones abiertas." />
            </Panel>
            <Panel title="Clientes que se enfriaron" sub="Sin contacto hace más de 30 días">
              <TablaAlertas rows={frios} vacio="Ningún cliente se ha enfriado." />
            </Panel>
          </div>
        </>
      )}
    </main>
  );
}
