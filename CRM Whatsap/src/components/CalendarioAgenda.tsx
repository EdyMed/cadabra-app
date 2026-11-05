"use client";

import { useMemo, useState } from "react";
import type { CitaRow } from "@/lib/metrics";

const ESTADO_DOT: Record<string, string> = {
  Confirmado: "var(--verde)",
  Pendiente: "var(--alerta)",
  Cancelado: "var(--rojo)",
};

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function formatHora(hora: string | null) {
  return hora ? hora.slice(0, 5) : null;
}

function celdasDelMes(anio: number, mes: number) {
  const primerDia = new Date(anio, mes, 1);
  const ultimoDia = new Date(anio, mes + 1, 0);
  const offsetInicio = (primerDia.getDay() + 6) % 7; // lunes=0

  const celdas: { fecha: Date; delMes: boolean }[] = [];
  for (let i = offsetInicio - 1; i >= 0; i--) {
    celdas.push({ fecha: new Date(anio, mes, -i), delMes: false });
  }
  for (let d = 1; d <= ultimoDia.getDate(); d++) {
    celdas.push({ fecha: new Date(anio, mes, d), delMes: true });
  }
  while (celdas.length % 7 !== 0) {
    const ultima = celdas[celdas.length - 1].fecha;
    celdas.push({ fecha: new Date(ultima.getFullYear(), ultima.getMonth(), ultima.getDate() + 1), delMes: false });
  }
  return celdas;
}

function claveFecha(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function esHoy(d: Date) {
  const hoy = new Date();
  return d.toDateString() === hoy.toDateString();
}

export default function CalendarioAgenda({ citas }: { citas: CitaRow[] }) {
  const conFecha = citas.filter((c) => c.fecha_agendamiento);
  const sinFecha = citas.filter((c) => !c.fecha_agendamiento);

  const porFecha = useMemo(() => {
    const map = new Map<string, CitaRow[]>();
    for (const c of conFecha) {
      const key = c.fecha_agendamiento!;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, [conFecha]);

  const inicial = conFecha[0]?.fecha_agendamiento
    ? new Date(conFecha[0].fecha_agendamiento + "T00:00:00")
    : new Date();
  const [anio, setAnio] = useState(inicial.getFullYear());
  const [mes, setMes] = useState(inicial.getMonth());
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);

  const celdas = useMemo(() => celdasDelMes(anio, mes), [anio, mes]);

  function irMes(delta: number) {
    const d = new Date(anio, mes + delta, 1);
    setAnio(d.getFullYear());
    setMes(d.getMonth());
    setDiaSeleccionado(null);
  }

  const citasDelDiaSeleccionado = diaSeleccionado ? porFecha.get(diaSeleccionado) ?? [] : [];

  return (
    <div className="flex flex-col gap-7">
      {/* Calendario */}
      <div className="panel p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[14px] font-semibold text-tinta capitalize">
            {MESES[mes]} <span className="text-tinta-3 font-medium">{anio}</span>
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => irMes(-1)}
              aria-label="Mes anterior"
              className="w-7 h-7 rounded-[6px] grid place-items-center text-tinta-2 text-[13px] transicion hover:bg-crema"
            >
              ‹
            </button>
            <button
              onClick={() => {
                const hoy = new Date();
                setAnio(hoy.getFullYear());
                setMes(hoy.getMonth());
                setDiaSeleccionado(null);
              }}
              className="btn-secundario"
              style={{ border: "1px solid var(--linea)" }}
            >
              Hoy
            </button>
            <button
              onClick={() => irMes(1)}
              aria-label="Mes siguiente"
              className="w-7 h-7 rounded-[6px] grid place-items-center text-tinta-2 text-[13px] transicion hover:bg-crema"
            >
              ›
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 mb-1">
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="text-center text-[10.5px] font-bold text-tinta-3 uppercase tracking-wider pb-2">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {celdas.map(({ fecha, delMes }) => {
            const key = claveFecha(fecha);
            const citasDia = porFecha.get(key) ?? [];
            const seleccionado = diaSeleccionado === key;
            const hoy = esHoy(fecha);
            const clickeable = citasDia.length > 0;

            return (
              <button
                key={key}
                onClick={() => clickeable && setDiaSeleccionado(seleccionado ? null : key)}
                className="rounded-[7px] p-1.5 text-left flex flex-col gap-1 min-h-[62px] transicion"
                style={{
                  background: seleccionado ? "var(--verde)" : delMes ? "var(--crema)" : "transparent",
                  cursor: clickeable ? "pointer" : "default",
                }}
              >
                <span
                  className="text-[11.5px] font-semibold tnum w-[18px] h-[18px] grid place-items-center rounded-[5px]"
                  style={{
                    color: seleccionado
                      ? "var(--acento-tinta)"
                      : hoy
                      ? "var(--verde)"
                      : delMes
                      ? "var(--tinta)"
                      : "var(--tinta-3)",
                    background: hoy && !seleccionado ? "var(--verde-claro)" : "transparent",
                    opacity: delMes ? 1 : 0.4,
                  }}
                >
                  {fecha.getDate()}
                </span>
                <div className="flex flex-wrap gap-[3px]">
                  {citasDia.slice(0, 4).map((c) => (
                    <span
                      key={c.id}
                      className="w-[6px] h-[6px] rounded-full flex-shrink-0"
                      style={{ background: seleccionado ? "var(--acento-tinta)" : ESTADO_DOT[c.estado_agendamiento] ?? "var(--tinta-3)" }}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detalle del día seleccionado */}
      {diaSeleccionado && citasDelDiaSeleccionado.length > 0 && (
        <div>
          <h2 className="eyebrow mb-2.5">
            {new Date(diaSeleccionado + "T00:00:00").toLocaleDateString("es-CL", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </h2>
          <div className="flex flex-col gap-2">
            {citasDelDiaSeleccionado.map((c) => (
              <TarjetaCita key={c.id} cita={c} />
            ))}
          </div>
        </div>
      )}

      {/* Pendientes sin fecha */}
      {sinFecha.length > 0 && (
        <div>
          <h2 className="eyebrow mb-2.5">
            Pendientes de fecha
          </h2>
          <div className="flex flex-col gap-2">
            {sinFecha.map((c) => (
              <TarjetaCita key={c.id} cita={c} />
            ))}
          </div>
        </div>
      )}

      {citas.length === 0 && (
        <div className="panel px-8 py-12 text-center">
          <p className="text-tinta text-[13px] font-medium">No tienes citas agendadas todavía.</p>
          <p className="text-tinta-3 text-[13px] mt-1">
            Aquí aparecerán las reuniones que agende el agente.
          </p>
        </div>
      )}
    </div>
  );
}

function TarjetaCita({ cita }: { cita: CitaRow }) {
  const dot = ESTADO_DOT[cita.estado_agendamiento] ?? "var(--tinta-3)";
  const hora = formatHora(cita.hora_cita);

  return (
    <div
      className="rounded-[14px] p-4 flex items-center gap-4 flex-wrap transition-colors hover:bg-crema"
      style={{ background: "var(--card)", border: "1px solid var(--linea)" }}
    >
      <div className="flex flex-col items-center justify-center rounded-[10px] px-3 py-2 min-w-[62px]" style={{ background: "var(--crema)" }}>
        <span className="text-[12px] font-bold text-tinta tnum">{hora ?? "—"}</span>
      </div>

      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} />

      <div className="flex-1 min-w-[220px]">
        <p className="font-medium text-[12.5px] text-tinta leading-tight">{cita.nombre_negocio}</p>
        <p className="text-[13px] text-tinta-3 leading-tight mt-0.5">
          {cita.nombre !== "—" && <span>{cita.nombre}</span>}
          {cita.nombre !== "—" && cita.phone !== "—" && <span className="mx-1.5">·</span>}
          {cita.phone !== "—" && <span className="tnum">{cita.phone}</span>}
        </p>
      </div>

      <span className="text-[12.5px] text-tinta-2 font-medium">{cita.vendedor_asignado}</span>

      <span className="text-[12px] font-semibold" style={{ color: dot }}>
        {cita.estado_agendamiento}
      </span>
    </div>
  );
}
