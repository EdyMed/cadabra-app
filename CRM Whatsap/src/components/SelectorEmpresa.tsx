"use client";

import { useRouter } from "next/navigation";

// Cambia de empresa dentro de la Ficha del agente (solo admin).
export default function SelectorEmpresa({ actual, empresas }: { actual: number; empresas: { empresa: number; nombre: string }[] }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2">
      <span className="eyebrow">Empresa</span>
      <select
        className="campo py-1.5 w-auto cursor-pointer"
        value={actual}
        onChange={(e) => router.push(`/admin/agente/${e.target.value}`)}
      >
        {empresas.map((e) => (
          <option key={e.empresa} value={e.empresa}>{e.nombre}</option>
        ))}
      </select>
    </label>
  );
}
