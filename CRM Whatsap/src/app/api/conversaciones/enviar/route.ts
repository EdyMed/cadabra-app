import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { writePool } from "@/lib/db";

// Envía un mensaje del vendedor al cliente por WhatsApp.
// No habla con Meta directamente: delega en un webhook de n8n, que ya tiene las
// credenciales de la Cloud API y el nodo de envío probado en producción.
// n8n también escribe el mensaje en conversation_history con role='vendedor'.
export async function POST(req: NextRequest) {
  const tenant = await getTenant();
  if (!tenant) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const webhook = process.env.N8N_ENVIAR_WEBHOOK_URL;
  if (!webhook) {
    return NextResponse.json(
      { error: "Falta configurar N8N_ENVIAR_WEBHOOK_URL" },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  const phone = String(body?.phone ?? "").trim();
  const texto = String(body?.texto ?? "").trim();

  if (!/^\d{8,15}$/.test(phone)) {
    return NextResponse.json({ error: "Teléfono inválido" }, { status: 400 });
  }
  if (!texto) {
    return NextResponse.json({ error: "El mensaje está vacío" }, { status: 400 });
  }
  if (texto.length > 4000) {
    return NextResponse.json({ error: "El mensaje supera los 4000 caracteres" }, { status: 400 });
  }

  const res = await fetch(webhook, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.N8N_ENVIAR_WEBHOOK_TOKEN
        ? { Authorization: `Bearer ${process.env.N8N_ENVIAR_WEBHOOK_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({ empresa: tenant.empresa, phone, texto }),
  }).catch(() => null);

  if (!res || !res.ok) {
    return NextResponse.json(
      { error: "No se pudo enviar el mensaje. Revisa el workflow de n8n." },
      { status: 502 }
    );
  }

  // El vendedor ya respondió: la conversación deja de estar pendiente. Si falla,
  // el mensaje igual se envió, así que no se devuelve error.
  try {
    await writePool.query(
      `UPDATE crm.crm_leads
          SET estado_crm = 'En Conversación'
        WHERE contact_id::text = $1 AND empresa = $2 AND estado_crm = 'Requiere Vendedor'`,
      [phone, tenant.empresa]
    );
  } catch {
    // sin permisos o sin lead: no bloquea el envío
  }

  return NextResponse.json({ ok: true });
}
