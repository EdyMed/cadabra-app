"use client";

import { useMemo, useState, useTransition } from "react";
import type { OportunidadRow } from "@/lib/metrics";
import { apiUrl } from "@/lib/api";
import Temperatura from "@/components/Temperatura";
import EditorEtapas from "@/components/EditorEtapas";
import { colorEtapa, type Etapa } from "@/lib/etapasComun";

const COLOR_VENDEDOR: Record<string, string> = {
  "Vendedor 1": "#4fb8b2",
  "Vendedor 2": "#3de0c8",
};
const COLOR_VENDEDOR_DEFAULT = "#555e68";

function iniciales(nombre: string) {
  return nombre
    .replace(/[^A-Za-zÁÉÍÓÚÑ ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function TableroOportunidades({
  leads: leadsIniciales,
  etapas: etapasIniciales,
}: {
  leads: OportunidadRow[];
  etapas: Etapa[];
}) {
  const [leads, setLeads] = useState(leadsIniciales);
  const [etapas, setEtapas] = useState(etapasIniciales);
  const [editando, setEditando] = useState(false);
  const [verOcultas, setVerOcultas] = useState(false);
  const [vendedor, setVendedor] = useState("");
  const [q, setQ] = useState("");
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropZone, setDropZone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const vendedores = useMemo(
    () => Array.from(new Set(leads.map((l) => l.vendedor_asignado))).sort(),
    [leads]
  );

  const filtrados = useMemo(() => {
    const t = q.toLowerCase().trim();
    return leads.filter((l) => {
      const okQ = !t || l.nombre_negocio.toLowerCase().includes(t) || l.nombre.toLowerCase().includes(t);
      const okV = !vendedor || l.vendedor_asignado === vendedor;
      return okQ && okV;
    });
  }, [leads, q, vendedor]);

  const columnas = useMemo(() => {
    const porEstado = new Map<string, OportunidadRow[]>();
    for (const e of etapas) porEstado.set(e.nombre, []);
    for (const l of filtrados) {
      const col = porEstado.get(l.estado_crm) ?? porEstado.get("Nuevo Lead")!;
      col.push(l);
    }
    // Dentro de cada etapa, los más calientes arriba (sin puntaje al final, conservando su orden).
    porEstado.forEach((col) => col.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)));
    return etapas.map((etapa) => ({ etapa, estado: etapa.nombre, leads: porEstado.get(etapa.nombre) ?? [] }));
  }, [filtrados, etapas]);

  // Las ocultas no se muestran; si tienen leads (los puede dejar el agente o n8n), un botón permite verlas.
  const enOcultas = columnas.filter((c) => c.etapa.oculta).reduce((n, c) => n + c.leads.length, 0);
  const visibles = columnas.filter((c) => !c.etapa.oculta || (verOcultas && c.leads.length > 0));

  function etapasGuardadas(nuevas: Etapa[], renombres: Map<string, string>) {
    setEtapas(nuevas);
    if (renombres.size) {
      setLeads((prev) => prev.map((l) => (renombres.has(l.estado_crm) ? { ...l, estado_crm: renombres.get(l.estado_crm)! } : l)));
    }
    setEditando(false);
  }

  async function moverLead(id: number, nuevoEstado: string) {
    const anterior = leads;
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, estado_crm: nuevoEstado } : l)));
    setError(null);

    try {
      const res = await fetch(apiUrl("/api/leads/estado"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, estado: nuevoEstado }),
      });
      if (!res.ok) throw new Error("No se pudo guardar");
    } catch {
      setLeads(anterior);
      setError("No se pudo mover el lead. Intenta de nuevo.");
    }
  }

  function onDrop(estado: string) {
    setDropZone(null);
    if (dragId == null) return;
    const lead = leads.find((l) => l.id === dragId);
    setDragId(null);
    if (!lead || lead.estado_crm === estado) return;
    startTransition(() => moverLead(lead.id, estado));
  }

  return (
    <div>
      <div className="filtros mb-5">
        <div className="filtro-buscar">
          <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="9" cy="9" r="5.5" /><path d="m13.5 13.5 3 3" />
          </svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar negocio…" className="campo" />
        </div>
        <select
          value={vendedor}
          onChange={(e) => setVendedor(e.target.value)}
          className={`campo filtro${vendedor ? " activo" : ""}`}
          aria-label="Vendedor"
        >
          <option value="">Vendedor: todos</option>
          {vendedores.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <span className="text-[12.5px] text-tinta-3 tnum">
          {filtrados.length} de {leads.length}
        </span>
        <button type="button" onClick={() => setEditando(true)} className="btn-secundario text-[12.5px]">
          Etapas
        </button>
        {enOcultas > 0 && (
          <button
            type="button"
            onClick={() => setVerOcultas((v) => !v)}
            className={`btn-secundario text-[12.5px]${verOcultas ? " activo" : ""}`}
            title="Leads que están en etapas que ocultaste"
          >
            {verOcultas ? "Esconder ocultas" : `Ver ocultas (${enOcultas})`}
          </button>
        )}
        {error && (
          <span
            className="text-[12.5px] ml-auto px-2.5 py-1 rounded-[7px]"
            style={{ background: "var(--rojo-bg)", color: "var(--rojo)" }}
          >
            {error}
          </span>
        )}
      </div>

      <div className="flex gap-3.5 overflow-x-auto pb-2 items-start">
        {visibles.map(({ etapa, estado, leads: col }) => (
          <section key={estado} className="flex-shrink-0 w-[224px]">
            {/* La etapa se marca con una línea de color arriba, no con una caja
                que envuelva las tarjetas (evita card dentro de card). */}
            <div
              className="h-[2px] rounded-full mb-2"
              style={{ background: colorEtapa(etapa) }}
            />
            <div className="flex items-center gap-2 px-0.5 mb-2">
              <h3
                className="eyebrow truncate"
                style={{
                  color:
                    estado === "Requiere Vendedor"
                      ? "var(--rojo)"
                      : estado === "Sin Respuesta"
                      ? "var(--alerta)"
                      : "var(--tinta-2)",
                }}
              >
                {estado}
              </h3>
              {etapa.oculta && <span className="text-[11px] text-tinta-3">oculta</span>}
              <span className="ml-auto text-[12px] font-semibold text-tinta-3 tnum">{col.length}</span>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDropZone(estado);
              }}
              onDragLeave={() => setDropZone((z) => (z === estado ? null : z))}
              onDrop={(e) => {
                e.preventDefault();
                onDrop(estado);
              }}
              className="flex flex-col gap-2 p-1.5 min-h-[56px] rounded-[10px] transicion"
              style={
                dropZone === estado
                  ? { background: "var(--verde-claro)", outline: "1.5px dashed var(--verde)", outlineOffset: -2 }
                  : undefined
              }
            >
              {col.map((l) => {
                const colorV = COLOR_VENDEDOR[l.vendedor_asignado] ?? COLOR_VENDEDOR_DEFAULT;
                return (
                  <article
                    key={l.id}
                    draggable
                    onDragStart={() => setDragId(l.id)}
                    onDragEnd={() => setDragId(null)}
                    className="rounded-[7px] px-2.5 py-2 cursor-grab active:cursor-grabbing transicion"
                    style={{
                      background: "var(--card)",
                      border: "1px solid var(--linea)",
                      opacity: dragId === l.id ? 0.35 : 1,
                    }}
                    title={l.score_resumen ?? l.producto_interes}
                  >
                    <div className="flex items-start gap-1.5">
                      <p className="font-medium text-[12.5px] text-tinta truncate leading-snug flex-1 min-w-0">
                        {l.nombre_negocio}
                      </p>
                      {l.score != null && <Temperatura score={l.score} resumen={l.score_resumen} compacto />}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span
                        className="w-[15px] h-[15px] rounded-[4px] grid place-items-center font-semibold text-[8px] flex-shrink-0"
                        style={{ background: colorV, color: "var(--fondo)" }}
                        title={l.vendedor_asignado}
                      >
                        {l.vendedor_asignado === "Sin asignar" ? "?" : iniciales(l.vendedor_asignado)}
                      </span>
                      <span className="text-[12px] text-tinta-3 truncate">{l.producto_interes}</span>
                    </div>
                  </article>
                );
              })}
              {col.length === 0 && (
                <div className="text-[12px] text-tinta-3 px-1.5 py-2">Sin leads en esta etapa</div>
              )}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-3 text-[12px] text-tinta-3">
        Arrastra las tarjetas entre columnas para mover un lead de etapa. Con «Etapas» puedes ocultar las que no
        uses o crear las tuyas.
      </p>

      {editando && <EditorEtapas etapas={etapas} onGuardado={etapasGuardadas} onClose={() => setEditando(false)} />}
    </div>
  );
}
