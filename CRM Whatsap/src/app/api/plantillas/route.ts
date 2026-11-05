import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { getWabaDeTenant, listarPlantillas, crearPlantilla, variablesDe, MetaError } from "@/lib/whatsapp";

const SIN_WABA =
  "Tu número de WhatsApp aún no está conectado para gestionar plantillas. Escríbenos y lo activamos.";

export async function GET() {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const cfg = await getWabaDeTenant(tenant);
    if (!cfg) return NextResponse.json({ error: SIN_WABA }, { status: 409 });
    const plantillas = await listarPlantillas(cfg);
    return NextResponse.json({ plantillas });
  } catch (e) {
    const status = e instanceof MetaError ? 502 : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status });
  }
}

// Crea una plantilla en la WABA del tenant. Meta la deja en PENDING y la revisa
// (normalmente en minutos); el estado se ve al volver a listar.
export async function POST(req: NextRequest) {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const category = String(body?.category ?? "");
  const language = String(body?.language ?? "es");
  const header = String(body?.header ?? "").trim();
  const texto = String(body?.body ?? "").trim();
  const footer = String(body?.footer ?? "").trim();
  const ejemplos: string[] = Array.isArray(body?.ejemplos) ? body.ejemplos.map((x: unknown) => String(x).trim()) : [];

  if (!/^[a-z0-9_]{1,512}$/.test(name)) {
    return NextResponse.json(
      { error: "Nombre inválido: solo minúsculas, números y guion bajo (ej: confirmacion_cita)." },
      { status: 400 }
    );
  }
  if (category !== "UTILITY" && category !== "MARKETING") {
    return NextResponse.json({ error: "Categoría inválida." }, { status: 400 });
  }
  if (!["es", "es_CL", "es_ES", "es_MX", "es_AR", "en", "en_US"].includes(language)) {
    return NextResponse.json({ error: "Idioma inválido." }, { status: 400 });
  }
  if (!texto || texto.length > 1024) {
    return NextResponse.json({ error: "El cuerpo es obligatorio y tiene un máximo de 1024 caracteres." }, { status: 400 });
  }
  if (header.length > 60 || footer.length > 60) {
    return NextResponse.json({ error: "Encabezado y pie: máximo 60 caracteres." }, { status: 400 });
  }
  if (/\{\{/.test(header) || /\{\{/.test(footer)) {
    return NextResponse.json({ error: "Por ahora las variables solo se permiten en el cuerpo." }, { status: 400 });
  }

  // Meta exige variables correlativas desde 1 y un ejemplo para cada una.
  const vars = variablesDe(texto);
  const esperadas = vars.map((_, i) => i + 1);
  if (vars.join() !== esperadas.join()) {
    return NextResponse.json(
      { error: "Las variables deben ir en orden: {{1}}, {{2}}, {{3}}…" },
      { status: 400 }
    );
  }
  if (ejemplos.length < vars.length || ejemplos.slice(0, vars.length).some((x) => !x)) {
    return NextResponse.json({ error: "Falta un valor de ejemplo para cada variable." }, { status: 400 });
  }

  try {
    const cfg = await getWabaDeTenant(tenant);
    if (!cfg) return NextResponse.json({ error: SIN_WABA }, { status: 409 });
    const creada = await crearPlantilla(cfg, {
      name,
      category,
      language,
      header: header || undefined,
      body: texto,
      bodyEjemplos: ejemplos.slice(0, vars.length),
      footer: footer || undefined,
    });
    return NextResponse.json({ ok: true, ...creada });
  } catch (e) {
    const status = e instanceof MetaError ? 502 : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status });
  }
}
