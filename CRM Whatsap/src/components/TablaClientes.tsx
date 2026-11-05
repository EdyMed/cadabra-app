"use client";

import { useMemo, useState } from "react";
import type { LeadRow } from "@/lib/metrics";
import Temperatura, { nivelTemperatura } from "@/components/Temperatura";

const ESTADO_COLOR: Record<string, { bg: string; fg: string }> = {
  "Nuevo Lead": { bg: "var(--info-bg)", fg: "var(--info)" },
  "En Conversación": { bg: "var(--verde-claro)", fg: "var(--verde)" },
  "Cotización Enviada": { bg: "var(--verde-claro)", fg: "var(--verde)" },
  "Primer Pedido": { bg: "var(--exito-bg)", fg: "var(--exito)" },
  "Cliente Activo": { bg: "var(--exito-bg)", fg: "var(--exito)" },
  "Cliente Recurrente": { bg: "rgba(155,123,184,.12)", fg: "var(--morado)" },
  "Requiere Vendedor": { bg: "var(--rojo-bg)", fg: "var(--rojo)" },
  "Sin Respuesta": { bg: "var(--alerta-bg)", fg: "var(--alerta)" },
  "Inactivo": { bg: "rgba(255,255,255,.05)", fg: "var(--tinta-3)" },
};

export default function TablaClientes({ leads }: { leads: LeadRow[] }) {
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [temp, setTemp] = useState("");
  const [orden, setOrden] = useState<"recientes" | "calientes">("recientes");

  const estados = useMemo(() => Array.from(new Set(leads.map((l) => l.estado_crm))).sort(), [leads]);
  const vendedores = useMemo(() => Array.from(new Set(leads.map((l) => l.vendedor_asignado))).sort(), [leads]);

  const filtrados = useMemo(() => {
    const t = q.toLowerCase().trim();
    const res = leads.filter((l) => {
      const okQ = !t || l.nombre_negocio.toLowerCase().includes(t) || l.nombre.toLowerCase().includes(t) || l.phone.includes(t);
      const okE = !estado || l.estado_crm === estado;
      const okV = !vendedor || l.vendedor_asignado === vendedor;
      const okT = !temp || nivelTemperatura(l.score) === temp;
      return okQ && okE && okV && okT;
    });
    // "Más calientes": puntaje desc, sin puntaje al final. "Recientes" respeta el orden de la consulta.
    return orden === "calientes" ? [...res].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)) : res;
  }, [leads, q, estado, vendedor, temp, orden]);

  const selectCls = "campo w-auto cursor-pointer";

  return (
    <div>
      {/* Filtros: una sola fila arriba de la tabla */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          id="buscar"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar negocio, nombre o teléfono…"
          className="campo flex-1 min-w-[220px]"
        />
        <select id="f-estado" value={estado} onChange={(e) => setEstado(e.target.value)} className={selectCls}>
          <option value="">Todos los estados</option>
          {estados.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <select id="f-vendedor" value={vendedor} onChange={(e) => setVendedor(e.target.value)} className={selectCls}>
          <option value="">Todos los vendedores</option>
          {vendedores.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <select id="f-temp" value={temp} onChange={(e) => setTemp(e.target.value)} className={selectCls}>
          <option value="">Toda temperatura</option>
          <option value="caliente">🔥 Calientes</option>
          <option value="tibio">Tibios</option>
          <option value="frio">Fríos</option>
          <option value="sin">Sin puntaje</option>
        </select>
        <select id="f-orden" value={orden} onChange={(e) => setOrden(e.target.value as "recientes" | "calientes")} className={selectCls}>
          <option value="recientes">Más recientes</option>
          <option value="calientes">Más calientes primero</option>
        </select>
        <span className="text-[11.5px] text-tinta-3 tnum whitespace-nowrap">
          {filtrados.length} de {leads.length}
        </span>
      </div>

      {/* Tabla */}
      <div className="panel overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th>Negocio</th>
              <th>Contacto</th>
              <th>Comuna</th>
              <th>Producto</th>
              <th title="Puntaje de interés calculado por la IA con lo que el cliente escribió">Temperatura</th>
              <th>Estado</th>
              <th>Vendedor</th>
              <th>Pago</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((l, i) => {
              const c = ESTADO_COLOR[l.estado_crm] ?? { bg: "var(--linea)", fg: "var(--tinta-2)" };
              return (
                <tr key={i}>
                  <td>
                    <span className="text-tinta font-medium">{l.nombre_negocio}</span>
                    {l.nombre !== "—" && <div className="text-[12px] text-tinta-3">{l.nombre}</div>}
                  </td>
                  <td className="tnum">{l.phone}</td>
                  <td>{l.comuna}</td>
                  <td>{l.producto_interes}</td>
                  <td><Temperatura score={l.score} resumen={l.score_resumen} /></td>
                  <td>
                    <span className="pildora" style={{ background: c.bg, color: c.fg }}>
                      {l.estado_crm}
                    </span>
                  </td>
                  <td>{l.vendedor_asignado}</td>
                  <td>{l.condicion_pago}</td>
                </tr>
              );
            })}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-tinta-3">
                  No hay leads que coincidan con tu búsqueda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
