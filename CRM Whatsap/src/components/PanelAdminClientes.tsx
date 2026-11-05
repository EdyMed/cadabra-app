"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ClienteAdmin, LineaWhatsapp } from "@/lib/admin";
import { apiUrl } from "@/lib/api";

// phone_number_id = ID interno de Meta (numérico, sin formato fijo, ej. 1168256669712210).
const PHONE_NUMBER_ID_REGEX = /^\d{6,20}$/;
// WhatsApp visible del bot (número real que ve el cliente), formato chileno.
const WHATSAPP_DISPLAY_REGEX = /^569\d{8}$/;

const PLANES = ["Conversa", "Convierte", "Controla"];

function formatFecha(fecha: string) {
  return new Date(fecha).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

// Formato chileno E.164 sin '+': 56 + 9 dígitos (ej. 56912345678).
const WHATSAPP_REGEX = /^56\d{9}$/;

export default function PanelAdminClientes({ clientesIniciales }: { clientesIniciales: ClienteAdmin[] }) {
  const [clientes, setClientes] = useState(clientesIniciales);
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [editarAgente, setEditarAgente] = useState<ClienteAdmin | null>(null);
  const [error, setError] = useState<string | null>(null);


  // Vuelve a pedir la lista completa al servidor — usada tras crear/editar una
  // empresa en vez de hacer update optimista parcial (un cambio de plan afecta
  // TAMBIÉN el límite del contador vía cambiarPlan() en el backend; un merge
  // parcial {...c, ...body} dejaba "limite" con el valor viejo hasta recargar
  // la página a mano — bug visto en vivo 2026-09-28).
  async function recargarClientes() {
    try {
      const res = await fetch(apiUrl("/api/admin/clientes"));
      const data = await res.json();
      if (res.ok && Array.isArray(data.clientes)) setClientes(data.clientes);
    } catch {
      // si falla la recarga, el usuario sigue viendo la lista anterior; no es crítico
    }
  }

  async function actualizarCliente(empresa: number, body: Record<string, unknown>) {
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/admin/clientes/${empresa}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al actualizar");
      await recargarClientes();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al actualizar");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] text-tinta-3 tnum">{clientes.length} empresas</span>
        <button onClick={() => setMostrarAlta(true)} className="btn-primario">
          Nueva empresa
        </button>
      </div>

      {error && (
        <p
          className="text-[12px] px-2.5 py-2 rounded-[6px]"
          style={{ background: "var(--rojo-bg)", color: "var(--rojo)" }}
        >
          {error}
        </p>
      )}

      <div className="panel overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Plan</th>
              <th>Consumo</th>
              <th>Alta</th>
              <th>Estado</th>
              <th>Agente</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.empresa}>
                <td>
                  <span className="text-tinta font-medium">{c.nombreEmpresa}</span>
                </td>
                <td>
                  <select
                    value={c.plan ?? ""}
                    onChange={(e) => actualizarCliente(c.empresa, { plan: e.target.value })}
                    className="campo py-1 px-2 w-auto cursor-pointer"
                  >
                    {PLANES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </td>
                <td style={{ minWidth: 132 }}>
                  {c.usadas !== null ? (
                    <>
                      <div className="flex items-baseline gap-1.5 mb-1.5">
                        <span className="tnum text-tinta font-semibold text-[13px]">{c.usadas}</span>
                        <span className="tnum text-tinta-3 text-[11.5px]">/ {c.limite}</span>
                      </div>
                      <div className="barra" style={{ maxWidth: 110 }}>
                        <span
                          style={{
                            width: `${Math.min(100, c.pctConsumo ?? 0)}%`,
                            background:
                              (c.pctConsumo ?? 0) >= 80
                                ? "var(--rojo)"
                                : (c.pctConsumo ?? 0) >= 50
                                ? "var(--alerta)"
                                : "var(--verde)",
                          }}
                        />
                      </div>
                    </>
                  ) : (
                    <span className="text-tinta-3">—</span>
                  )}
                </td>
                <td>{formatFecha(c.createdAt)}</td>
                <td>
                  <span
                    className="pildora"
                    style={{
                      background: c.activo ? "var(--verde-claro)" : "var(--rojo-bg)",
                      color: c.activo ? "var(--verde)" : "var(--rojo)",
                    }}
                  >
                    {c.activo ? "Activo" : "Suspendido"}
                  </span>
                </td>
                <td>
                  <button
                    onClick={() => setEditarAgente(c)}
                    className="text-[12.5px] font-semibold transicion hover:opacity-70"
                    style={{ color: "var(--verde)" }}
                  >
                    Configurar
                  </button>
                  <Link
                    href={`/admin/agente/${c.empresa}`}
                    className="text-[12.5px] font-semibold transicion hover:opacity-70 ml-3"
                    style={{ color: "var(--verde)" }}
                  >
                    Ficha
                  </Link>
                </td>
                <td>
                  <button
                    onClick={() => actualizarCliente(c.empresa, { activo: !c.activo })}
                    className="text-[12.5px] font-semibold transicion hover:opacity-70"
                    style={{ color: c.activo ? "var(--rojo)" : "var(--verde)" }}
                  >
                    {c.activo ? "Suspender" : "Reactivar"}
                  </button>
                </td>
              </tr>
            ))}
            {clientes.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-tinta-3">
                  Aún no has dado de alta empresas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {mostrarAlta && (
        <ModalAlta
          onClose={() => setMostrarAlta(false)}
          onCreado={() => {
            recargarClientes();
            setMostrarAlta(false);
          }}
        />
      )}

      {editarAgente && (
        <ModalAgente cliente={editarAgente} onClose={() => setEditarAgente(null)} />
      )}
    </div>
  );
}

function ModalAlta({
  onClose,
  onCreado,
}: {
  onClose: () => void;
  onCreado: () => void;
}) {
  const [nombreEmpresa, setNombreEmpresa] = useState("");
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState("Convierte");
  const [vendedorNombre, setVendedorNombre] = useState("");
  const [vendedorWhatsapp, setVendedorWhatsapp] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [whatsappDisplay, setWhatsappDisplay] = useState("");
  const [nombreAsistente, setNombreAsistente] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const whatsappInvalido = vendedorWhatsapp.trim() !== "" && !WHATSAPP_REGEX.test(vendedorWhatsapp.trim());
  const phoneNumberIdInvalido = phoneNumberId.trim() !== "" && !PHONE_NUMBER_ID_REGEX.test(phoneNumberId.trim());
  const whatsappDisplayInvalido = whatsappDisplay.trim() !== "" && !WHATSAPP_DISPLAY_REGEX.test(whatsappDisplay.trim());

  async function crear() {
    if (!nombreEmpresa.trim() || !email.trim() || whatsappInvalido || phoneNumberIdInvalido || whatsappDisplayInvalido)
      return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/admin/clientes"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre_empresa: nombreEmpresa,
          email,
          plan,
          vendedor_nombre: vendedorNombre || undefined,
          vendedor_whatsapp: vendedorWhatsapp || undefined,
          phone_number_id: phoneNumberId || undefined,
          whatsapp_display: whatsappDisplay || undefined,
          nombre_asistente: nombreAsistente || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al crear el cliente");
      onCreado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear el cliente");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      className="overlay"
      onClick={onClose}
    >
      <div
        className="modal p-5 max-w-[420px]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[13px] font-semibold text-tinta mb-3.5">Nueva empresa</h2>

        <div className="flex flex-col gap-3">
          <input
            value={nombreEmpresa}
            onChange={(e) => setNombreEmpresa(e.target.value)}
            placeholder="Nombre del negocio"
            className="campo text-[13.5px] py-2"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email del dueño"
            type="email"
            className="campo text-[13.5px] py-2"
          />
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="campo text-[13.5px] py-2"
          >
            {PLANES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              value={vendedorNombre}
              onChange={(e) => setVendedorNombre(e.target.value)}
              placeholder="Vendedor inicial (opcional)"
              className="campo text-[13.5px] py-2 flex-1"
            />
            <div className="flex-1">
              <input
                value={vendedorWhatsapp}
                onChange={(e) => setVendedorWhatsapp(e.target.value)}
                placeholder="56912345678"
                inputMode="numeric"
                className={"campo text-[13.5px] py-2 " + (whatsappInvalido ? "campo-error" : "")}
              />
              {whatsappInvalido && (
                <p className="text-[11.5px] mt-1" style={{ color: "var(--rojo)" }}>
                  Formato: 56 + 9 dígitos, sin + ni espacios
                </p>
              )}
            </div>
          </div>

          <div className="pt-1 border-t" style={{ borderColor: "var(--linea)" }}>
            <p className="text-[11.5px] font-semibold text-tinta-3 uppercase tracking-wide mt-3 mb-2">
              Agente WhatsApp
            </p>
            <input
              value={nombreAsistente}
              onChange={(e) => setNombreAsistente(e.target.value)}
              placeholder="Nombre del asistente (ej. Sofía)"
              className="campo text-[13.5px] py-2 w-full"
            />
            <p className="text-[11.5px] text-tinta-3 mt-1.5">
              El cliente conecta su número desde Configuración → Conectar WhatsApp.
            </p>

            {/* Solo para números que NO pasan por Embedded Signup (el de Cadabra o
                un cliente conectado por acceso de socio). */}
            <details className="mt-3">
              <summary className="text-[12px] text-tinta-2 cursor-pointer select-none">
                Conexión manual (sin Embedded Signup)
              </summary>
              <div className="flex flex-col gap-2 mt-2">
                <div>
                  <input
                    value={whatsappDisplay}
                    onChange={(e) => setWhatsappDisplay(e.target.value)}
                    placeholder="56912345678 (WhatsApp visible)"
                    inputMode="numeric"
                    className={"campo text-[13.5px] py-2 " + (whatsappDisplayInvalido ? "campo-error" : "")}
                  />
                  {whatsappDisplayInvalido && (
                    <p className="text-[11.5px] mt-1" style={{ color: "var(--rojo)" }}>
                      Formato: 569 + 8 dígitos
                    </p>
                  )}
                </div>
                <div>
                  <input
                    value={phoneNumberId}
                    onChange={(e) => setPhoneNumberId(e.target.value)}
                    placeholder="phone_number_id de Meta (ID interno)"
                    inputMode="numeric"
                    className={"campo text-[13.5px] py-2 " + (phoneNumberIdInvalido ? "campo-error" : "")}
                  />
                  {phoneNumberIdInvalido && (
                    <p className="text-[11.5px] mt-1" style={{ color: "var(--rojo)" }}>
                      Solo dígitos
                    </p>
                  )}
                </div>
              </div>
            </details>
          </div>
        </div>

        {error && (
          <p className="text-[13px] mt-3" style={{ color: "var(--rojo)" }}>
            {error}
          </p>
        )}

        <div className="flex items-center gap-2.5 mt-5">
          <button
            onClick={crear}
            disabled={
              guardando ||
              !nombreEmpresa.trim() ||
              !email.trim() ||
              whatsappInvalido ||
              phoneNumberIdInvalido ||
              whatsappDisplayInvalido
            }
            className="btn-primario"
          >
            {guardando ? "Creando…" : "Crear e invitar"}
          </button>
          <button onClick={onClose} className="text-[13.5px] text-tinta-3 px-2">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalAgente({ cliente, onClose }: { cliente: ClienteAdmin; onClose: () => void }) {
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [whatsappDisplay, setWhatsappDisplay] = useState("");
  const [nombreAsistente, setNombreAsistente] = useState("Sofía");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneNumberIdInvalido = phoneNumberId.trim() !== "" && !PHONE_NUMBER_ID_REGEX.test(phoneNumberId.trim());
  const whatsappDisplayInvalido = whatsappDisplay.trim() !== "" && !WHATSAPP_DISPLAY_REGEX.test(whatsappDisplay.trim());

  useEffect(() => {
    fetch(apiUrl(`/api/admin/clientes/${cliente.empresa}/whatsapp`))
      .then((res) => res.json())
      .then((data: { linea: LineaWhatsapp | null }) => {
        if (data.linea) {
          setPhoneNumberId(data.linea.phoneNumberId);
          setWhatsappDisplay(data.linea.whatsappDisplay ?? "");
          setNombreAsistente(data.linea.nombreAsistente ?? "Sofía");
        }
      })
      .catch(() => setError("No se pudo cargar la configuración actual"))
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function guardar() {
    if (phoneNumberIdInvalido || !phoneNumberId.trim() || whatsappDisplayInvalido) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/admin/clientes/${cliente.empresa}/whatsapp`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre_empresa: cliente.nombreEmpresa,
          phone_number_id: phoneNumberId,
          whatsapp_display: whatsappDisplay || undefined,
          nombre_asistente: nombreAsistente || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar");
      setGuardado(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      className="overlay"
      onClick={onClose}
    >
      <div
        className="modal p-5 max-w-[420px]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[13px] font-semibold text-tinta">Agente de {cliente.nombreEmpresa}</h2>
        <p className="text-[12.5px] text-tinta-3 mb-4">
          Línea de WhatsApp Business (Meta) que el bot usa para reconocer a este cliente.
        </p>

        {cargando ? (
          <p className="text-[13px] text-tinta-3">Cargando…</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <input
                value={whatsappDisplay}
                onChange={(e) => setWhatsappDisplay(e.target.value)}
                placeholder="56912345678 (WhatsApp visible)"
                inputMode="numeric"
                className={"campo text-[13.5px] py-2 " + (whatsappDisplayInvalido ? "campo-error" : "")}
              />
              {whatsappDisplayInvalido && (
                <p className="text-[11.5px] mt-1" style={{ color: "var(--rojo)" }}>
                  Formato: 569 + 8 dígitos
                </p>
              )}
            </div>
            <div>
              <input
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                placeholder="phone_number_id de Meta (ID interno)"
                inputMode="numeric"
                className={"campo text-[13.5px] py-2 " + (phoneNumberIdInvalido ? "campo-error" : "")}
              />
              {phoneNumberIdInvalido && (
                <p className="text-[11.5px] mt-1" style={{ color: "var(--rojo)" }}>
                  Solo dígitos
                </p>
              )}
            </div>
            <input
              value={nombreAsistente}
              onChange={(e) => setNombreAsistente(e.target.value)}
              placeholder="Nombre del asistente"
              className="campo text-[13.5px] py-2"
            />
          </div>
        )}

        {error && (
          <p className="text-[13px] mt-3" style={{ color: "var(--rojo)" }}>
            {error}
          </p>
        )}
        {guardado && (
          <p className="text-[13px] mt-3" style={{ color: "var(--verde)" }}>
            Guardado correctamente.
          </p>
        )}

        <div className="flex items-center gap-2.5 mt-5">
          <button
            onClick={guardar}
            disabled={guardando || cargando || phoneNumberIdInvalido || !phoneNumberId.trim() || whatsappDisplayInvalido}
            className="btn-primario"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          <button onClick={onClose} className="text-[13.5px] text-tinta-3 px-2">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
