"use client";

import { useState } from "react";
import type { VendedorLista } from "@/lib/metrics";
import { apiUrl } from "@/lib/api";

export default function GestionVendedores({
  vendedores: iniciales,
  tope,
  plan,
}: {
  vendedores: VendedorLista[];
  tope: number;
  plan: string | null;
}) {
  const [vendedores, setVendedores] = useState(iniciales);
  const [nombre, setNombre] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activos = vendedores.filter((v) => v.activo).length;
  const hayTope = Number.isFinite(tope);
  const enTope = hayTope && activos >= tope;

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/vendedores"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, whatsapp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar");
      setVendedores((prev) => [...prev, { id: data.id, nombre, whatsapp, activo: true }]);
      setNombre("");
      setWhatsapp("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(v: VendedorLista) {
    const anterior = vendedores;
    setError(null);
    setVendedores((prev) => prev.map((x) => (x.id === v.id ? { ...x, activo: !x.activo } : x)));
    try {
      const res = await fetch(apiUrl("/api/vendedores"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: v.id, activo: !v.activo }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "No se pudo actualizar el vendedor.");
      }
    } catch (e) {
      setVendedores(anterior);
      setError(e instanceof Error ? e.message : "No se pudo actualizar el vendedor.");
    }
  }

  async function eliminar(v: VendedorLista) {
    if (!confirm(`¿Eliminar a ${v.nombre}?`)) return;
    const anterior = vendedores;
    setVendedores((prev) => prev.filter((x) => x.id !== v.id));
    try {
      const res = await fetch(apiUrl("/api/vendedores"), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: v.id }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setVendedores(anterior);
      setError("No se pudo eliminar el vendedor.");
    }
  }

  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold text-[12.5px] text-tinta">Vendedores</h2>
        {hayTope && (
          <span
            className="pildora tnum"
            style={{
              background: enTope ? "var(--alerta-bg)" : "var(--verde-claro)",
              color: enTope ? "var(--alerta)" : "var(--verde)",
            }}
          >
            {activos} de {tope} activos
          </span>
        )}
      </div>
      <p className="text-[12px] text-tinta-3 mt-0.5 mb-3.5">
        Reciben alertas por WhatsApp cuando un lead pide hablar con un vendedor.
      </p>

      {enTope && (
        <div
          className="flex items-start gap-2 text-[11.5px] mb-3.5 px-3 py-2 rounded-[6px]"
          style={{
            background: "var(--alerta-bg)",
            border: "1px solid rgba(198,162,74,.3)",
            color: "var(--tinta-2)",
          }}
        >
          <svg viewBox="0 0 20 20" width="14" height="14" className="flex-shrink-0 mt-px" fill="var(--alerta)">
            <path d="M10 2.5a7.5 7.5 0 100 15 7.5 7.5 0 000-15zM9.1 6.2h1.8v5.2H9.1V6.2zm0 6.4h1.8v1.8H9.1v-1.8z" />
          </svg>
          <span>
            Llegaste al máximo de <b style={{ color: "var(--alerta)" }}>{tope} vendedores</b> de tu plan{" "}
            {plan}. Desactiva un vendedor para liberar un cupo, o cambia de plan para sumar más.
          </span>
        </div>
      )}

      <form onSubmit={agregar} className="flex flex-wrap items-center gap-2 mb-3.5">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre"
          disabled={enTope}
          className="campo flex-1 min-w-[140px]"
        />
        <input
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder="WhatsApp (569XXXXXXXX)"
          disabled={enTope}
          className="campo flex-1 min-w-[160px]"
        />
        <button
          type="submit"
          disabled={guardando || !nombre.trim() || enTope}
          className="btn-primario whitespace-nowrap"
        >
          Agregar
        </button>
      </form>

      {error && (
        <p
          className="text-[11.5px] mb-3 px-2.5 py-1.5 rounded-[6px]"
          style={{ background: "var(--rojo-bg)", color: "var(--rojo)" }}
        >
          {error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        {vendedores.map((v) => (
          <div
            key={v.id}
            className="flex items-center gap-2.5 px-3 py-2 rounded-[6px] transicion"
            style={{ background: "var(--card-2)", border: "1px solid var(--linea)" }}
          >
            <span
              className="punto"
              style={{ background: v.activo ? "var(--verde)" : "var(--tinta-3)" }}
            />
            <span className="font-medium text-[12.5px] text-tinta flex-1 min-w-0 truncate">{v.nombre}</span>
            <span className="text-[11.5px] text-tinta-3 tnum">{v.whatsapp || "—"}</span>
            <button
              onClick={() => toggleActivo(v)}
              className="pildora transicion"
              style={{
                background: v.activo ? "var(--verde-claro)" : "rgba(255,255,255,.05)",
                color: v.activo ? "var(--verde)" : "var(--tinta-3)",
              }}
            >
              {v.activo ? "Activo" : "Inactivo"}
            </button>
            <button
              onClick={() => eliminar(v)}
              className="text-[13px] text-tinta-3 hover:text-rojo transicion px-0.5 leading-none"
              title="Eliminar vendedor"
              aria-label={`Eliminar a ${v.nombre}`}
            >
              ×
            </button>
          </div>
        ))}
        {vendedores.length === 0 && (
          <p className="text-[12px] text-tinta-3 py-3 text-center">
            Aún no has agregado vendedores.
          </p>
        )}
      </div>
    </div>
  );
}
