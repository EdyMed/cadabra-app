import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { writePool } from "@/lib/db";
import { ESTADOS_ORDEN } from "@/lib/metrics";
import { puedeVer } from "@/lib/plan";

// Actualiza estado_crm de un lead (drag-and-drop del tablero de Oportunidades).
// El rol dashboard_rw solo tiene GRANT UPDATE(estado_crm) sobre crm.crm_leads
// (verificado: no puede INSERT/DELETE ni tocar otras columnas) — esta ruta es
// defensa en profundidad adicional: valida el estado contra la lista permitida
// y filtra por la empresa del tenant autenticado.
export async function PATCH(req: NextRequest) {
  const tenant = await getTenant();
  if (!tenant) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!puedeVer(tenant, "oportunidades")) {
    return NextResponse.json({ error: "No autorizado para tu plan" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  const estado = String(body?.estado ?? "");

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }
  if (!ESTADOS_ORDEN.includes(estado)) {
    return NextResponse.json({ error: "estado inválido" }, { status: 400 });
  }

  const res = await writePool.query(
    `UPDATE crm.crm_leads SET estado_crm = $1 WHERE id = $2 AND empresa = $3 RETURNING id`,
    [estado, id, tenant.empresa]
  );

  if (res.rowCount === 0) {
    return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id });
}
