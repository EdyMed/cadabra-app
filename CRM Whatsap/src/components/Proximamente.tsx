export default function Proximamente({ titulo }: { titulo: string }) {
  return (
    <main className="px-[26px] md:px-9 py-7 max-w-[1240px] aparecer">
      <h1 className="titulo-pagina mb-4">{titulo}</h1>
      <div className="panel px-8 py-14 text-center">
        <span
          className="grid place-items-center rounded-full mx-auto mb-4"
          style={{ width: 44, height: 44, background: "var(--verde-claro)" }}
        >
          <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="var(--verde)" strokeWidth="1.7" strokeLinecap="round">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 1.8" />
          </svg>
        </span>
        <p className="text-tinta text-[13px] font-medium mb-1">
          Esta sección estará disponible en una próxima entrega.
        </p>
        <p className="text-tinta-3 text-[13px]">Por ahora, revisa el Resumen con tus resultados en vivo.</p>
      </div>
    </main>
  );
}
