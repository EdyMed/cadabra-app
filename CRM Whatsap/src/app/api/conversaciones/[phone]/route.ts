import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { getMensajes } from "@/lib/metrics";

export async function GET(_req: NextRequest, { params }: { params: { phone: string } }) {
  const tenant = await getTenant();
  if (!tenant) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const mensajes = await getMensajes(tenant.empresa, params.phone);
  return NextResponse.json({ mensajes });
}
