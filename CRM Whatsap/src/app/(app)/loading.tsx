// Se muestra al instante al cambiar de módulo, mientras el servidor trae los datos
// (Supabase está en EE. UU.: cada consulta tarda ~170 ms de ida y vuelta).
export default function Cargando() {
  const bloque = (h: number) => (
    <div className="rounded-lg animate-pulse" style={{ height: h, background: "var(--card)" }} />
  );
  return (
    <main className="px-5 py-5 max-w-[1400px]" aria-busy="true" aria-label="Cargando">
      <div className="flex items-center gap-2 mb-4 text-tinta-3 text-[12px]">
        <span className="inline-block w-3.5 h-3.5 rounded-full border-2 animate-spin" style={{ borderColor: "var(--verde)", borderTopColor: "transparent" }} />
        Cargando…
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
        {bloque(96)}
        {bloque(96)}
        {bloque(96)}
        {bloque(96)}
      </div>
      <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: "minmax(0,1.55fr) minmax(0,1fr)" }}>
        {bloque(260)}
        {bloque(260)}
      </div>
    </main>
  );
}
