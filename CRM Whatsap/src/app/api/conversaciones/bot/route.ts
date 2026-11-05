import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { writePool } from "@/lib/db";

// Enciende o apaga el bot para UNA conversación (crm_leads.bot_activo).
// El bot se apaga solo cuando el cliente pide un vendedor; esta ruta es la
// única forma de volver a encenderlo sin entrar a la base de datos.
export async function PATCH(req: NextRequest) {
  const tenant = await getTenant();
  if (!tenant) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const phone = String(body?.phone ?? "").trim();
  const activo = body?.activo;

  if (!/^\d{8,15}$/.test(phone)) {
    return NextResponse.json({ error: "Teléfono inválido" }, { status: 400 });
  }
  if (typeof activo !== "boolean") {
    return NextResponse.json({ error: "activo debe ser booleano" }, { status: 400 });
  }

  let res;
  try {
    res = await writePool.query(
      `UPDATE crm.crm_leads
          SET bot_activo = $1
        WHERE contact_id::text = $2 AND empresa = $3
        RETURNING id, bot_activo`,
      [activo, phone, tenant.empresa]
    );
  } catch (e) {
    // 42501 = permiso denegado. El rol necesita GRANT UPDATE(bot_activo).
    const code = (e as { code?: string })?.code;
    if (code === "42501") {
      return NextResponse.json(
        { error: "La base de datos no permite cambiar bot_activo. Falta el GRANT UPDATE(bot_activo) para el rol del panel." },
        { status: 500 }
      );
    }
    throw e;
  }

  if (res.rowCount === 0) {
    return NextResponse.json({ error: "No existe un lead con ese teléfono" }, { status: 404 });
  }

  // Coexistencia: reactivar desde el panel también levanta la pausa de 24 h que se
  // puso cuando el dueño respondió desde la app (sql/09). Si la tabla aún no existe, se ignora.
  if (activo) {
    await writePool
      .query(`DELETE FROM public.bot_pausas WHERE empresa = $1 AND contact_id = $2`, [tenant.empresa, phone])
      .catch(() => {});
  }

  return NextResponse.json({ ok: true, bot_activo: res.rows[0].bot_activo });
}
