"use client";

import { useState } from "react";
import { apiUrl } from "@/lib/api";
import { COLORES, MAX_PROPIAS, PROTEGIDAS, colorEtapa, type Etapa } from "@/lib/etapasComun";

// Editor de etapas del tablero: ordenar, ocultar fijas (salvo las protegidas) y crear/editar/borrar
// hasta MAX_PROPIAS etapas propias. Guarda en /api/oportunidades/etapas (lib/etapas.ts).

const nuevoId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export default function EditorEtapas({
  etapas: iniciales,
  onGuardado,
  onClose,
}: {
  etapas: Etapa[];
  onGuardado: (etapas: Etapa[], renombres: Map<string, string>) => void;
  onClose: () => void;
}) {
  const [etapas, setEtapas] = useState<Etapa[]>(iniciales);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const propias = etapas.filter((e) => !e.fija).length;

  const cambiar = (i: number, cambio: Partial<Etapa>) =>
    setEtapas((prev) => prev.map((e, j) => (j === i ? { ...e, ...cambio } : e)));

  function mover(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= etapas.length) return;
    setEtapas((prev) => {
      const copia = [...prev];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
  }

  function agregar() {
    if (propias >= MAX_PROPIAS) return;
    // Por defecto, justo después de "Cotización Enviada" (la mayoría son pasos del proceso de venta).
    const pos = etapas.findIndex((e) => e.nombre === "Cotización Enviada") + 1 || etapas.length;
    const usados = new Set(etapas.map((e) => e.color));
    const color = COLORES.find((c) => !usados.has(c)) ?? COLORES[0];
    setEtapas((prev) => [...prev.slice(0, pos), { nombre: "", fija: false, id: nuevoId(), color }, ...prev.slice(pos)]);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/oportunidades/etapas"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapas: etapas.map((e) => ({ ...e, nombre: e.nombre.trim() })) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "No se pudo guardar");
      const antes = new Map(iniciales.filter((e) => !e.fija).map((e) => [e.id, e.nombre]));
      const renombres = new Map<string, string>();
      for (const e of data.etapas as Etapa[]) {
        const previo = e.id ? antes.get(e.id) : undefined;
        if (previo && previo !== e.nombre) renombres.set(previo, e.nombre);
      }
      onGuardado(data.etapas, renombres);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      setGuardando(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal p-5 max-w-[560px]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[13px] font-semibold text-tinta">Etapas del tablero</h2>
        <p className="text-[12px] text-tinta-2 mt-1 mb-3.5">
          Las etapas del sistema no se pueden renombrar (de ellas dependen tus métricas y el paso a un vendedor),
          pero puedes ocultar las que no uses. Además puedes crear hasta {MAX_PROPIAS} etapas propias.
        </p>

        <ol className="flex flex-col gap-1.5">
          {etapas.map((e, i) => {
            const protegida = e.fija && PROTEGIDAS.includes(e.nombre);
            return (
              <li
                key={e.id ?? e.nombre}
                className="rounded-[8px] px-2.5 py-2"
                style={{ background: "var(--card)", border: "1px solid var(--linea)", opacity: e.oculta ? 0.55 : 1 }}
              >
                <div className="flex items-center gap-2">
                  <span className="w-[3px] self-stretch rounded-full flex-shrink-0" style={{ background: colorEtapa(e) }} />
                  {e.fija ? (
                    <span className="text-[12.5px] text-tinta flex-1 min-w-0 truncate">
                      {e.nombre}
                      <span className="text-[11px] text-tinta-3 ml-1.5">sistema</span>
                    </span>
                  ) : (
                    <input
                      value={e.nombre}
                      onChange={(ev) => cambiar(i, { nombre: ev.target.value })}
                      placeholder="Nombre de la etapa"
                      maxLength={40}
                      autoFocus={!e.nombre}
                      className="campo text-[12.5px] py-1 flex-1 min-w-0"
                    />
                  )}

                  <button type="button" onClick={() => mover(i, -1)} disabled={i === 0}
                    className="btn-secundario px-1.5 py-0.5 text-[12px]" aria-label="Subir">↑</button>
                  <button type="button" onClick={() => mover(i, 1)} disabled={i === etapas.length - 1}
                    className="btn-secundario px-1.5 py-0.5 text-[12px]" aria-label="Bajar">↓</button>
                  {protegida ? (
                    <span className="text-[11px] text-tinta-3 w-[58px] text-center" title="Siempre visible">fija</span>
                  ) : (
                    <button type="button" onClick={() => cambiar(i, { oculta: !e.oculta })}
                      className="btn-secundario px-1.5 py-0.5 text-[11.5px] w-[58px]">
                      {e.oculta ? "Mostrar" : "Ocultar"}
                    </button>
                  )}
                  {!e.fija && (
                    <button type="button" onClick={() => setEtapas((prev) => prev.filter((_, j) => j !== i))}
                      className="btn-secundario px-1.5 py-0.5 text-[12px]" aria-label="Borrar etapa"
                      style={{ color: "var(--rojo)" }}>✕</button>
                  )}
                </div>

                {!e.fija && (
                  <div className="mt-2 pl-[11px] flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11.5px] text-tinta-3 mr-1">Color</span>
                      {COLORES.map((c) => (
                        <button key={c} type="button" onClick={() => cambiar(i, { color: c })} aria-label={`Color ${c}`}
                          className="w-[16px] h-[16px] rounded-full"
                          style={{ background: c, outline: e.color === c ? "2px solid var(--tinta)" : "none", outlineOffset: 1 }} />
                      ))}
                    </div>
                    <textarea
                      value={e.criterio ?? ""}
                      onChange={(ev) => cambiar(i, { criterio: ev.target.value })}
                      maxLength={300}
                      rows={2}
                      placeholder="Opcional: ¿cuándo debe mover el agente un lead aquí? Ej.: cuando pida fechas del próximo curso"
                      className="campo text-[12px] py-1.5 resize-none"
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <button type="button" onClick={agregar} disabled={propias >= MAX_PROPIAS}
          className="btn-secundario mt-2.5 text-[12.5px] w-full">
          + Agregar etapa ({propias}/{MAX_PROPIAS})
        </button>

        {error && (
          <p className="text-[12.5px] mt-3 px-2.5 py-1.5 rounded-[7px]" style={{ background: "var(--rojo-bg)", color: "var(--rojo)" }}>
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="btn-secundario">Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando} className="btn-primario">
            {guardando ? "Guardando…" : "Guardar etapas"}
          </button>
        </div>
      </div>
    </div>
  );
}
