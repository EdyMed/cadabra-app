"use client";

import { useState } from "react";
import type { ConsumoPlan } from "@/lib/metrics";
import { apiUrl } from "@/lib/api";

export default function DatosEmpresa({
  nombreInicial,
  consumo,
}: {
  nombreInicial: string;
  consumo: ConsumoPlan | null;
}) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (!nombre.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/empresa"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre_empresa: nombre }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar");
      setEditando(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)" }}>
      {/* Datos de la empresa */}
      <div className="panel p-4">
        <h2 className="font-semibold text-[12.5px] text-tinta">Datos de la empresa</h2>
        <p className="text-[12px] text-tinta-3 mt-0.5 mb-3.5">Nombre visible en el panel y en tus reportes.</p>

        {editando ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="campo flex-1 min-w-[180px]"
              autoFocus
            />
            <button
              onClick={guardar}
              disabled={guardando || !nombre.trim()}
              className="btn-primario"
            >
              Guardar
            </button>
            <button
              onClick={() => {
                setEditando(false);
                setNombre(nombreInicial);
                setError(null);
              }}
              className="text-[12px] text-tinta-3 px-1.5 transicion hover:text-tinta-2"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="font-medium text-[13px] text-tinta">{nombre}</span>
            <button
              onClick={() => setEditando(true)}
              className="text-[12px] font-semibold transicion hover:opacity-70"
              style={{ color: "var(--verde)" }}
            >
              Editar
            </button>
          </div>
        )}

        {error && (
          <p
            className="text-[11.5px] mt-2.5 px-2.5 py-1.5 rounded-[6px]"
            style={{ background: "var(--rojo-bg)", color: "var(--rojo)" }}
          >
            {error}
          </p>
        )}
      </div>

      {/* Plan */}
      <div className="panel p-4">
        <h2 className="font-semibold text-[12.5px] text-tinta">Tu plan</h2>
        <p className="text-[12px] text-tinta-3 mt-0.5 mb-3.5">Mensajes enviados este mes.</p>

        {consumo ? (
          <>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-[17px] font-semibold text-tinta tracking-[-0.015em]">{consumo.plan}</span>
              <span className="text-[11.5px] text-tinta-3 tnum">
                {consumo.usadas.toLocaleString("es-CL")} / {consumo.limite.toLocaleString("es-CL")}
              </span>
            </div>
            <div className="barra mb-3.5">
              <span
                style={{
                  width: `${consumo.pct}%`,
                  background: consumo.pct >= 80 ? "var(--rojo)" : consumo.pct >= 50 ? "var(--alerta)" : "var(--verde)",
                }}
              />
            </div>
            <a
              href="https://wa.me/56995649108?text=Hola%2C%20quiero%20subir%20de%20plan"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primario inline-block"
            >
              Quiero subir de plan
            </a>
          </>
        ) : (
          <p className="text-tinta-3 text-[12px]">Aún no hay consumo registrado este mes.</p>
        )}
      </div>
    </div>
  );
}
