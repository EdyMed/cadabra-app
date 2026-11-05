import { NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { getConversaciones } from "@/lib/metrics";

// Lista de conversaciones para el sondeo del panel: sin esto, el estado de cada
// hilo (quién espera vendedor, si el bot está activo) solo se refresca al
// recargar la página.
export async function GET() {
  const tenant = await getTenant();
  if (!tenant) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const conversaciones = await getConversaciones(tenant.empresa);
  return NextResponse.json({ conversaciones });
}
