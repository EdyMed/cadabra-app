import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { getConversaciones } from "@/lib/metrics";
import { getFicha } from "@/lib/agenteConfig";
import PanelConversaciones from "@/components/PanelConversaciones";

export const dynamic = "force-dynamic";

export default async function ConversacionesPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");

  const [conversaciones, ficha] = await Promise.all([
    getConversaciones(tenant.empresa),
    getFicha(tenant.empresa).catch(() => null),
  ]);

  return (
    <main className="px-5 py-5 max-w-[1400px] aparecer">
      <div className="mb-4">
        <h1 className="titulo-pagina">Conversaciones</h1>
        <p className="text-tinta-2 text-[12px] mt-0.5">Historial de mensajes con tus leads.</p>
      </div>
      <PanelConversaciones conversaciones={conversaciones} asistente={ficha?.nombreAsistente ?? "Asistente"} />
    </main>
  );
}
