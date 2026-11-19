"use client";

import { useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api";
import type { CuentaWhatsapp } from "@/lib/conexionWhatsapp";

// Conectar WhatsApp (Embedded Signup de Meta, versión 5). El cliente elige antes cómo:
//   - "nuevo": un número sin WhatsApp; Meta lo verifica por SMS o llamada (flujo normal);
//   - "app": el número que YA usa en la app WhatsApp Business; escanea un QR desde la app y
//     queda en COEXISTENCIA (sigue usando su app y además atiende el agente).
// La coexistencia se pide con featureType solo en el modo "app": con featureType el flujo de Meta
// puede quedar SOLO para coexistencia y no permitir números nuevos. Meta entrega dos cosas:
//   - el código de autorización, en el callback de FB.login (vive 30 s)
//   - los IDs de la cuenta y del número, por postMessage desde facebook.com
// Cuando llegan ambas se envían al servidor para completar la conexión.

const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID ?? "";
const CONFIG_ID = process.env.NEXT_PUBLIC_META_ES_CONFIG_ID ?? "";
const VERSION = "v23.0";

type Modo = "nuevo" | "app";

// extras del Embedded Signup según el modo (ver comentario de arriba).
const EXTRAS: Record<Modo, Record<string, unknown>> = {
  nuevo: { setup: {}, version: "v5" },
  app: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3", version: "v5" },
};

type Sesion = { waba_id: string; phone_number_id?: string; business_id?: string; is_on_biz_app?: boolean };

// v5 entrega messaging_account_ids (reemplaza a waba_id); v3/v4 entregaban waba_id.
function normalizarSesion(data: any): Sesion | null {
  const waba = data?.waba_id ?? (Array.isArray(data?.messaging_account_ids) ? data.messaging_account_ids[0] : undefined);
  if (!waba) return null;
  return { waba_id: String(waba), phone_number_id: data?.phone_number_id, business_id: data?.business_id, is_on_biz_app: data?.is_on_biz_app === true };
}

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

function cargarSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve();
    window.fbAsyncInit = () => {
      window.FB.init({ appId: APP_ID, autoLogAppEvents: true, xfbml: false, version: VERSION });
      resolve();
    };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/es_LA/sdk.js";
    s.async = true;
    s.defer = true;
    s.crossOrigin = "anonymous";
    s.onerror = () => reject(new Error("No se pudo cargar el SDK de Meta (¿bloqueador de anuncios?)."));
    document.body.appendChild(s);
  });
}

function formatoFecha(f: string) {
  return new Date(f).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ConectarWhatsapp({ cuenta: inicial }: { cuenta: CuentaWhatsapp | null }) {
  const [cuenta, setCuenta] = useState(inicial);
  const [estado, setEstado] = useState<"idle" | "abriendo" | "conectando">("idle");
  const [modo, setModo] = useState<Modo | null>(null);   // con qué botón se abrió Meta
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const codigo = useRef<string | null>(null);
  const sesion = useRef<Sesion | null>(null);

  const configurado = !!APP_ID && !!CONFIG_ID;

  async function completar() {
    if (!codigo.current || !sesion.current) return;
    const code = codigo.current;
    const datos = sesion.current;
    codigo.current = null;
    sesion.current = null;
    setEstado("conectando");
    try {
      const res = await fetch(apiUrl("/api/whatsapp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, ...datos }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo conectar.");
      setCuenta(data.cuenta);
      setAvisos(data.avisos ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo conectar.");
    } finally {
      setEstado("idle");
    }
  }

  // IDs que Meta envía al terminar el flujo (o aviso de cancelación/error).
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (!ev.origin.endsWith("facebook.com")) return;
      let msg: any;
      try {
        msg = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
      } catch {
        return;
      }
      if (msg?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (msg.event === "FINISH" || msg.event === "FINISH_ONLY_WABA" || msg.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
        const s = normalizarSesion(msg.data);
        if (!s) { setEstado("idle"); setError("Meta no devolvió la cuenta de WhatsApp."); return; }
        if (msg.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") s.is_on_biz_app = true;
        sesion.current = s;
        completar();
      } else if (msg.event === "CANCEL") {
        setEstado("idle");
        setError(msg.data?.current_step ? "Cerraste la ventana de Meta antes de terminar." : null);
      } else if (msg.event === "ERROR") {
        setEstado("idle");
        setError(msg.data?.error_message ?? "Meta reportó un error en la conexión.");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function conectar(m: Modo) {
    setError(null);
    setAvisos([]);
    setModo(m);
    setEstado("abriendo");
    try {
      await cargarSdk();
    } catch (e) {
      setEstado("idle");
      setError(e instanceof Error ? e.message : "No se pudo cargar el SDK de Meta.");
      return;
    }
    window.FB.login(
      (resp: any) => {
        const code = resp?.authResponse?.code;
        if (!code) {
          setEstado("idle");
          return;
        }
        codigo.current = code;
        completar();
      },
      {
        config_id: CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: EXTRAS[m],
      }
    );
  }

  const ocupado = estado !== "idle";

  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[12.5px] text-tinta">WhatsApp</h2>
          <p className="text-[12px] text-tinta-2 mt-0.5">
            Conecta un número nuevo para tu agente, o el que ya usas en la app WhatsApp Business
            (escaneando un QR): sigues usando tu app y además atiende tu agente.
          </p>
        </div>
        {cuenta?.estado === "conectado" && (
          <span className="pildora" style={{ background: "var(--exito-bg)", color: "var(--exito)" }}>
            Conectado
          </span>
        )}
      </div>

      {cuenta?.estado === "conectado" && (
        <div
          className="mt-3.5 grid gap-x-6 gap-y-2 sm:grid-cols-3 px-3 py-2.5 rounded-[6px]"
          style={{ background: "var(--card-2)", border: "1px solid var(--linea)" }}
        >
          <div>
            <div className="eyebrow">Número</div>
            <div className="text-[13px] text-tinta tnum">{cuenta.displayPhone ?? "—"}</div>
          </div>
          <div>
            <div className="eyebrow">Nombre visible</div>
            <div className="text-[13px] text-tinta">{cuenta.verifiedName ?? "—"}</div>
          </div>
          <div>
            <div className="eyebrow">Conectado el</div>
            <div className="text-[13px] text-tinta">{formatoFecha(cuenta.conectadoEn)}</div>
          </div>
        </div>
      )}

      {cuenta?.estado === "conectado" && cuenta.modo === "coexistencia" && (
        <p className="mt-2 text-[11.5px] text-tinta-2">
          Coexistencia con la app WhatsApp Business: si respondes desde tu celular, el agente se pausa
          en esa conversación por 24 h (o hasta que lo reactives en Conversaciones).
        </p>
      )}

      {avisos.length > 0 && (
        <ul
          className="mt-3 text-[11.5px] px-3 py-2 rounded-[6px] list-disc pl-6"
          style={{ background: "var(--alerta-bg)", color: "var(--tinta-2)" }}
        >
          {avisos.map((a) => <li key={a}>{a}</li>)}
        </ul>
      )}

      {error && (
        <p className="mt-3 text-[11.5px] px-2.5 py-1.5 rounded-[6px]" style={{ background: "var(--rojo-bg)", color: "var(--rojo)" }}>
          {error}
        </p>
      )}

      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        <button onClick={() => conectar("nuevo")} disabled={ocupado || !configurado}
          className={cuenta ? "btn-secundario" : "btn-primario"}>
          {ocupado && modo === "nuevo"
            ? (estado === "abriendo" ? "Abriendo Meta…" : "Conectando…")
            : cuenta ? "Cambiar a un número nuevo" : "Conectar un número nuevo"}
        </button>
        <button onClick={() => conectar("app")} disabled={ocupado || !configurado} className="btn-secundario">
          {ocupado && modo === "app"
            ? (estado === "abriendo" ? "Abriendo Meta…" : "Conectando…")
            : "Ya uso WhatsApp Business en mi celular"}
        </button>
        {!configurado && (
          <span className="text-[11.5px] text-tinta-3">Falta configurar la app de Meta en el servidor.</span>
        )}
      </div>
      <p className="mt-2 text-[11.5px] text-tinta-3">
        Con tu número de la app WhatsApp Business: ten la app actualizada en el celular; Meta te mostrará un QR para
        escanearlo desde la app. Si Meta no te ofrece esa opción, conecta un número nuevo.
      </p>
    </div>
  );
}
