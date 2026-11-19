import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { puedeVer } from "@/lib/plan";
import { getEtapas, guardarEtapas, validar } from "@/lib/etapas";

// Etapas del tablero de Oportunidades de la empresa del usuario (ver lib/etapas.ts).
// Las edita el propio cliente: siempre se filtra por tenant.empresa, nunca por un dato del cuerpo.

async function autorizado() {
  const tenant = await getTenant();
  if (!tenant) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  if (!puedeVer(tenant, "oportunidades")) {
    return { error: NextResponse.json({ error: "No autorizado para tu plan" }, { status: 403 }) };
  }
  return { tenant };
}

export async function GET() {
  const { tenant, error } = await autorizado();
  if (error) return error;
  return NextResponse.json({ etapas: await getEtapas(tenant.empresa) });
}

export async function PUT(req: NextRequest) {
  const { tenant, error } = await autorizado();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const v = validar(body?.etapas);
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });

  const r = await guardarEtapas(tenant.empresa, v.etapas);
  if (r.error) return NextResponse.json({ error: r.error }, { status: 409 });
  return NextResponse.json({ etapas: v.etapas });
}
