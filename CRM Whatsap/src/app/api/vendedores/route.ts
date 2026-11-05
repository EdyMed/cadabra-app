import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { vendedoresPool } from "@/lib/db";
import { puedeVer, topeVendedores } from "@/lib/plan";

// CRUD de vendedores. El rol dashboard_vendedores tiene CRUD completo pero SOLO
// sobre crm.vendedores (verificado en Postgres: no puede tocar crm_leads).

export async function POST(req: NextRequest) {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!puedeVer(tenant, "vendedores_config")) {
    return NextResponse.json({ error: "No autorizado para tu plan" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const nombre = String(body?.nombre ?? "").trim();
  const whatsapp = String(body?.whatsapp ?? "").trim();

  if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });

  const tope = topeVendedores(tenant.plan);
  if (!tenant.isAdmin && Number.isFinite(tope)) {
    const { rows } = await vendedoresPool.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM crm.vendedores WHERE empresa = $1 AND activo = true`,
      [tenant.empresa]
    );
    if (Number(rows[0].n) >= tope) {
      return NextResponse.json(
        {
          error: `Tu plan ${tenant.plan} permite ${tope} vendedores activos. Desactiva uno o cambia de plan para agregar más.`,
        },
        { status: 409 }
      );
    }
  }

  const res = await vendedoresPool.query(
    `INSERT INTO crm.vendedores (nombre, whatsapp, activo, empresa) VALUES ($1, $2, true, $3) RETURNING id`,
    [nombre, whatsapp, tenant.empresa]
  );

  return NextResponse.json({ ok: true, id: res.rows[0].id });
}

export async function PATCH(req: NextRequest) {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!puedeVer(tenant, "vendedores_config")) {
    return NextResponse.json({ error: "No autorizado para tu plan" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  // Reactivar también consume cupo del plan, igual que crear uno nuevo.
  if (body.activo === true) {
    const tope = topeVendedores(tenant.plan);
    if (!tenant.isAdmin && Number.isFinite(tope)) {
      const { rows } = await vendedoresPool.query<{ n: string }>(
        `SELECT COUNT(*) AS n FROM crm.vendedores WHERE empresa = $1 AND activo = true AND id <> $2`,
        [tenant.empresa, id]
      );
      if (Number(rows[0].n) >= tope) {
        return NextResponse.json(
          {
            error: `Tu plan ${tenant.plan} permite ${tope} vendedores activos. Desactiva otro para reactivar este.`,
          },
          { status: 409 }
        );
      }
    }
  }

  const campos: string[] = [];
  const valores: unknown[] = [];
  if (typeof body.nombre === "string") {
    campos.push(`nombre = $${valores.length + 1}`);
    valores.push(body.nombre.trim());
  }
  if (typeof body.whatsapp === "string") {
    campos.push(`whatsapp = $${valores.length + 1}`);
    valores.push(body.whatsapp.trim());
  }
  if (typeof body.activo === "boolean") {
    campos.push(`activo = $${valores.length + 1}`);
    valores.push(body.activo);
  }
  if (campos.length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  valores.push(id, tenant.empresa);
  const res = await vendedoresPool.query(
    `UPDATE crm.vendedores SET ${campos.join(", ")} WHERE id = $${valores.length - 1} AND empresa = $${valores.length} RETURNING id`,
    valores
  );

  if (res.rowCount === 0) {
    return NextResponse.json({ error: "Vendedor no encontrado" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(req: NextRequest) {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!puedeVer(tenant, "vendedores_config")) {
    return NextResponse.json({ error: "No autorizado para tu plan" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const res = await vendedoresPool.query(
    `DELETE FROM crm.vendedores WHERE id = $1 AND empresa = $2 RETURNING id`,
    [id, tenant.empresa]
  );

  if (res.rowCount === 0) {
    return NextResponse.json({ error: "Vendedor no encontrado" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
