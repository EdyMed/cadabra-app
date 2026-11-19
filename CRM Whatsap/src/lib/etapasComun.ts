// Tipos y constantes de las etapas del tablero, sin acceso a la base: los usan el servidor (lib/etapas.ts)
// y el navegador (TableroOportunidades, EditorEtapas).

// Las 9 etapas del sistema, en su orden. No se renombran ni se borran: de sus nombres dependen las métricas,
// la derivación al vendedor ("Requiere Vendedor" corta el bot) y el agente.
export const FIJAS = [
  "Nuevo Lead",
  "En Conversación",
  "Cotización Enviada",
  "Primer Pedido",
  "Cliente Activo",
  "Cliente Recurrente",
  "Requiere Vendedor",
  "Sin Respuesta",
  "Inactivo",
];

export const MAX_PROPIAS = 4;
// Fijas que no se pueden ocultar: ahí caen los leads nuevos y las derivaciones al vendedor.
export const PROTEGIDAS = ["Nuevo Lead", "Requiere Vendedor"];

export const COLORES = ["#3de0c8", "#42d6d0", "#4fb8b2", "#6fa88c", "#9b7bb8", "#c6a24a", "#c76d78", "#6d8fc7"];

export const COLOR_FIJA: Record<string, string> = {
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

export type Etapa = {
  nombre: string;
  fija: boolean;
  oculta?: boolean;
  id?: string;          // solo propias: identifica la etapa aunque cambie de nombre
  color?: string;       // solo propias
  criterio?: string;    // solo propias: "¿cuándo debe mover el agente un lead aquí?"
};

export const colorEtapa = (e: Etapa) => (e.fija ? COLOR_FIJA[e.nombre] : e.color) ?? "var(--linea-fuerte)";
