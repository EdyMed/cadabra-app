import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { upsertLineaWhatsapp, getLineaWhatsapp } from "@/lib/admin";

export async function GET(_req: NextRequest, { params }: { params: { empresa: string } }) {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!tenant.isAdmin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const empresa = Number(params.empresa);
  if (!Number.isInteger(empresa) || empresa <= 0) {
    return NextResponse.json({ error: "empresa inválida" }, { status: 400 });
  }

  const linea = await getLineaWhatsapp(empresa);
  return NextResponse.json({ linea });
}

// Crea o actualiza la relación empresa <-> phone_number_id de Meta que usa el
// bot n8n para resolver el tenant. Se completa acá cuando el número real de
// WhatsApp Business del cliente ya esté aprobado (no siempre está el día del alta).
export async function PATCH(req: NextRequest, { params }: { params: { empresa: string } }) {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!tenant.isAdmin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const empresa = Number(params.empresa);
  if (!Number.isInteger(empresa) || empresa <= 0) {
    return NextResponse.json({ error: "empresa inválida" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const nombreEmpresa = String(body?.nombre_empresa ?? "").trim();
  const phoneNumberId = String(body?.phone_number_id ?? "").trim();
  const whatsappDisplay = body?.whatsapp_display ? String(body.whatsapp_display).trim() : undefined;
  const nombreAsistente = body?.nombre_asistente ? String(body.nombre_asistente).trim() : undefined;

  if (!nombreEmpresa) return NextResponse.json({ error: "nombre_empresa requerido" }, { status: 400 });
  if (!/^\d{6,20}$/.test(phoneNumberId)) {
    return NextResponse.json({ error: "phone_number_id inválido: solo dígitos (ID de Meta)" }, { status: 400 });
  }
  if (whatsappDisplay && !/^569\d{8}$/.test(whatsappDisplay)) {
    return NextResponse.json({ error: "WhatsApp inválido: formato 569 + 8 dígitos" }, { status: 400 });
  }

  await upsertLineaWhatsapp({ empresa, nombreEmpresa, phoneNumberId, whatsappDisplay, nombreAsistente });
  return NextResponse.json({ ok: true });
}
