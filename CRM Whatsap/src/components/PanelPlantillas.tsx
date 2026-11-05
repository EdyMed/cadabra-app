"use client";

import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "@/lib/api";
import type { Plantilla } from "@/lib/whatsapp";

const ESTADOS: Record<string, { label: string; color: string; bg: string }> = {
  APPROVED: { label: "Aprobada", color: "var(--exito)", bg: "var(--exito-bg)" },
  PENDING: { label: "En revisión", color: "var(--alerta)", bg: "var(--alerta-bg)" },
  REJECTED: { label: "Rechazada", color: "var(--rojo)", bg: "var(--rojo-bg)" },
  PAUSED: { label: "Pausada", color: "var(--tinta-3)", bg: "rgba(255,255,255,.05)" },
  DISABLED: { label: "Desactivada", color: "var(--tinta-3)", bg: "rgba(255,255,255,.05)" },
};

const CATEGORIAS: Record<string, string> = { UTILITY: "Utilidad", MARKETING: "Marketing", AUTHENTICATION: "Autenticación" };

// Variables {{n}} distintas en orden de aparición (espejo de lib/whatsapp, que es server-only).
function variablesDe(texto: string): number[] {
  const nums = Array.from(texto.matchAll(/\{\{\s*(\d+)\s*\}\}/g), (m) => Number(m[1]));
  return Array.from(new Set(nums));
}

// Nombre técnico que exige Meta: minúsculas, números y guion bajo.
function normalizarNombre(texto: string) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+/, "")
    .slice(0, 512);
}

function textoDe(p: Plantilla, tipo: string) {
  return p.components.find((c) => c.type === tipo)?.text ?? "";
}

function Burbuja({ header, body, footer }: { header?: string; body: string; footer?: string }) {
  return (
    <div className="rounded-[10px] p-4" style={{ background: "#0b141a", border: "1px solid var(--linea)" }}>
      <div
        className="max-w-[320px] rounded-[8px] rounded-tl-[2px] px-3 py-2 text-[13px] leading-[1.45]"
        style={{ background: "#202c33", color: "#e9edef" }}
      >
        {header && <div className="font-semibold mb-1">{header}</div>}
        <div className="whitespace-pre-wrap break-words">{body || <span style={{ color: "#8696a0" }}>El texto de tu mensaje…</span>}</div>
        {footer && <div className="text-[11.5px] mt-1.5" style={{ color: "#8696a0" }}>{footer}</div>}
        <div className="text-right text-[10.5px] mt-0.5" style={{ color: "#8696a0" }}>10:24</div>
      </div>
    </div>
  );
}

export default function PanelPlantillas() {
  const [plantillas, setPlantillas] = useState<Plantilla[] | null>(null);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [actualizando, setActualizando] = useState(false);

  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState<"UTILITY" | "MARKETING">("UTILITY");
  const [idioma, setIdioma] = useState("es");
  const [header, setHeader] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [footer, setFooter] = useState("");
  const [ejemplos, setEjemplos] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const vars = useMemo(() => variablesDe(cuerpo), [cuerpo]);

  // La vista previa reemplaza cada {{n}} por su ejemplo, como lo verá el cliente.
  const vistaPrevia = useMemo(
    () => cuerpo.replace(/\{\{\s*(\d+)\s*\}\}/g, (m, n) => ejemplos[Number(n) - 1] || m),
    [cuerpo, ejemplos]
  );

  async function cargar() {
    setActualizando(true);
    try {
      const res = await fetch(apiUrl("/api/plantillas"), { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudieron cargar las plantillas.");
      setPlantillas(data.plantillas);
      setErrorLista(null);
    } catch (e) {
      setErrorLista(e instanceof Error ? e.message : "No se pudieron cargar las plantillas.");
    } finally {
      setActualizando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  function insertarVariable() {
    const siguiente = vars.length + 1;
    setCuerpo((c) => `${c}{{${siguiente}}}`);
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    setExito(null);
    try {
      const res = await fetch(apiUrl("/api/plantillas"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nombre,
          category: categoria,
          language: idioma,
          header,
          body: cuerpo,
          footer,
          ejemplos: vars.map((_, i) => ejemplos[i] ?? ""),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear la plantilla.");
      setExito(`Plantilla "${nombre}" enviada a revisión de WhatsApp.`);
      setNombre("");
      setHeader("");
      setCuerpo("");
      setFooter("");
      setEjemplos([]);
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la plantilla.");
    } finally {
      setEnviando(false);
    }
  }

  const puedeEnviar =
    !!nombre && !!cuerpo.trim() && vars.every((_, i) => (ejemplos[i] ?? "").trim()) && !enviando;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-start">
      {/* Formulario */}
      <form onSubmit={crear} className="panel p-4 flex flex-col gap-3.5">
        <div>
          <h2 className="font-semibold text-[12.5px] text-tinta">Nueva plantilla</h2>
          <p className="text-[12px] text-tinta-3 mt-0.5">WhatsApp la revisa antes de que puedas usarla, normalmente en minutos.</p>
        </div>

        <label className="flex flex-col gap-1">
          <span className="eyebrow">Nombre</span>
          <input
            className="campo"
            value={nombre}
            onChange={(e) => setNombre(normalizarNombre(e.target.value))}
            placeholder="confirmacion_cita"
            required
          />
          <span className="text-[11px] text-tinta-3">Solo minúsculas, números y guion bajo.</span>
        </label>

        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Categoría</span>
            <select className="campo" value={categoria} onChange={(e) => setCategoria(e.target.value as "UTILITY" | "MARKETING")}>
              <option value="UTILITY">Utilidad (citas, pedidos, avisos)</option>
              <option value="MARKETING">Marketing (ofertas, novedades)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Idioma</span>
            <select className="campo" value={idioma} onChange={(e) => setIdioma(e.target.value)}>
              <option value="es">Español</option>
              <option value="es_CL">Español (Chile)</option>
              <option value="en_US">Inglés (EE. UU.)</option>
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="eyebrow">Encabezado (opcional)</span>
          <input className="campo" value={header} maxLength={60} onChange={(e) => setHeader(e.target.value)} placeholder="Recordatorio de tu cita" />
        </label>

        <label className="flex flex-col gap-1">
          <span className="flex items-center justify-between">
            <span className="eyebrow">Cuerpo</span>
            <button type="button" onClick={insertarVariable} className="text-[11.5px] text-verde hover:underline">
              + Agregar variable
            </button>
          </span>
          <textarea
            className="campo min-h-[110px] py-2 leading-[1.5]"
            value={cuerpo}
            maxLength={1024}
            onChange={(e) => setCuerpo(e.target.value)}
            placeholder="Hola {{1}}, te recordamos tu cita para el {{2}}. Responde SÍ para confirmar."
            required
          />
          <span className="text-[11px] text-tinta-3 tnum">{cuerpo.length}/1024 · Las variables {"{{1}}"}, {"{{2}}"}… se reemplazan al enviar.</span>
        </label>

        {vars.length > 0 && (
          <div className="flex flex-col gap-2 p-3 rounded-[6px]" style={{ background: "var(--card-2)", border: "1px solid var(--linea)" }}>
            <span className="eyebrow">Ejemplos para la revisión de WhatsApp</span>
            {vars.map((n, i) => (
              <label key={n} className="flex items-center gap-2">
                <span className="text-[12px] text-tinta-2 tnum w-10">{`{{${n}}}`}</span>
                <input
                  className="campo flex-1"
                  value={ejemplos[i] ?? ""}
                  onChange={(e) => setEjemplos((prev) => {
                    const copia = [...prev];
                    copia[i] = e.target.value;
                    return copia;
                  })}
                  placeholder={i === 0 ? "María" : "viernes 31 a las 10:00"}
                  required
                />
              </label>
            ))}
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className="eyebrow">Pie (opcional)</span>
          <input className="campo" value={footer} maxLength={60} onChange={(e) => setFooter(e.target.value)} placeholder="Cadabra · Responde STOP para no recibir más" />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="eyebrow">Vista previa</span>
          <Burbuja header={header} body={vistaPrevia} footer={footer} />
        </div>

        {error && (
          <p className="text-[11.5px] px-2.5 py-1.5 rounded-[6px]" style={{ background: "var(--rojo-bg)", color: "var(--rojo)" }}>
            {error}
          </p>
        )}
        {exito && (
          <p className="text-[11.5px] px-2.5 py-1.5 rounded-[6px]" style={{ background: "var(--exito-bg)", color: "var(--exito)" }}>
            {exito}
          </p>
        )}

        <button type="submit" disabled={!puedeEnviar} className="btn-primario self-start">
          {enviando ? "Enviando…" : "Crear y enviar a revisión"}
        </button>
      </form>

      {/* Lista */}
      <div className="panel p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="font-semibold text-[12.5px] text-tinta">Tus plantillas</h2>
            <p className="text-[12px] text-tinta-3 mt-0.5">Estado sincronizado con WhatsApp.</p>
          </div>
          <button onClick={cargar} disabled={actualizando} className="btn-secundario">
            {actualizando ? "Actualizando…" : "Actualizar"}
          </button>
        </div>

        {errorLista && (
          <p className="text-[12px] px-3 py-2 rounded-[6px]" style={{ background: "var(--alerta-bg)", color: "var(--tinta-2)" }}>
            {errorLista}
          </p>
        )}

        {!plantillas && !errorLista && (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => <div key={i} className="esqueleto h-[58px] rounded-[6px]" />)}
          </div>
        )}

        {plantillas && plantillas.length === 0 && (
          <p className="text-[12px] text-tinta-3 py-6 text-center">Aún no tienes plantillas. Crea la primera con el formulario.</p>
        )}

        {plantillas && plantillas.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {plantillas.map((p) => {
              const est = ESTADOS[p.status] ?? { label: p.status, color: "var(--tinta-3)", bg: "rgba(255,255,255,.05)" };
              return (
                <div key={p.id} className="px-3 py-2.5 rounded-[6px]" style={{ background: "var(--card-2)", border: "1px solid var(--linea)" }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-[12.5px] text-tinta">{p.name}</span>
                    <span className="pildora" style={{ background: est.bg, color: est.color }}>{est.label}</span>
                    <span className="text-[11px] text-tinta-3 ml-auto">
                      {CATEGORIAS[p.category] ?? p.category} · {p.language}
                    </span>
                  </div>
                  <p className="text-[12px] text-tinta-2 mt-1 line-clamp-2 whitespace-pre-wrap">{textoDe(p, "BODY")}</p>
                  {p.status === "REJECTED" && p.rejected_reason && p.rejected_reason !== "NONE" && (
                    <p className="text-[11px] mt-1" style={{ color: "var(--rojo)" }}>Motivo: {p.rejected_reason}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
