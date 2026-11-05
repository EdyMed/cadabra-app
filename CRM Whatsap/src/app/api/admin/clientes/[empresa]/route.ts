import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { cambiarPlan, setActivo } from "@/lib/admin";

const PLANES_VALIDOS = ["Conversa", "Convierte", "Controla"];

export async function PATCH(req: NextRequest, { params }: { params: { empresa: string } }) {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!tenant.isAdmin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const empresa = Number(params.empresa);
  if (!Number.isInteger(empresa) || empresa <= 0) {
    return NextResponse.json({ error: "empresa inválida" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);

  if (typeof body?.plan === "string") {
    if (!PLANES_VALIDOS.includes(body.plan)) {
      return NextResponse.json({ error: "Plan inválido" }, { status: 400 });
    }
    await cambiarPlan(empresa, body.plan);
  }

  if (typeof body?.activo === "boolean") {
    await setActivo(empresa, body.activo);
  }

  return NextResponse.json({ ok: true });
}
