// Envío de correo vía Resend (API directa, mismo patrón que el proyecto LicitaCadabra
// — supabase/functions/procesar-alertas y avisar-vencimiento-plan). Se usa en vez del
// email nativo de Supabase Auth (que depende de tener SMTP configurado, sin confirmar).
export async function enviarEmailBienvenida(params: {
  email: string;
  nombreEmpresa: string;
  linkDefinirPassword: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.error("RESEND_API_KEY o RESEND_FROM_EMAIL no configurados");
    return false;
  }

  const { email, nombreEmpresa, linkDefinirPassword } = params;

  const cuerpo = `
    <h2 style="color:#1a7a4c">Bienvenido a Cadabra CRM</h2>
    <p>Se creó el panel de <strong>${nombreEmpresa}</strong> en Cadabra CRM — el sistema que gestiona los leads que capta tu Agente WhatsApp.</p>
    <p>Para entrar, primero define tu contraseña:</p>
    <br>
    <a href="${linkDefinirPassword}"
       style="background:#1a7a4c;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold">
      Definir mi contraseña →
    </a>
    <br><br>
    <small style="color:#999">Si no esperabas este correo, puedes ignorarlo.</small>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: email,
        subject: `Bienvenido a Cadabra CRM — ${nombreEmpresa}`,
        html: cuerpo,
      }),
    });
    if (!res.ok) {
      console.error("Error Resend HTTP:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("Error enviando email de bienvenida:", e);
    return false;
  }
}
