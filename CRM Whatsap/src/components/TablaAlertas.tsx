import type { AlertaLead } from "@/lib/metrics";

const BADGE: Record<string, { bg: string; fg: string }> = {
  "Sin Respuesta": { bg: "var(--alerta-bg)", fg: "var(--alerta)" },
  "Requiere Vendedor": { bg: "var(--rojo-bg)", fg: "var(--rojo)" },
  "Cotización Enviada": { bg: "var(--verde-claro)", fg: "var(--verde)" },
  "Cliente Activo": { bg: "var(--exito-bg)", fg: "var(--exito)" },
  "Nuevo Lead": { bg: "var(--info-bg)", fg: "var(--info)" },
};

export default function TablaAlertas({
  rows,
  mostrarEstado = false,
  vacio = "Nada por ahora.",
}: {
  rows: AlertaLead[];
  mostrarEstado?: boolean;
  vacio?: string;
}) {
  if (!rows.length) {
    return <p className="text-tinta-3 text-[12px] py-2">{vacio}</p>;
  }
  return (
    <div className="overflow-x-auto -mx-4 -mb-4">
      <table className="tabla">
        <thead>
          <tr>
            <th>Negocio</th>
            <th>Contacto</th>
            {mostrarEstado && <th>Estado</th>}
            <th>Vendedor</th>
            <th style={{ textAlign: "right" }}>Días</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const badge = BADGE[r.estado_crm];
            return (
              <tr key={i}>
                <td>
                  <span className="text-tinta font-medium">{r.nombre_negocio}</span>
                </td>
                <td className="tnum">{r.phone}</td>
                {mostrarEstado && (
                  <td>
                    <span
                      className="pildora"
                      style={{ background: badge?.bg ?? "var(--linea)", color: badge?.fg ?? "var(--tinta-2)" }}
                    >
                      {r.estado_crm}
                    </span>
                  </td>
                )}
                <td>{r.vendedor_asignado}</td>
                <td
                  className="text-right tnum font-bold"
                  style={{ color: r.dias >= 5 ? "var(--alerta)" : "var(--tinta)" }}
                >
                  {r.dias}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
