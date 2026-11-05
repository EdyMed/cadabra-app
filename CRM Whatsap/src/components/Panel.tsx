// Contenedor de sección. `plano` lo deja sin caja (para cuando ya vive dentro
// de otra superficie) y así se evita el anidamiento de cards. `accion` es el
// slot de la acción secundaria del bloque, alineada al título.
export default function Panel({
  title,
  sub,
  children,
  className,
  accion,
  plano = false,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  className?: string;
  accion?: React.ReactNode;
  plano?: boolean;
}) {
  return (
    <section className={(plano ? "" : "panel ") + "p-4 " + (className ?? "")}>
      <div className="flex items-baseline justify-between gap-3 mb-3.5">
        <div className="min-w-0">
          <h2 className="font-semibold text-[12.5px] text-tinta tracking-[-0.005em]">{title}</h2>
          {sub && <p className="text-[12px] text-tinta-3 mt-0.5">{sub}</p>}
        </div>
        {accion && <div className="flex-shrink-0">{accion}</div>}
      </div>
      {children}
    </section>
  );
}
