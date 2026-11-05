"use client";

import { useState } from "react";
import { apiUrl } from "@/lib/api";
import type { FichaAgente, EstadoAgente, Boton } from "@/lib/agenteConfig";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function Seccion({ titulo, ayuda, children, abierta = true }: { titulo: string; ayuda?: string; children: React.ReactNode; abierta?: boolean }) {
  return (
    <details open={abierta} className="panel p-4 group">
      <summary className="cursor-pointer select-none list-none flex items-center justify-between">
        <span>
          <span className="font-semibold text-[13px] text-tinta">{titulo}</span>
          {ayuda && <span className="block text-[11.5px] text-tinta-3 mt-0.5">{ayuda}</span>}
        </span>
        <span className="text-tinta-3 text-[12px] group-open:rotate-180 transicion">▾</span>
      </summary>
      <div className="mt-3.5 flex flex-col gap-3">{children}</div>
    </details>
  );
}

function Campo({ label, ayuda, children }: { label: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="eyebrow">{label}</span>
      {children}
      {ayuda && <span className="text-[11px] text-tinta-3">{ayuda}</span>}
    </label>
  );
}

function Pildora({ ok, texto }: { ok: boolean | null; texto: string }) {
  const c = ok === null ? { bg: "rgba(255,255,255,.05)", fg: "var(--tinta-3)" } : ok ? { bg: "var(--exito-bg)", fg: "var(--exito)" } : { bg: "var(--alerta-bg)", fg: "var(--alerta)" };
  return <span className="pildora" style={{ background: c.bg, color: c.fg }}>{texto}</span>;
}

export default function EditorAgente({
  empresa, nombreEmpresa, nombreAsistenteInicial, configInicial, estadoInicial,
}: {
  empresa: number; nombreEmpresa: string; nombreAsistenteInicial: string; configInicial: FichaAgente; estadoInicial: EstadoAgente;
}) {
  const [cfg, setCfg] = useState<FichaAgente>(() => ({
    ...configInicial,
    fuentes: configInicial.fuentes?.catalogo ? configInicial.fuentes : { ...(configInicial.fuentes ?? {}), catalogo: { tipo: "erp_supabase" } },
  }));
  const [asistente, setAsistente] = useState(nombreAsistenteInicial);
  const [estado, setEstado] = useState(estadoInicial);
  const [guardando, setGuardando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  // Actualiza una rama de la ficha: set("negocio", { descripcion: "…" })
  function set<K extends keyof FichaAgente>(rama: K, cambios: Record<string, unknown>) {
    setCfg((c) => ({ ...c, [rama]: { ...((c[rama] as object) ?? {}), ...cambios } }));
  }
  const neg = cfg.negocio ?? {}, tono = cfg.tono ?? {}, cat = cfg.catalogo ?? {}, ag = cfg.agenda ?? {}, menu = cfg.menu ?? {};
  const fuente = cfg.fuentes?.catalogo ?? { tipo: "erp_supabase" as const };
  const negocioConfigurado = cfg.configurado !== false && !!(neg.descripcion ?? "").trim();

  async function guardar() {
    setGuardando(true); setAviso(null);
    try {
      const res = await fetch(apiUrl(`/api/admin/agente/${empresa}`), {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre_asistente: asistente, config: cfg }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      setCfg({ ...data.config, fuentes: data.config.fuentes });
      setEstado(data.estado);
      setAviso({ ok: true, texto: "Ficha guardada. El agente la usa desde el próximo mensaje." });
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof Error ? e.message : "No se pudo guardar" });
    } finally { setGuardando(false); }
  }

  async function sincronizar() {
    setSincronizando(true); setAviso(null);
    try {
      const res = await fetch(apiUrl(`/api/admin/agente/${empresa}`), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "sincronizar" }),
      });
      const data = await res.json();
      if (data.estado) setEstado(data.estado);
      setAviso({ ok: !!data.ok, texto: data.mensaje ?? data.error ?? "Error" });
    } catch {
      setAviso({ ok: false, texto: "No se pudo sincronizar" });
    } finally { setSincronizando(false); }
  }

  // Listas editables genéricas
  function editarLista<T>(rama: "faq" | "sinonimos" | "categorias", lista: T[], i: number, cambio: Partial<T> | null) {
    const nueva = cambio === null ? lista.filter((_, j) => j !== i) : lista.map((x, j) => (j === i ? { ...x, ...cambio } : x));
    if (rama === "faq") setCfg((c) => ({ ...c, faq: nueva as any }));
    if (rama === "sinonimos") set("catalogo", { sinonimos: nueva });
    if (rama === "categorias") set("interes", { categorias: nueva });
  }
  const faq = cfg.faq ?? [];
  const sinonimos = cat.sinonimos ?? [];
  const categorias = cfg.interes?.categorias ?? [];

  function Botones({ campo }: { campo: "botones_owner" | "botones_cliente" }) {
    const lista: Boton[] = (menu[campo] as Boton[] | undefined) ?? [];
    const filas = [0, 1, 2].map((i) => lista[i] ?? { id: "", title: "" });
    return (
      <div className="grid gap-1.5">
        {filas.map((b, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr] gap-2">
            <input className="campo" placeholder="id (ej. ver_productos)" value={b.id}
              onChange={(e) => { const n = [...filas]; n[i] = { ...b, id: e.target.value }; set("menu", { [campo]: n.filter((x) => x.id || x.title) }); }} />
            <input className="campo" placeholder="Texto del botón (máx. 20)" maxLength={20} value={b.title}
              onChange={(e) => { const n = [...filas]; n[i] = { ...b, title: e.target.value }; set("menu", { [campo]: n.filter((x) => x.id || x.title) }); }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5 pb-24">
      {/* Estado */}
      <div className="panel p-4 grid gap-3 sm:grid-cols-3">
        <div>
          <div className="eyebrow mb-1">WhatsApp</div>
          {estado.whatsapp?.conectado
            ? <><Pildora ok texto="Conectado" /> <span className="text-[12px] text-tinta-2 ml-1 tnum">{estado.whatsapp.numero}</span></>
            : <Pildora ok={false} texto="Sin conectar" />}
        </div>
        <div>
          <div className="eyebrow mb-1">Negocio</div>
          {negocioConfigurado ? <Pildora ok texto="Configurado" /> : <Pildora ok={false} texto="Pendiente: falta la descripción" />}
        </div>
        <div>
          <div className="eyebrow mb-1">Catálogo</div>
          {fuente.tipo === "erp_supabase"
            ? <Pildora ok={null} texto="ERP de la empresa" />
            : <>
                <Pildora ok={estado.catalogo.ultimaSync ? estado.catalogo.ultimaSync.ok : null}
                  texto={`${estado.catalogo.productos} productos`} />
                {estado.catalogo.ultimaSync && (
                  <span className="block text-[11px] text-tinta-3 mt-1">
                    Última sync: {new Date(estado.catalogo.ultimaSync.fecha).toLocaleString("es-CL")}
                    {!estado.catalogo.ultimaSync.ok && ` · ${estado.catalogo.ultimaSync.mensaje}`}
                  </span>
                )}
              </>}
        </div>
      </div>

      <Seccion titulo="Asistente y negocio" ayuda="La descripción es lo mínimo para que el agente atienda. Sin ella responde que el negocio está pendiente.">
        <div className="grid sm:grid-cols-2 gap-3">
          <Campo label="Nombre del asistente"><input className="campo" value={asistente} maxLength={40} onChange={(e) => setAsistente(e.target.value)} /></Campo>
          <Campo label="Horario de atención"><input className="campo" placeholder="lunes a viernes de 9:00 a 18:00" value={neg.horario ?? ""} onChange={(e) => set("negocio", { horario: e.target.value })} /></Campo>
        </div>
        <Campo label="Descripción del negocio *" ayuda={`Se lee como: "Eres ${asistente}, la asistente por WhatsApp de ${nombreEmpresa}, [descripción]". Incluye qué vende, a quién y qué hace el agente.`}>
          <textarea className="campo min-h-[90px] py-2" value={neg.descripcion ?? ""} onChange={(e) => set("negocio", { descripcion: e.target.value })}
            placeholder="una ferretería de barrio que vende herramientas y materiales a maestros y vecinos. Respondes consultas de productos y precios…" />
        </Campo>
        <div className="grid sm:grid-cols-2 gap-3">
          <Campo label="Dirección"><input className="campo" value={neg.direccion ?? ""} onChange={(e) => set("negocio", { direccion: e.target.value })} /></Campo>
          <Campo label="Medios de pago"><input className="campo" value={neg.pagos ?? ""} onChange={(e) => set("negocio", { pagos: e.target.value })} /></Campo>
          <Campo label="Despacho / delivery"><input className="campo" value={neg.despacho ?? ""} onChange={(e) => set("negocio", { despacho: e.target.value })} /></Campo>
          <Campo label="Pedido mínimo"><input className="campo" value={neg.pedido_minimo ?? ""} onChange={(e) => set("negocio", { pedido_minimo: e.target.value })} /></Campo>
        </div>
        <Campo label="Políticas (cambios, devoluciones, garantías)"><textarea className="campo min-h-[60px] py-2" value={neg.politicas ?? ""} onChange={(e) => set("negocio", { politicas: e.target.value })} /></Campo>
        <Campo label="Lo que el agente NUNCA debe prometer"><input className="campo" placeholder="descuentos ni plazos de entrega sin consultar a un vendedor" value={neg.no_prometer ?? ""} onChange={(e) => set("negocio", { no_prometer: e.target.value })} /></Campo>
        <label className="flex items-center gap-2 text-[12px] text-tinta-2">
          <input type="checkbox" checked={cfg.configurado === false} onChange={(e) => setCfg((c) => ({ ...c, configurado: e.target.checked ? false : undefined }))} />
          Mantener el negocio en "pendiente" (el agente no responde consultas aunque haya descripción)
        </label>
      </Seccion>

      <Seccion titulo="Tono" ayuda="Cómo habla el agente.">
        <div className="grid sm:grid-cols-3 gap-3">
          <Campo label="Trato">
            <select className="campo" value={tono.trato ?? "tu"} onChange={(e) => set("tono", { trato: e.target.value })}>
              <option value="tu">Tú (cercano)</option><option value="usted">Usted (formal)</option>
            </select>
          </Campo>
          <Campo label="Emojis permitidos"><input className="campo" placeholder="😊" value={tono.emojis ?? ""} onChange={(e) => set("tono", { emojis: e.target.value })} /></Campo>
        </div>
        <Campo label="Saludo de bienvenida" ayuda="Usa {asistente} y {empresa} para insertar los nombres."><input className="campo" value={tono.saludo ?? ""} onChange={(e) => set("tono", { saludo: e.target.value })} placeholder="'¡Hola! 😊 Soy {asistente}. ¿En qué te puedo ayudar?'" /></Campo>
        <details>
          <summary className="text-[12px] text-tinta-2 cursor-pointer">Texto de tono avanzado (reemplaza todo lo anterior)</summary>
          <textarea className="campo min-h-[160px] py-2 mt-2 font-mono text-[11.5px]" value={tono.texto ?? ""} onChange={(e) => set("tono", { texto: e.target.value })} />
        </details>
      </Seccion>

      <Seccion titulo="Catálogo" ayuda="De dónde salen los productos y precios, y cómo los presenta el agente.">
        <div className="grid sm:grid-cols-3 gap-3">
          <Campo label="Fuente del catálogo">
            <select className="campo" value={fuente.tipo} onChange={(e) => setCfg((c) => ({ ...c, fuentes: { ...(c.fuentes ?? {}), catalogo: { ...fuente, tipo: e.target.value as any } } }))}>
              <option value="erp_supabase">ERP de la empresa (base de datos)</option>
              <option value="google_sheets">Planilla de Google Sheets</option>
              <option value="tabla_cadabra">Tabla cargada por Cadabra</option>
            </select>
          </Campo>
          {fuente.tipo === "google_sheets" && <>
            <Campo label="Sincronizar cada (horas)"><input type="number" min={1} max={168} className="campo" value={fuente.frecuencia_horas ?? 6} onChange={(e) => setCfg((c) => ({ ...c, fuentes: { ...(c.fuentes ?? {}), catalogo: { ...fuente, frecuencia_horas: Number(e.target.value) } } }))} /></Campo>
            <div className="flex items-end">
              <button type="button" onClick={sincronizar} disabled={sincronizando} className="btn-secundario w-full">{sincronizando ? "Sincronizando…" : "Sincronizar ahora"}</button>
            </div>
          </>}
        </div>
        {fuente.tipo === "google_sheets" && (
          <Campo label="Enlace de la planilla" ayuda='Compartida como "Cualquier persona con el enlace → Lector". Guarda la ficha antes de sincronizar.'>
            <input className="campo" placeholder="https://docs.google.com/spreadsheets/d/…" value={fuente.sheet_id ?? ""}
              onChange={(e) => setCfg((c) => ({ ...c, fuentes: { ...(c.fuentes ?? {}), catalogo: { ...fuente, sheet_id: e.target.value } } }))} />
          </Campo>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          <Campo label="Categorías para mostrar" ayuda="Las que el agente nombra cuando preguntan qué venden."><input className="campo" placeholder="Herramientas, Pinturas, Gasfitería" value={cat.categorias_menu ?? ""} onChange={(e) => set("catalogo", { categorias_menu: e.target.value })} /></Campo>
          <Campo label="Unidad de venta"><input className="campo" placeholder="unidad, docena, kg…" value={cat.unidad ?? ""} onChange={(e) => set("catalogo", { unidad: e.target.value })} /></Campo>
        </div>
        <Campo label="Disponibilidad" ayuda="Qué decir sobre el stock."><input className="campo" placeholder="los productos se fabrican al pedido; para grandes volúmenes confirmar con un vendedor" value={cat.disponibilidad ?? ""} onChange={(e) => set("catalogo", { disponibilidad: e.target.value })} /></Campo>
        <div>
          <span className="eyebrow">Sinónimos (lo que dice el cliente → qué buscar)</span>
          <div className="grid gap-1.5 mt-1">
            {sinonimos.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <input className="campo" placeholder="algo dulce" value={s.dice} onChange={(e) => editarLista("sinonimos", sinonimos, i, { dice: e.target.value })} />
                <input className="campo" placeholder="pasteles" value={s.buscar} onChange={(e) => editarLista("sinonimos", sinonimos, i, { buscar: e.target.value })} />
                <button type="button" className="text-tinta-3 hover:text-rojo px-1" onClick={() => editarLista("sinonimos", sinonimos, i, null)}>×</button>
              </div>
            ))}
            <button type="button" className="text-[12px] text-verde self-start" onClick={() => set("catalogo", { sinonimos: [...sinonimos, { dice: "", buscar: "" }] })}>+ Agregar sinónimo</button>
          </div>
        </div>
        <details>
          <summary className="text-[12px] text-tinta-2 cursor-pointer">Texto de catálogo avanzado (reemplaza las reglas genéricas)</summary>
          <textarea className="campo min-h-[200px] py-2 mt-2 font-mono text-[11.5px]" value={cat.texto ?? ""} onChange={(e) => set("catalogo", { texto: e.target.value })} />
        </details>
      </Seccion>

      <Seccion titulo="Preguntas frecuentes" ayuda="El agente responde estas preguntas con tu texto exacto." abierta={faq.length > 0}>
        {faq.map((f, i) => (
          <div key={i} className="grid sm:grid-cols-[1fr_1.4fr_auto] gap-2">
            <input className="campo" placeholder="¿Hacen despacho?" value={f.p} onChange={(e) => editarLista("faq", faq, i, { p: e.target.value })} />
            <input className="campo" placeholder="Sí, en Santiago centro…" value={f.r} onChange={(e) => editarLista("faq", faq, i, { r: e.target.value })} />
            <button type="button" className="text-tinta-3 hover:text-rojo px-1" onClick={() => editarLista("faq", faq, i, null)}>×</button>
          </div>
        ))}
        <button type="button" className="text-[12px] text-verde self-start" onClick={() => setCfg((c) => ({ ...c, faq: [...faq, { p: "", r: "" }] }))}>+ Agregar pregunta</button>
      </Seccion>

      <Seccion titulo="Agenda" ayuda="Citas que el agente agenda en Google Calendar.">
        <label className="flex items-center gap-2 text-[12.5px] text-tinta">
          <input type="checkbox" checked={ag.activa !== false} onChange={(e) => set("agenda", { activa: e.target.checked })} /> El agente agenda citas
        </label>
        {ag.activa !== false && <>
          <div className="grid sm:grid-cols-4 gap-3">
            <Campo label="Tipo de cita"><input className="campo" placeholder="reunión, visita, cita" value={ag.tipo ?? ""} onChange={(e) => set("agenda", { tipo: e.target.value })} /></Campo>
            <Campo label="Duración (min)"><input type="number" min={10} max={480} className="campo" value={ag.duracion_min ?? 60} onChange={(e) => set("agenda", { duracion_min: Number(e.target.value) })} /></Campo>
            <Campo label="Desde"><input type="time" className="campo" value={ag.hora_inicio ?? ""} onChange={(e) => set("agenda", { hora_inicio: e.target.value })} /></Campo>
            <Campo label="Hasta"><input type="time" className="campo" value={ag.hora_fin ?? ""} onChange={(e) => set("agenda", { hora_fin: e.target.value })} /></Campo>
          </div>
          <div>
            <span className="eyebrow">Días disponibles (vacío = todos)</span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {DIAS.map((d, i) => {
                const on = (ag.dias ?? []).includes(i);
                return (
                  <button key={d} type="button" className="pildora transicion"
                    style={{ background: on ? "var(--verde-claro)" : "rgba(255,255,255,.05)", color: on ? "var(--verde)" : "var(--tinta-3)" }}
                    onClick={() => set("agenda", { dias: on ? (ag.dias ?? []).filter((x) => x !== i) : [...(ag.dias ?? []), i].sort() })}>{d}</button>
                );
              })}
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <Campo label="Anticipación mínima (horas)"><input type="number" min={0} className="campo" value={ag.anticipacion_horas ?? 0} onChange={(e) => set("agenda", { anticipacion_horas: Number(e.target.value) })} /></Campo>
            <Campo label="Correo del negocio (copia)"><input className="campo" type="email" value={ag.correo_negocio ?? ""} onChange={(e) => set("agenda", { correo_negocio: e.target.value })} /></Campo>
            <Campo label="Calendario" ayuda='"primary" = el de Cadabra. O el correo del calendario que compartió el cliente.'><input className="campo" value={ag.calendar_id ?? "primary"} onChange={(e) => set("agenda", { calendar_id: e.target.value })} /></Campo>
          </div>
          <label className="flex items-center gap-2 text-[12.5px] text-tinta">
            <input type="checkbox" checked={ag.pide_correo !== false} onChange={(e) => set("agenda", { pide_correo: e.target.checked })} /> Pedir el correo del cliente (para enviarle la invitación)
          </label>
          <Campo label="Lugar"><input className="campo" placeholder="Av. Siempre Viva 742 / Online" value={ag.lugar ?? ""} onChange={(e) => set("agenda", { lugar: e.target.value })} /></Campo>
          <Campo label="Mensaje de confirmación" ayuda="Usa {tipo}, {fecha}, {hora} y {correo}. Vacío = mensaje estándar."><input className="campo" value={ag.mensaje_confirmacion ?? ""} onChange={(e) => set("agenda", { mensaje_confirmacion: e.target.value })} /></Campo>
        </>}
      </Seccion>

      <Seccion titulo="Interés para el CRM" ayuda="Clasifica automáticamente el producto de interés del lead." abierta={false}>
        {categorias.map((c, i) => (
          <div key={i} className="grid sm:grid-cols-[1fr_2fr_auto] gap-2">
            <input className="campo" placeholder="Herramientas" value={c.nombre} onChange={(e) => editarLista("categorias", categorias, i, { nombre: e.target.value })} />
            <input className="campo font-mono text-[12px]" placeholder="taladro|martillo|sierra" value={c.regex} onChange={(e) => editarLista("categorias", categorias, i, { regex: e.target.value })} />
            <button type="button" className="text-tinta-3 hover:text-rojo px-1" onClick={() => editarLista("categorias", categorias, i, null)}>×</button>
          </div>
        ))}
        <button type="button" className="text-[12px] text-verde self-start" onClick={() => set("interes", { categorias: [...categorias, { nombre: "", regex: "" }] })}>+ Agregar categoría</button>
        <span className="text-[11px] text-tinta-3">Palabras clave separadas por | (barra vertical). Sin categorías, el lead se registra como "Otro".</span>
      </Seccion>

      <Seccion titulo="Escalamiento y menú" abierta={false}>
        <Campo label="Cuándo derivar a un vendedor"><textarea className="campo min-h-[60px] py-2" value={cfg.escalamiento ?? ""} onChange={(e) => setCfg((c) => ({ ...c, escalamiento: e.target.value }))}
          placeholder="Ofrece derivar a un vendedor cuando el cliente quiera cerrar un pedido, negociar o tenga un reclamo." /></Campo>
        <Campo label="Texto del menú para clientes"><input className="campo" value={menu.texto_cliente ?? ""} onChange={(e) => set("menu", { texto_cliente: e.target.value })} /></Campo>
        <Botones campo="botones_cliente" />
        <Campo label="Texto del menú para el dueño"><input className="campo" value={menu.texto_owner ?? ""} onChange={(e) => set("menu", { texto_owner: e.target.value })} /></Campo>
        <Botones campo="botones_owner" />
      </Seccion>

      {/* Barra fija de guardado */}
      <div className="fixed bottom-0 left-[196px] right-0 px-5 py-3 flex items-center gap-3 border-t"
        style={{ background: "var(--sidebar-bg)", borderColor: "var(--linea)" }}>
        <button onClick={guardar} disabled={guardando} className="btn-primario">{guardando ? "Guardando…" : "Guardar ficha"}</button>
        {aviso && <span className="text-[12px]" style={{ color: aviso.ok ? "var(--exito)" : "var(--rojo)" }}>{aviso.texto}</span>}
      </div>
    </div>
  );
}
