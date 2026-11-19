"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ConversacionRow, MensajeRow } from "@/lib/metrics";
import { apiUrl } from "@/lib/api";

function formatHora(fecha: string) {
  return new Date(fecha).toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncar(texto: string, n: number) {
  return texto.length > n ? texto.slice(0, n).trim() + "…" : texto;
}

// Solo el estado del embudo decide si espera atención. `bot_activo === false`
// NO sirve aquí: el vendedor apaga el bot justamente para poder responder, así
// que usarlo marcaría como pendientes las conversaciones que ya está atendiendo.
function requiereVendedor(c: ConversacionRow) {
  return c.estado_crm === "Requiere Vendedor";
}

function iniciales(texto: string) {
  const limpio = texto.trim();
  if (!limpio) return "?";
  const partes = limpio.split(/\s+/).slice(0, 2);
  return partes.map((p) => p.charAt(0).toUpperCase()).join("");
}

export default function PanelConversaciones({
  conversaciones: inicial,
}: {
  conversaciones: ConversacionRow[];
}) {
  // La lista llega del servidor al cargar, pero el sondeo la refresca: así el
  // punto de "espera vendedor" se apaga solo cuando alguien responde.
  const [conversaciones, setConversaciones] = useState<ConversacionRow[]>(inicial);
  const [seleccionado, setSeleccionado] = useState<string | null>(conversaciones[0]?.phone_number ?? null);
  const [mensajes, setMensajes] = useState<MensajeRow[]>([]);
  const [cargando, setCargando] = useState(false);
  const [q, setQ] = useState("");
  const [borrador, setBorrador] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [cambiandoBot, setCambiandoBot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // El estado del bot que llega del servidor no se refresca al alternarlo, así
  // que se guarda aquí lo que el vendedor acaba de cambiar.
  const [botLocal, setBotLocal] = useState<Record<string, boolean>>({});

  // Scroll del chat: al abrir una conversación (o enviar) se baja al último mensaje. Cuando llega uno nuevo
  // por el sondeo, solo se baja si el vendedor ya estaba abajo (no lo saca de lo que está leyendo más arriba).
  const chat = useRef<HTMLDivElement>(null);
  const irAlFinal = useRef(true);
  const estabaAbajo = useRef(true);
  useLayoutEffect(() => {
    const el = chat.current;
    if (!el || cargando) return;
    if (irAlFinal.current || estabaAbajo.current) el.scrollTop = el.scrollHeight;
    irAlFinal.current = false;
  }, [mensajes, cargando]);

  const filtradas = useMemo(() => {
    const t = q.toLowerCase().trim();
    if (!t) return conversaciones;
    return conversaciones.filter(
      (c) =>
        (c.nombre_negocio ?? "").toLowerCase().includes(t) ||
        (c.nombre ?? "").toLowerCase().includes(t) ||
        c.phone_number.includes(t)
    );
  }, [conversaciones, q]);

  const actual = useMemo(
    () => conversaciones.find((c) => c.phone_number === seleccionado) ?? null,
    [conversaciones, seleccionado]
  );

  // Cuántas esperan a un humano: es la respuesta a "¿qué requiere mi atención?"
  const pendientes = useMemo(() => conversaciones.filter(requiereVendedor).length, [conversaciones]);

  const botApagado = actual
    ? (botLocal[actual.phone_number] ?? actual.bot_activo !== false) === false
    : false;

  async function abrir(phone: string) {
    irAlFinal.current = true;
    setSeleccionado(phone);
    setCargando(true);
    try {
      const res = await fetch(apiUrl(`/api/conversaciones/${encodeURIComponent(phone)}`));
      const data = await res.json();
      setMensajes(data.mensajes ?? []);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (seleccionado) abrir(seleccionado);
    // solo al montar: abre el primer seleccionado inicial
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sondeo: trae mensajes nuevos de la conversación abierta sin recargar la
  // página. 10s es suficiente para el volumen actual y no necesita websockets.
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        if (seleccionado) {
          const res = await fetch(apiUrl(`/api/conversaciones/${encodeURIComponent(seleccionado)}`));
          const data = await res.json();
          setMensajes((prev) => {
            const nuevos: MensajeRow[] = data.mensajes ?? [];
            return nuevos.length === prev.length ? prev : nuevos;
          });
        }
        const resL = await fetch(apiUrl("/api/conversaciones"));
        const dataL = await resL.json();
        if (Array.isArray(dataL.conversaciones)) setConversaciones(dataL.conversaciones);
      } catch {
        // Un fallo puntual de red no debe romper el panel; reintenta al próximo tick.
      }
    }, 10000);
    return () => clearInterval(t);
  }, [seleccionado]);

  async function alternarBot() {
    if (!actual) return;
    const encender = botApagado;
    setCambiandoBot(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/conversaciones/bot"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: actual.phone_number, activo: encender }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error || `El servidor respondió ${res.status}`);
      }
      setBotLocal((prev) => ({ ...prev, [actual.phone_number]: encender }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el bot");
    } finally {
      setCambiandoBot(false);
    }
  }

  async function enviar() {
    const texto = borrador.trim();
    if (!actual || !texto) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/conversaciones/enviar"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: actual.phone_number, texto }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error || `El servidor respondió ${res.status}`);
      }
      setBorrador("");
      await abrir(actual.phone_number);
      // Refresca la lista ya: el lead acaba de salir de "Requiere Vendedor".
      try {
        const rl = await fetch(apiUrl("/api/conversaciones"));
        const dl = await rl.json();
        if (Array.isArray(dl.conversaciones)) setConversaciones(dl.conversaciones);
      } catch {
        // el sondeo lo recoge al próximo tick
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar");
    } finally {
      setEnviando(false);
    }
  }

  if (conversaciones.length === 0) {
    return (
      <div className="panel px-8 py-14 text-center">
        <p className="text-tinta text-[13px] font-medium">No tienes conversaciones todavía.</p>
        <p className="text-tinta-3 text-[12px] mt-1">
          Aquí aparecerán los chats en cuanto alguien escriba a tu WhatsApp.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "280px minmax(0,1fr)" }}>
      {/* Bandeja */}
      <div className="panel flex flex-col overflow-hidden" style={{ height: 680 }}>
        <div className="p-2.5 border-b flex flex-col gap-2" style={{ borderColor: "var(--linea)" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar negocio, nombre o teléfono…"
            className="campo"
          />
          {pendientes > 0 && (
            <div className="flex items-center gap-1.5 text-[12px] font-semibold px-0.5" style={{ color: "var(--alerta)" }}>
              <span className="punto" style={{ background: "var(--alerta)" }} />
              {pendientes} {pendientes === 1 ? "espera" : "esperan"} a un vendedor
            </div>
          )}
        </div>

        <div className="overflow-y-auto flex-1">
          {filtradas.map((c) => {
            const activo = seleccionado === c.phone_number;
            const urgente = requiereVendedor(c);
            return (
              <button
                key={c.phone_number}
                onClick={() => abrir(c.phone_number)}
                className="relative w-full text-left px-3 py-2.5 border-b transicion"
                style={{
                  borderColor: "var(--linea)",
                  background: activo ? "var(--card-2)" : undefined,
                }}
              >
                {activo && (
                  <span
                    className="absolute left-0 top-0 bottom-0 w-[2px]"
                    style={{ background: "var(--verde)" }}
                  />
                )}
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="flex items-center gap-1.5 min-w-0">
                    {urgente && (
                      <span className="punto" style={{ background: "var(--alerta)" }} title="Requiere vendedor" />
                    )}
                    <span
                      className="text-[12.5px] truncate"
                      style={{ color: "var(--tinta)", fontWeight: activo ? 600 : 500 }}
                    >
                      {c.nombre_negocio?.trim() || c.phone_number}
                    </span>
                  </span>
                  <span className="text-[10.5px] text-tinta-3 tnum whitespace-nowrap flex-shrink-0">
                    {formatHora(c.ultima_fecha)}
                  </span>
                </div>
                <p className="text-[11.5px] text-tinta-3 truncate">
                  {c.ultimo_rol === "user" ? "" : "Sofía: "}
                  {truncar(c.ultimo_mensaje, 52)}
                </p>
              </button>
            );
          })}
          {filtradas.length === 0 && (
            <p className="text-[12px] text-tinta-3 p-5 text-center">No encontramos resultados.</p>
          )}
        </div>
      </div>

      {/* Conversación */}
      <div className="panel flex flex-col overflow-hidden" style={{ height: 680 }}>
        {/* Con quién hablo y quién tiene el control ahora */}
        {actual && (
          <div
            className="flex items-center gap-2.5 px-3.5 py-2.5 border-b flex-shrink-0"
            style={{ borderColor: "var(--linea)", background: "var(--card-2)" }}
          >
            <span
              className="grid place-items-center rounded-[6px] text-[10.5px] font-semibold flex-shrink-0"
              style={{ width: 28, height: 28, background: "var(--verde-claro)", color: "var(--verde)" }}
              aria-hidden
            >
              {iniciales(actual.nombre_negocio?.trim() || actual.nombre?.trim() || actual.phone_number)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-[12.5px] text-tinta truncate">
                {actual.nombre_negocio?.trim() || actual.phone_number}
              </div>
              <div className="text-[12px] text-tinta-3 tnum truncate">
                {actual.phone_number}
                {actual.nombre ? ` · ${actual.nombre}` : ""}
              </div>
            </div>
            <button
              onClick={alternarBot}
              disabled={cambiandoBot}
              title={botApagado ? "Volver a dejar que el bot atienda" : "Apagar el bot y atender tú"}
              className="pildora flex-shrink-0 transicion"
              style={{
                cursor: cambiandoBot ? "wait" : "pointer",
                border: "1px solid transparent",
                ...(botApagado
                  ? { background: "var(--alerta-bg)", color: "var(--alerta)" }
                  : { background: "var(--verde-claro)", color: "var(--verde)" }),
              }}
            >
              <span
                className="punto"
                style={{ background: botApagado ? "var(--alerta)" : "var(--verde)" }}
              />
              {cambiandoBot
                ? "Cambiando…"
                : botApagado
                ? "Bot apagado · activar"
                : "Bot activo · apagar"}
            </button>
          </div>
        )}

        <div
          ref={chat}
          onScroll={(e) => {
            const el = e.currentTarget;
            estabaAbajo.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="flex-1 overflow-y-auto p-4 flex flex-col gap-2"
        >
          {cargando && (
            <div className="flex flex-col gap-2.5">
              <div className="esqueleto h-[38px] w-[45%]" />
              <div className="esqueleto h-[52px] w-[60%] self-end" />
              <div className="esqueleto h-[38px] w-[40%]" />
            </div>
          )}
          {!cargando &&
            mensajes.map((m, i) => {
              const delCliente = m.role === "user";
              return (
                <div
                  key={i}
                  className="max-w-[68%] rounded-[8px] px-3 py-2 text-[12.5px]"
                  style={{
                    alignSelf: delCliente ? "flex-start" : "flex-end",
                    background: delCliente ? "var(--card-2)" : "var(--verde-claro)",
                    border: `1px solid ${delCliente ? "var(--linea)" : "var(--verde-borde)"}`,
                  }}
                >
                  <p className="whitespace-pre-wrap text-tinta leading-[1.5]">{m.content}</p>
                  <p
                    className="text-[10px] mt-1 tnum"
                    style={{ color: delCliente ? "var(--tinta-3)" : "var(--verde)" }}
                  >
                    {delCliente ? "" : m.role === "vendedor" ? "Tu equipo · " : "Sofía · "}
                    {formatHora(m.created_at)}
                  </p>
                </div>
              );
            })}
          {!cargando && mensajes.length === 0 && (
            <p className="text-tinta-3 text-[12px] m-auto">Selecciona una conversación para verla.</p>
          )}
        </div>

        {actual && (
          <div
            className="flex-shrink-0 border-t p-2.5"
            style={{ borderColor: "var(--linea)", background: "var(--card-2)" }}
          >
            {error && (
              <p
                className="text-[11.5px] px-2.5 py-1.5 mb-2 rounded-[6px]"
                style={{ background: "var(--rojo-bg)", color: "var(--rojo)" }}
              >
                {error}
              </p>
            )}
            {!botApagado && (
              <p className="text-[11.5px] text-tinta-3 mb-2 px-0.5">
                El bot está atendiendo. Apágalo arriba si quieres responder tú.
              </p>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={borrador}
                onChange={(e) => setBorrador(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    enviar();
                  }
                }}
                disabled={!botApagado || enviando}
                rows={2}
                placeholder={
                  botApagado ? "Escribe tu respuesta… (Enter envía, Shift+Enter salta línea)" : "Apaga el bot para responder"
                }
                className="campo flex-1 resize-none py-2 leading-snug"
              />
              <button
                onClick={enviar}
                disabled={!botApagado || enviando || !borrador.trim()}
                className="btn-primario flex-shrink-0"
                style={{ opacity: !botApagado || !borrador.trim() ? 0.45 : 1 }}
              >
                {enviando ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
