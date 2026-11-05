import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { listarClientes, crearTenant, siguienteEmpresaId } from "@/lib/admin";
import { enviarEmailBienvenida } from "@/lib/email";
import { randomBytes } from "crypto";

const PLANES_VALIDOS = ["Conversa", "Convierte", "Controla"];
// Formato chileno E.164 sin '+': 56 + 9 dígitos (ej. 56912345678).
const WHATSAPP_REGEX = /^56\d{9}$/;
// WhatsApp visible del bot (formato chileno, distinto del phone_number_id de Meta).
const WHATSAPP_DISPLAY_REGEX = /^569\d{8}$/;

export async function GET() {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!tenant.isAdmin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const clientes = await listarClientes();
  return NextResponse.json({ clientes });
}

export async function POST(req: NextRequest) {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!tenant.isAdmin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const nombreEmpresa = String(body?.nombre_empresa ?? "").trim();
  const email = String(body?.email ?? "").trim();
  const plan = String(body?.plan ?? "");
  const vendedorNombre = body?.vendedor_nombre ? String(body.vendedor_nombre).trim() : undefined;
  const vendedorWhatsapp = body?.vendedor_whatsapp ? String(body.vendedor_whatsapp).trim() : undefined;
  const phoneNumberId = body?.phone_number_id ? String(body.phone_number_id).trim() : undefined;
  const whatsappDisplay = body?.whatsapp_display ? String(body.whatsapp_display).trim() : undefined;
  const nombreAsistente = body?.nombre_asistente ? String(body.nombre_asistente).trim() : undefined;

  if (!nombreEmpresa) return NextResponse.json({ error: "El nombre de la empresa es obligatorio" }, { status: 400 });
  if (!email || !email.includes("@")) return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  if (!PLANES_VALIDOS.includes(plan)) return NextResponse.json({ error: "Plan inválido" }, { status: 400 });
  if (vendedorWhatsapp && !WHATSAPP_REGEX.test(vendedorWhatsapp)) {
    return NextResponse.json({ error: "WhatsApp inválido: formato 56 + 9 dígitos" }, { status: 400 });
  }
  if (phoneNumberId && !/^\d{6,20}$/.test(phoneNumberId)) {
    return NextResponse.json({ error: "phone_number_id inválido: solo dígitos (ID de Meta)" }, { status: 400 });
  }
  if (whatsappDisplay && !WHATSAPP_DISPLAY_REGEX.test(whatsappDisplay)) {
    return NextResponse.json({ error: "WhatsApp inválido: formato 569 + 8 dígitos" }, { status: 400 });
  }

  // 1) Crea el usuario Auth directamente (SIN enviar el email nativo de Supabase —
  // usamos Resend nosotros, mismo patrón que LicitaCadabra). Contraseña temporal
  // aleatoria: el usuario nunca la ve, define la suya propia vía el link de recovery.
  const admin = createAdminClient();
  const passwordTemporal = randomBytes(24).toString("base64url");
  const { data: creado, error: errCrear } = await admin.auth.admin.createUser({
    email,
    password: passwordTemporal,
    email_confirm: true,
  });
  if (errCrear || !creado?.user) {
    return NextResponse.json({ error: errCrear?.message ?? "No se pudo crear el usuario" }, { status: 500 });
  }

  // 2) Genera el link de "recovery" (definir contraseña) — no lo envía Supabase,
  // lo devuelve para que lo mandemos nosotros por Resend. redirectTo explícito a
  // /reset-password (pública en middleware.ts) — sin esto, Supabase usa su default
  // y el link aterriza en /login sin sesión (bug visto en vivo 2026-09-28).
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { data: linkData, error: errLink } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${appUrl}/reset-password` },
  });
  if (errLink || !linkData?.properties?.action_link) {
    return NextResponse.json(
      { error: `Usuario creado pero falló generar el link: ${errLink?.message ?? "error desconocido"}` },
      { status: 500 }
    );
  }

  // 3) Crea el tenant (dashboard_usuarios + contador del mes + vendedor inicial).
  const empresa = await siguienteEmpresaId();
  try {
    await crearTenant({
      authUserId: creado.user.id,
      empresa,
      nombreEmpresa,
      plan,
      vendedorNombre,
      vendedorWhatsapp,
      phoneNumberId,
      whatsappDisplay,
      nombreAsistente,
    });
  } catch (e) {
    // Si falla la creación del tenant, el usuario Auth ya quedó creado — se
    // reporta el error para que el admin decida si reintentar (hay que borrar
    // el usuario Auth desde el dashboard de Supabase antes de reintentar con
    // el mismo email, porque el email es único).
    return NextResponse.json(
      { error: `Usuario creado pero falló crear el tenant: ${e instanceof Error ? e.message : "error desconocido"}` },
      { status: 500 }
    );
  }

  // 4) Envía el correo de bienvenida por Resend con el link para definir contraseña.
  const enviado = await enviarEmailBienvenida({
    email,
    nombreEmpresa,
    linkDefinirPassword: linkData.properties.action_link,
  });

  return NextResponse.json({ ok: true, empresa, emailEnviado: enviado });
}
