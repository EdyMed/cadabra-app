"use client";

// Abre el diálogo de impresión del navegador; ahí se elige "Guardar como PDF".
export default function BotonImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="px-3 py-1.5 rounded font-medium text-[12px]"
      style={{ background: "var(--verde)", color: "#06110f" }}
    >
      Descargar PDF
    </button>
  );
}
