import { adminPool } from "@/lib/db";

// Funciones de administración CROSS-TENANT (rol dashboard_admin). Cada función
// asume que quien la llama YA verificó tenant.isAdmin === true — no repiten esa
// validación aquí, así que NUNCA se exponen fuera de rutas /api/admin/*.

export type ClienteAdmin = {
  authUserId: string;
  empresa: number;
  nombreEmpresa: string;
  isAdmin: boolean;
  activo: boolean;
  plan: string | null;
  createdAt: string;
  usadas: number | null;
  limite: number | null;
  pctConsumo: number | null;
};

// Lista todos los tenants con su consumo del mes actual (para "Mis clientes").
export async function listarClientes(): Promise<ClienteAdmin[]> {
  const res = await adminPool.query(
    `SELECT
        u.auth_user_id, u.empresa, u.nombre_empresa, u.is_admin, u.activo, u.plan,
        u.created_at::text AS created_at,
        c.usadas, c.limite
       FROM public.dashboard_usuarios u
       LEFT JOIN crm.contador_conversaciones c
         ON c.empresa = u.empresa AND c.mes = to_char(CURRENT_DATE,'YYYY-MM')
      WHERE u.is_admin = false
      ORDER BY u.created_at DESC`
  );
  return res.rows.map((r) => ({
    authUserId: r.auth_user_id,
    empresa: r.empresa,
    nombreEmpresa: r.nombre_empresa,
    isAdmin: r.is_admin,
    activo: r.activo,
    plan: r.plan,
    createdAt: r.created_at,
    usadas: r.usadas !== null ? Number(r.usadas) : null,
    limite: r.limite !== null ? Number(r.limite) : null,
    pctConsumo:
      r.usadas !== null && r.limite ? Math.min(100, Math.round((Number(r.usadas) / Number(r.limite)) * 100)) : null,
  }));
}

// ⚠️ UNIDAD: mensajes de servicio del bot al mes (no conversaciones/ventanas de 24h).
// Meta cambia su cobro a por-mensaje desde 1-oct-2026 (antes cobraba por conversación,
// N mensajes del bot en una ventana de 24h = 1 solo cargo). Límites recalculados con
// factor 6x sobre los límites viejos en conversaciones, basado en el ratio real medido
// en producción (~6-7 mensajes del bot por conversación, ver memoria project_pricing_cadabra).
// TODO: la tarifa CLP/mensaje de Meta para Chile no se pudo confirmar (no está pública,
// solo en calculadora interactiva dentro de WhatsApp Manager) — el PRECIO de cada plan
// ($120k/$220k/$390k netos, en precios-referencia.md) NO se ha revalidado contra el
// costo variable real con esta nueva unidad. Estos límites son la migración de UNIDAD,
// no una confirmación de margen.
//
// 2026-09-28: estos límites pasaron a ser EL diferenciador entre planes (antes se
// diferenciaban por módulos del panel, ver plan.ts). Controla dejó de ser "ilimitado":
// a tarifa Meta estimada, 30.000 mensajes ya costaban más que la suscripción, así que
// se fijó un techo real de 25.000.
const LIMITES_PLAN: Record<string, number> = {
  Conversa: 3000,
  Convierte: 9000,
  Controla: 25000,
};

// Cambia el plan de un cliente: actualiza dashboard_usuarios.plan y el límite del
// contador del mes actual (crea la fila del mes si aún no existe).
export async function cambiarPlan(empresa: number, plan: string) {
  const limite = LIMITES_PLAN[plan] ?? LIMITES_PLAN.Conversa;

  await adminPool.query(`UPDATE public.dashboard_usuarios SET plan = $1 WHERE empresa = $2`, [plan, empresa]);

  await adminPool.query(
    `INSERT INTO crm.contador_conversaciones (empresa, mes, plan, limite, usadas, aviso_80_enviado)
     VALUES ($1, to_char(CURRENT_DATE,'YYYY-MM'), $2, $3, 0, false)
     ON CONFLICT (empresa, mes) DO UPDATE SET plan = $2, limite = $3`,
    [empresa, plan, limite]
  );
}

// Suspende/reactiva un cliente (bloquea el login sin borrar nada — getTenant()
// trata activo=false como "sin sesión").
export async function setActivo(empresa: number, activo: boolean) {
  await adminPool.query(`UPDATE public.dashboard_usuarios SET activo = $1 WHERE empresa = $2`, [activo, empresa]);
}

// Siguiente número de empresa libre (para el alta de cliente nuevo).
export async function siguienteEmpresaId(): Promise<number> {
  const res = await adminPool.query(`SELECT COALESCE(MAX(empresa), 0) + 1 AS siguiente FROM public.dashboard_usuarios`);
  return Number(res.rows[0].siguiente);
}

// Crea la fila de tenant + contador del mes + vendedor inicial + (opcional) la
// línea de WhatsApp para un cliente nuevo. El auth_user_id ya debe existir
// (creado antes con supabase.auth.admin.createUser en la API route, que usa
// service_role — fuera del alcance de este pool acotado).
export async function crearTenant(params: {
  authUserId: string;
  empresa: number;
  nombreEmpresa: string;
  plan: string;
  vendedorNombre?: string;
  vendedorWhatsapp?: string;
  phoneNumberId?: string;
  whatsappDisplay?: string;
  nombreAsistente?: string;
}) {
  const {
    authUserId,
    empresa,
    nombreEmpresa,
    plan,
    vendedorNombre,
    vendedorWhatsapp,
    phoneNumberId,
    whatsappDisplay,
    nombreAsistente,
  } = params;
  const limite = LIMITES_PLAN[plan] ?? LIMITES_PLAN.Conversa;

  await adminPool.query(
    `INSERT INTO public.dashboard_usuarios (auth_user_id, empresa, nombre_empresa, plan, is_admin, activo)
     VALUES ($1, $2, $3, $4, false, true)`,
    [authUserId, empresa, nombreEmpresa, plan]
  );

  await adminPool.query(
    `INSERT INTO crm.contador_conversaciones (empresa, mes, plan, limite, usadas, aviso_80_enviado)
     VALUES ($1, to_char(CURRENT_DATE,'YYYY-MM'), $2, $3, 0, false)`,
    [empresa, plan, limite]
  );

  if (vendedorNombre) {
    await adminPool.query(
      `INSERT INTO crm.vendedores (nombre, whatsapp, activo, empresa) VALUES ($1, $2, true, $3)`,
      [vendedorNombre, vendedorWhatsapp ?? null, empresa]
    );
  }

  // Nombre del asistente por empresa: se guarda SIEMPRE, aunque aún no haya número.
  // Con Embedded Signup el cliente conecta su WhatsApp después y el panel copia este
  // nombre a la línea (ver conexionWhatsapp.ts).
  await guardarNombreAsistente(empresa, nombreAsistente);

  // Conexión MANUAL (sin Embedded Signup): relación empresa <-> número de Meta, que
  // el bot n8n usa para resolver el tenant por phone_number_id. Solo para casos como
  // el número propio de Cadabra o un cliente conectado por acceso de socio.
  if (phoneNumberId) {
    await adminPool.query(
      `INSERT INTO public.agente_lineas_whatsapp (phone_number_id, empresa, nombre_empresa, nombre_asistente, whatsapp_display, activo)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [phoneNumberId, empresa, nombreEmpresa, nombreAsistente || "Sofía", whatsappDisplay ?? null]
    );
  }
}

export type LineaWhatsapp = {
  phoneNumberId: string;
  whatsappDisplay: string | null;
  empresa: number;
  nombreAsistente: string | null;
  activo: boolean;
};

export async function getLineaWhatsapp(empresa: number): Promise<LineaWhatsapp | null> {
  const res = await adminPool.query(
    `SELECT phone_number_id, empresa, nombre_asistente, whatsapp_display, activo
       FROM public.agente_lineas_whatsapp WHERE empresa = $1 ORDER BY activo DESC LIMIT 1`,
    [empresa]
  );
  const r = res.rows[0];
  if (!r) return null;
  return {
    phoneNumberId: r.phone_number_id,
    whatsappDisplay: r.whatsapp_display,
    empresa: r.empresa,
    nombreAsistente: r.nombre_asistente,
    activo: r.activo,
  };
}

// Crea o actualiza la línea de WhatsApp de una empresa (para completarla después
// del alta, cuando ya se tenga el phone_number_id real de Meta).
export async function upsertLineaWhatsapp(params: {
  empresa: number;
  nombreEmpresa: string;
  phoneNumberId: string;
  whatsappDisplay?: string;
  nombreAsistente?: string;
}) {
  const { empresa, nombreEmpresa, phoneNumberId, whatsappDisplay, nombreAsistente } = params;
  await adminPool.query(
    `INSERT INTO public.agente_lineas_whatsapp (phone_number_id, empresa, nombre_empresa, nombre_asistente, whatsapp_display, activo)
     VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (phone_number_id) DO UPDATE SET empresa = $2, nombre_empresa = $3, nombre_asistente = $4, whatsapp_display = $5`,
    [phoneNumberId, empresa, nombreEmpresa, nombreAsistente || "Sofía", whatsappDisplay ?? null]
  );
  await guardarNombreAsistente(empresa, nombreAsistente);
}

// Nombre del asistente de la empresa (agente_empresas_config, sql/04). Si no viene,
// deja el que ya tenía o "Sofía" por defecto.
// No lanza error: si falla (ej. sql/04 aún no ejecutado) el alta de la empresa sigue.
export async function guardarNombreAsistente(empresa: number, nombreAsistente?: string) {
  await adminPool.query(
    `INSERT INTO public.agente_empresas_config (empresa, nombre_asistente)
     VALUES ($1, COALESCE(NULLIF($2, ''), 'Sofía'))
     ON CONFLICT (empresa) DO UPDATE SET
       nombre_asistente = COALESCE(NULLIF($2, ''), public.agente_empresas_config.nombre_asistente),
       actualizado_en = now()`,
    [empresa, nombreAsistente?.trim() ?? null]
  ).catch((e) => console.error("guardarNombreAsistente:", e instanceof Error ? e.message : e));
}
