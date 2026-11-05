import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { empresaPool } from "@/lib/db";

// Edita el nombre de la empresa. El rol dashboard_empresa_rw solo tiene
// GRANT UPDATE(nombre_empresa) sobre dashboard_usuarios (verificado en Postgres:
// no puede tocar la columna empresa ni nada del schema crm).
export async function PATCH(req: NextRequest) {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const nombreEmpresa = String(body?.nombre_empresa ?? "").trim();

  if (!nombreEmpresa) {
    return NextResponse.json({ error: "El nombre no puede estar vacío" }, { status: 400 });
  }
  if (nombreEmpresa.length > 100) {
    return NextResponse.json({ error: "Nombre demasiado largo" }, { status: 400 });
  }

  await empresaPool.query(
    `UPDATE public.dashboard_usuarios SET nombre_empresa = $1 WHERE auth_user_id = $2`,
    [nombreEmpresa, tenant.userId]
  );

  return NextResponse.json({ ok: true, nombre_empresa: nombreEmpresa });
}
