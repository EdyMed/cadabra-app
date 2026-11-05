const COLORS: Record<string, string> = {
  "Nuevo Lead": "#3de0c8",
  "En Conversación": "#4fb8b2",
  "Cotización Enviada": "#42d6d0",
  "Primer Pedido": "#6fa88c",
  "Cliente Activo": "#6fa88c",
  "Cliente Recurrente": "#9b7bb8",
  "Requiere Vendedor": "#c76d78",
  "Sin Respuesta": "#c6a24a",
  "Inactivo": "#555e68",
};

export default function Embudo({ data }: { data: { estado: string; cantidad: number }[] }) {
  const total = data.reduce((s, d) => s + d.cantidad, 0) || 1;
  const max = Math.max(1, ...data.map((d) => d.cantidad));

  return (
    <div className="flex flex-col gap-2">
      {data.map((d) => {
        const color = COLORS[d.estado] ?? "var(--verde)";
        const pctDelTotal = Math.round((d.cantidad / total) * 100);
        return (
          <div
            key={d.estado}
            className="grid items-center gap-2.5"
            style={{ gridTemplateColumns: "118px 1fr 40px" }}
          >
            <span className="text-[11.5px] text-tinta-2 truncate" title={d.estado}>
              {d.estado}
            </span>
            {/* Carril de fondo + barra: el ancho compara contra el estado más
                poblado, la pastilla muestra el peso sobre el total. */}
            <span className="barra" style={{ height: 5 }}>
              <span
                style={{ width: `${Math.round((d.cantidad / max) * 100)}%`, background: color }}
              />
            </span>
            <span
              className="text-[10.5px] font-semibold text-center tnum rounded-[4px] py-0.5"
              style={{ color, background: "var(--card-3)" }}
              title={`${d.cantidad} de ${total}`}
            >
              {pctDelTotal}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
