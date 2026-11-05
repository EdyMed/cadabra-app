import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { getCuentaWhatsapp, conectarCuenta } from "@/lib/conexionWhatsapp";
import { MetaError } from "@/lib/whatsapp";

// Estado de la conexión de WhatsApp de la empresa del usuario (sin secretos).
export async function GET() {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  try {
    const cuenta = await getCuentaWhatsapp(tenant.empresa);
    return NextResponse.json({ cuenta });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

// Completa el Embedded Signup: recibe el código de Meta y los IDs que el cliente
// eligió en la ventana de Meta. Siempre conecta a la empresa del usuario logueado,
// nunca a una que venga en el body.
export async function POST(req: NextRequest) {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const code = String(body?.code ?? "").trim();
  const wabaId = String(body?.waba_id ?? "").trim();
  const phoneNumberId = body?.phone_number_id ? String(body.phone_number_id).trim() : null;
  const businessId = body?.business_id ? String(body.business_id).trim() : null;
  // Embedded Signup v5: is_on_biz_app = true → el número sigue en la app WhatsApp Business
  const coexistencia = body?.is_on_biz_app === true;

  if (!code || code.length > 2048) return NextResponse.json({ error: "Falta el código de Meta." }, { status: 400 });
  if (!/^\d{5,25}$/.test(wabaId)) return NextResponse.json({ error: "ID de cuenta de WhatsApp inválido." }, { status: 400 });
  if (phoneNumberId && !/^\d{5,25}$/.test(phoneNumberId)) {
    return NextResponse.json({ error: "ID de número inválido." }, { status: 400 });
  }
  if (businessId && !/^\d{5,25}$/.test(businessId)) {
    return NextResponse.json({ error: "ID de portafolio inválido." }, { status: 400 });
  }

  try {
    const resultado = await conectarCuenta({
      empresa: tenant.empresa,
      nombreEmpresa: tenant.nombreEmpresa,
      authUserId: tenant.userId,
      code,
      wabaId,
      phoneNumberId,
      businessId,
      coexistencia,
    });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    const status = e instanceof MetaError ? 502 : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo conectar." }, { status });
  }
}
