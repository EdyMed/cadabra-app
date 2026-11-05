import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { getFicha, getEstado, validarFicha, guardarFicha, sincronizarCatalogo } from "@/lib/agenteConfig";

async function soloAdmin(params: { empresa: string }) {
  const tenant = await getTenant();
  if (!tenant) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  if (!tenant.isAdmin) return { error: NextResponse.json({ error: "No autorizado" }, { status: 403 }) };
  const empresa = Number(params.empresa);
  if (!Number.isInteger(empresa) || empresa <= 0) return { error: NextResponse.json({ error: "empresa inválida" }, { status: 400 }) };
  return { empresa };
}

export async function GET(_req: NextRequest, { params }: { params: { empresa: string } }) {
  const r = await soloAdmin(params);
  if ("error" in r) return r.error;
  const ficha = await getFicha(r.empresa);
  if (!ficha) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  return NextResponse.json({ ...ficha, estado: await getEstado(r.empresa) });
}

// Guarda la ficha completa (las claves que la pantalla no maneja se conservan).
export async function PUT(req: NextRequest, { params }: { params: { empresa: string } }) {
  const r = await soloAdmin(params);
  if ("error" in r) return r.error;
  const actual = await getFicha(r.empresa);
  if (!actual) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  const body = await req.json().catch(() => null);
  const { ficha, error } = validarFicha(body?.config, actual.config);
  if (error || !ficha) return NextResponse.json({ error: error ?? "Ficha inválida" }, { status: 400 });
  try {
    await guardarFicha(r.empresa, actual.nombreEmpresa, String(body?.nombre_asistente ?? actual.nombreAsistente), ficha);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo guardar" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, config: ficha, estado: await getEstado(r.empresa) });
}

// Acción: sincronizar ahora el catálogo desde la planilla.
export async function POST(req: NextRequest, { params }: { params: { empresa: string } }) {
  const r = await soloAdmin(params);
  if ("error" in r) return r.error;
  const body = await req.json().catch(() => null);
  if (body?.accion !== "sincronizar") return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  const res = await sincronizarCatalogo(r.empresa);
  return NextResponse.json({ ...res, estado: await getEstado(r.empresa) }, { status: res.ok ? 200 : 502 });
}
